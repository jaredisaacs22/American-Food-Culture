// Dispatch simulation math. Pure functions (Node-testable).
//
// Model (flagged assumptions, surfaced in the UI):
// - Peak-aware threshold dispatch: each day the battery reserves its stored
//   energy for that day's peak. The day's discharge threshold is the lowest
//   flat level the current SOC can hold (achievableLevel), floored at the
//   month target — so it shaves the top off the peak instead of draining on
//   the shoulders. Charge whenever load is below the month target (within
//   charge windows), capped so charging NEVER pushes demand above the target.
//   This makes the simulated reduction reconcile with the sizing estimate
//   (which assumes optimal daily dispatch).
// - Round-trip losses are applied entirely on the charging side: grid kWh ×
//   efficiency goes into storage; discharge draws 1:1 from storage. Total
//   losses are identical to splitting the efficiency across both legs.
// - Battery starts the year full. Usable energy = nameplate kWh.
// - One aggregate battery per interval either charges or discharges, never
//   both — so the simultaneous-charge/discharge unit flag is structurally
//   honored. canParallel is enforced upstream in candidate generation.
// - Monthly target level = max(month average, month peak − shave kW) — the
//   SAME definition as sizing (see monthTargetLevel), so dispatch results
//   reconcile with the sizing capture estimate.

import { monthTargetLevel, achievableLevel } from '../sizing/calc.js';
import { monthEnergyRates } from '../tariffs/calc.js';

const STEP_HOURS = 0.25;
const STEP_MS = 15 * 60000;

export function defaultDispatchParams() {
  return {
    roundTripEfficiency: 0.88,
    maxChargeKw: null, // null = use the config's aggregate max charge rate
    chargeWindows: [], // [{startHour, endHour}] hours 0-24; empty = any time
  };
}

export function hourInWindows(h, windows) {
  if (!windows || !windows.length) return true;
  return windows.some((w) =>
    w.startHour <= w.endHour ? h >= w.startHour && h < w.endHour : h >= w.startHour || h < w.endHour);
}

function monthKeyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function newMonthRecord(key, targetKw) {
  return {
    key,
    targetKw,
    rawPeakKw: 0,
    shavedPeakKw: 0,
    dischargeKwh: 0,
    chargeKwh: 0, // grid-side (includes round-trip losses)
    missedIntervals: 0,
    missedEvents: 0,
    worstShortfallKw: 0,
    dischargeByHour: new Array(24).fill(0),
    chargeByHour: new Array(24).fill(0),
    rawPeakByHour: new Array(24).fill(0),
    shavedPeakByHour: new Array(24).fill(0),
  };
}

/**
 * Simulate the config against the FULL normalized year.
 * Returns { monthly, annual, series: { shavedKw, soc } }.
 * `series` is large — persist monthly/annual only and recompute series on demand.
 */
export function simulateDispatch(normalized, analysis, config, shaveKw, params) {
  const eff = params.roundTripEfficiency;
  if (!(eff > 0 && eff <= 1)) throw new Error(`round-trip efficiency out of range: ${eff}`);
  const chargeCap = Math.min(params.maxChargeKw || Infinity, config.maxChargeKw || config.kw);
  const windows = params.chargeWindows || [];

  // TOU-awareness: when a tariff is supplied the battery charges only during
  // the cheapest (off-peak) hours and — if the price spread beats round-trip
  // losses — discharges spare energy during the priciest (on-peak) hours to
  // capture energy arbitrage, on top of peak shaving. Without a tariff it falls
  // back to price-blind charging (any hour below target, within charge windows).
  const tariff = params.tariff || null;
  const arbitrageOn = tariff ? params.arbitrage !== false : false;
  const rateCache = new Map();
  const rateInfo = (mk) => {
    let r = rateCache.get(mk);
    if (!r) { r = monthEnergyRates(tariff, mk); rateCache.set(mk, r); }
    return r;
  };

  const targets = new Map(analysis.monthly.map((m) => [m.key, monthTargetLevel(m, shaveKw)]));

  const { startMs, kw } = normalized;
  const n = kw.length;
  const shaved = new Float64Array(n);
  const socSeries = new Float64Array(n);

  // Day boundaries (local calendar days) so we can reserve each day's stored
  // energy for that day's actual peak instead of discharging greedily on the
  // shoulders and stranding nothing for the peak. This is how real peak-shaving
  // controllers behave (they forecast the daily peak) and it reconciles the
  // simulated reduction with the sizing capture estimate.
  const dayRanges = dayBoundaries(startMs, n);

  let soc = config.kwh; // start full
  let totalDischarge = 0;
  let totalChargeGrid = 0;
  let totalArbitrageKwh = 0; // discharge dedicated to arbitrage (not peak shaving)
  let inMissRun = false;
  let dischargeFloor = 0; // today's discharge threshold (>= month target)
  let reserveAfter = null; // suffix energy (kWh) still needed for today's peak
  let dayStartIdx = 0;

  const months = new Map();
  let dayPtr = 0;

  for (let i = 0; i < n; i++) {
    const d = new Date(startMs + i * STEP_MS);
    const mk = monthKeyOf(d);
    let rec = months.get(mk);
    if (!rec) {
      rec = newMonthRecord(mk, targets.get(mk) ?? 0);
      months.set(mk, rec);
      inMissRun = false;
    }
    const target = rec.targetKw;

    // At the start of each day, set the discharge threshold from the energy
    // available NOW: shave the day's peak down to the lowest flat level this
    // SOC can hold, but never below the month target. Loads above the month
    // target but below this floor (when energy-limited) are honest misses.
    if (dayPtr < dayRanges.length && i === dayRanges[dayPtr].start) {
      const ds = dayRanges[dayPtr].start;
      const de = dayRanges[dayPtr].end;
      const day = kw.slice(ds, de);
      dischargeFloor = Math.max(target, achievableLevel(day, config.kw, soc));
      // Suffix sum of peak-shaving energy still to be delivered from each
      // interval to day's end — energy the battery must NOT spend on arbitrage.
      reserveAfter = new Float64Array(day.length + 1);
      for (let k = day.length - 1; k >= 0; k--) {
        reserveAfter[k] = reserveAfter[k + 1] + Math.max(0, day[k] - dischargeFloor) * STEP_HOURS;
      }
      dayStartIdx = ds;
      dayPtr++;
    }

    const load = kw[i];
    const h = d.getHours();
    let served = load;

    // Price tier for this hour (only when a tariff is supplied)
    const info = tariff ? rateInfo(mk) : null;
    const rate = info ? info.rateByHour[h] : 0;
    const hasSpread = info ? info.maxRate > info.minRate + 1e-12 : false;
    const isOffPeak = info ? rate <= info.minRate + 1e-9 : true;
    const isOnPeak = info ? rate >= info.maxRate - 1e-9 && hasSpread : false;
    // Arbitrage only pays if the on-peak value beats the cost of the off-peak
    // energy plus round-trip losses (maxRate·eff > minRate).
    const arbitrageWorthwhile = info ? info.maxRate * eff > info.minRate + 1e-9 : false;
    const chargeGateOK = hourInWindows(h, windows) && (!tariff || isOffPeak);

    if (load > dischargeFloor + 1e-9) {
      // Discharge to hold today's threshold, limited by power and stored energy
      const want = load - dischargeFloor;
      const discharge = Math.min(want, config.kw, soc / STEP_HOURS);
      soc -= discharge * STEP_HOURS;
      served = load - discharge;
      totalDischarge += discharge * STEP_HOURS;
      rec.dischargeKwh += discharge * STEP_HOURS;
      rec.dischargeByHour[h] += discharge * STEP_HOURS;
    } else if (tariff && arbitrageOn && arbitrageWorthwhile && isOnPeak && load > 1e-9
      && soc > reserveAfter[i - dayStartIdx + 1] + 1e-9) {
      // Energy arbitrage: spend energy NOT reserved for today's peak to serve
      // load during the priciest hours (charged back off-peak). Never drops SOC
      // below what the rest of today's peak still needs.
      const surplus = soc - reserveAfter[i - dayStartIdx + 1];
      const arb = Math.max(0, Math.min(load, config.kw, surplus / STEP_HOURS));
      if (arb > 1e-9) {
        soc -= arb * STEP_HOURS;
        served = load - arb;
        totalDischarge += arb * STEP_HOURS;
        totalArbitrageKwh += arb * STEP_HOURS;
        rec.dischargeKwh += arb * STEP_HOURS;
        rec.dischargeByHour[h] += arb * STEP_HOURS;
      }
    } else if (load < target - 1e-9 && soc < config.kwh - 1e-9 && chargeGateOK) {
      // Charge when load is below the month target (never create a new peak);
      // with a tariff this only fires off-peak (cheapest energy).
      const headroom = target - load;
      const roomKw = (config.kwh - soc) / (STEP_HOURS * eff);
      const charge = Math.max(0, Math.min(chargeCap, headroom, roomKw));
      if (charge > 0) {
        soc += charge * STEP_HOURS * eff;
        served = load + charge;
        totalChargeGrid += charge * STEP_HOURS;
        rec.chargeKwh += charge * STEP_HOURS;
        rec.chargeByHour[h] += charge * STEP_HOURS;
      }
    }

    // Missed peak: load couldn't be held to the month target this interval
    // (config power/energy too small — the day floor sits above the target).
    if (served > target + 1e-6) {
      rec.missedIntervals += 1;
      rec.worstShortfallKw = Math.max(rec.worstShortfallKw, served - target);
      if (!inMissRun) { rec.missedEvents += 1; inMissRun = true; }
    } else {
      inMissRun = false;
    }

    shaved[i] = served;
    socSeries[i] = soc;
    if (load > rec.rawPeakKw) rec.rawPeakKw = load;
    if (served > rec.shavedPeakKw) rec.shavedPeakKw = served;
    if (load > rec.rawPeakByHour[h]) rec.rawPeakByHour[h] = load;
    if (served > rec.shavedPeakByHour[h]) rec.shavedPeakByHour[h] = served;
  }

  const monthly = [...months.values()].map((rec) => ({
    ...rec,
    theoreticalReductionKw: rec.rawPeakKw - rec.targetKw,
    realizedReductionKw: rec.rawPeakKw - rec.shavedPeakKw,
  }));

  const lossesKwh = totalChargeGrid * (1 - eff);
  const annual = {
    dischargeKwh: totalDischarge,
    arbitrageKwh: totalArbitrageKwh,
    chargeKwhGrid: totalChargeGrid,
    lossesKwh,
    cycles: config.kwh > 0 ? totalDischarge / config.kwh : 0,
    missedIntervals: monthly.reduce((s, m) => s + m.missedIntervals, 0),
    missedEvents: monthly.reduce((s, m) => s + m.missedEvents, 0),
    avgRealizedReductionKw: monthly.length ? monthly.reduce((s, m) => s + m.realizedReductionKw, 0) / monthly.length : 0,
    avgTheoreticalReductionKw: monthly.length ? monthly.reduce((s, m) => s + m.theoreticalReductionKw, 0) / monthly.length : 0,
    finalSocKwh: soc,
  };

  return { monthly, annual, series: { shavedKw: shaved, soc: socSeries } };
}

/** Index ranges [start, end) for each local calendar day in the series. */
function dayBoundaries(startMs, n) {
  const ranges = [];
  let start = 0;
  let curKey = dayKeyOf(new Date(startMs));
  for (let i = 1; i < n; i++) {
    const key = dayKeyOf(new Date(startMs + i * STEP_MS));
    if (key !== curKey) { ranges.push({ start, end: i }); start = i; curKey = key; }
  }
  ranges.push({ start, end: n });
  return ranges;
}

function dayKeyOf(d) {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}
