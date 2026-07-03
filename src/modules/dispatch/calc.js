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

import { monthTargetLevel, achievableLevel, energyAbove } from '../sizing/calc.js';
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

function dateKeyOf(d) {
  return `${monthKeyOf(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

function newMonthRecord(key, targetKw) {
  return {
    key,
    targetKw,
    rawPeakKw: 0,
    shavedPeakKw: 0,
    // Worst-day-of-month billing: the dates whose 15-min max sets the billed
    // demand — raw = the worst day from the analysis; shaved = whichever day
    // becomes the new binding day after dispatch.
    rawPeakDate: null,
    shavedPeakDate: null,
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

  // Worst-day-of-month billing level: demand charges bill on the single worst
  // 15-min interval of the month, so the month's billed kW can never go below
  // the level the battery can hold its HARDEST day to. Shaving any other day
  // deeper than that level buys nothing and wastes energy the worst day may
  // need. Per month, B = max over days of that day's full-battery floor; every
  // day is dispatched to hold max(B, what today's SOC allows), never deeper.
  const monthBillingLevel = new Map();
  const dayFloorFullArr = new Float64Array(dayRanges.length);
  for (let di = 0; di < dayRanges.length; di++) {
    const r = dayRanges[di];
    const mk = monthKeyOf(new Date(startMs + r.start * STEP_MS));
    const target = targets.get(mk) ?? 0;
    const dayFloorFull = Math.max(target, achievableLevel(kw.slice(r.start, r.end), config.kw, config.kwh));
    dayFloorFullArr[di] = dayFloorFull;
    const cur = monthBillingLevel.get(mk);
    if (cur === undefined || dayFloorFull > cur) monthBillingLevel.set(mk, dayFloorFull);
  }

  /** Stored-kWh charging potential of one interval (matches the charge gate). */
  const refillPotentialAt = (k) => {
    const kd = new Date(startMs + k * STEP_MS);
    const kMk = monthKeyOf(kd);
    const kTarget = targets.get(kMk) ?? 0;
    if (kw[k] >= kTarget - 1e-9 || !hourInWindows(kd.getHours(), windows)) return 0;
    if (tariff) {
      const kInfo = rateInfo(kMk);
      const kRate = kInfo.rateByHour[kd.getHours()];
      if (kRate >= kInfo.maxRate - 1e-9 && kInfo.maxRate > kInfo.minRate + 1e-12) return 0; // never buys on-peak
    }
    return Math.min(chargeCap, kTarget - kw[k]) * STEP_HOURS * eff;
  };

  // Per-day shave need and USABLE refill, for MULTI-DAY worst-day protection:
  // in energy-limited months the battery may never return to full, so
  // arbitrage tonight can starve the month's worst day even several days out.
  // A day's usable refill is what arrives during its NEED CYCLE — from the
  // previous day's last draw to its own last draw. Refill after a day's peak
  // can't serve that day; it rolls into the next day's cycle.
  const dayNeed = new Float64Array(dayRanges.length);
  const dayRefillCycle = new Float64Array(dayRanges.length);
  {
    let prevBoundary = -1; // absolute index of the previous cycle's last draw
    for (let di = 0; di < dayRanges.length; di++) {
      const r = dayRanges[di];
      const mk = monthKeyOf(new Date(startMs + r.start * STEP_MS));
      // The level the dispatch actually holds this day to (the month's billing
      // level — deeper shaving can't lower the bill).
      const held = Math.max(monthBillingLevel.get(mk) ?? 0, dayFloorFullArr[di]);
      dayNeed[di] = energyAbove(kw.slice(r.start, r.end), held);
      let lastDraw = -1;
      for (let k = r.end - 1; k >= r.start; k--) {
        if (kw[k] > held + 1e-9) { lastDraw = k; break; }
      }
      const boundary = lastDraw >= 0 ? lastDraw : prevBoundary;
      let refill = 0;
      for (let k = prevBoundary + 1; k <= boundary; k++) refill += refillPotentialAt(k);
      dayRefillCycle[di] = refill;
      prevBoundary = boundary;
    }
  }

  let soc = config.kwh; // start full
  let totalDischarge = 0;
  let totalChargeGrid = 0;
  let totalArbitrageKwh = 0; // discharge dedicated to arbitrage (not peak shaving)
  let inMissRun = false;
  let dischargeFloor = 0; // today's discharge threshold (>= month target)
  let reserveAfter = null; // suffix energy (kWh) still needed for today's peak
  let dayStartIdx = 0;
  let dayEndIdx = 0;
  let floorSocBasis = 0; // SOC the current floor was derived from
  // Worst-day protection across days: demand charges bill on the month's worst
  // day, so upcoming shaves must never be starved by tonight's arbitrage.
  let maxCarryKwh = 0; // SOC required after today's last draw for the days ahead

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
      // Hold today at the month's billing level (set by the month's worst
      // day); deeper shaving can't lower the bill. If today's SOC can't even
      // hold that, the higher achievable level is an honest shortfall.
      const billLevel = monthBillingLevel.get(mk) ?? target;
      dischargeFloor = Math.max(billLevel, achievableLevel(day, config.kw, soc));
      dayEndIdx = de;
      floorSocBasis = soc;
      // Suffix sum of peak-shaving energy still to be delivered from each
      // interval to day's end — energy the battery must NOT spend on arbitrage.
      reserveAfter = new Float64Array(day.length + 1);
      for (let k = day.length - 1; k >= 0; k--) {
        reserveAfter[k] = reserveAfter[k + 1] + Math.max(0, day[k] - dischargeFloor) * STEP_HOURS;
      }
      dayStartIdx = ds;

      // Multi-day worst-day protection: the SOC that must remain after today's
      // last draw so every coming day's shave stays feasible. Backward
      // feasibility recurrence over ALL remaining days (chronic-deficit months
      // propagate a shortfall for weeks; any refill-rich recovery day resets
      // the requirement to zero, so a long horizon never over-suppresses),
      // clamped to [0, capacity]:
      //   required_before_day_j = clamp(required_after + need_j − refill_j)
      // where refill_j is the day's NEED-CYCLE refill (see above).
      let required = 0;
      for (let j = dayRanges.length - 1 - dayPtr; j >= 1; j--) {
        required = Math.min(config.kwh, Math.max(0, required + dayNeed[dayPtr + j] - dayRefillCycle[dayPtr + j]));
      }
      maxCarryKwh = required;
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
    // Demand charges bill on the month's WORST DAY, so being ready for the next
    // peak outranks buying at the absolute cheapest tier: charging normally
    // waits for off-peak (cheapest) hours, but escalates to any non-on-peak
    // hour when SOC is short of today's remaining reserve plus what tomorrow's
    // shave needs beyond the refill still available. It never buys on-peak.
    const shortForPeaks = reserveAfter[i - dayStartIdx] + maxCarryKwh;
    const chargeGateOK = hourInWindows(h, windows)
      && (!tariff || isOffPeak || (!isOnPeak && soc < shortForPeaks - 1e-9));

    // If energy has arrived since the day's floor was derived (overnight or
    // morning recharge), re-derive it for the REMAINDER of the day — otherwise
    // a low SOC at midnight pins the floor high all day even though the
    // battery refills before the peak. Never below the month's billing level
    // (deeper shaving can't lower the bill). Checked hourly, and always at the
    // moment a draw is about to start so the floor reflects every kWh that
    // made it in before the peak.
    const monthBill = monthBillingLevel.get(mk) ?? target;
    if (dischargeFloor > monthBill + 1e-9 && soc > floorSocBasis + 1e-6
      && ((i - dayStartIdx) % 4 === 0 || load > dischargeFloor + 1e-9)) {
      const rest = kw.slice(i, dayEndIdx);
      const newFloor = Math.max(monthBill, achievableLevel(rest, config.kw, soc));
      if (newFloor < dischargeFloor - 1e-9) {
        dischargeFloor = newFloor;
        for (let k = dayEndIdx - 1; k >= i; k--) {
          reserveAfter[k - dayStartIdx] = reserveAfter[k - dayStartIdx + 1]
            + Math.max(0, kw[k] - dischargeFloor) * STEP_HOURS;
        }
      }
      floorSocBasis = soc;
    }

    if (load > dischargeFloor + 1e-9) {
      // Discharge to hold today's threshold, limited by power and stored energy
      const want = load - dischargeFloor;
      const discharge = Math.min(want, config.kw, soc / STEP_HOURS);
      soc -= discharge * STEP_HOURS;
      served = load - discharge;
      totalDischarge += discharge * STEP_HOURS;
      rec.dischargeKwh += discharge * STEP_HOURS;
      rec.dischargeByHour[h] += discharge * STEP_HOURS;
    } else if (tariff && arbitrageOn && arbitrageWorthwhile && isOnPeak && load > 1e-9) {
      // Energy arbitrage: spend ONLY the energy that neither the rest of
      // today's peak nor tomorrow's worst-day shave (net of the refill still
      // possible before its first draw) will need. Worst-day demand savings
      // always outrank the $/kWh spread.
      // 2% of capacity is held back as a safety buffer: the day-level refill
      // model is still approximate within a need cycle, and a few kWh of
      // margin keeps arbitrage from ever nicking the billed worst-day peak.
      const reservedKwh = reserveAfter[i - dayStartIdx + 1]
        + maxCarryKwh
        + 0.02 * config.kwh;
      const surplus = soc - reservedKwh;
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
    if (load > rec.rawPeakKw) { rec.rawPeakKw = load; rec.rawPeakDate = dateKeyOf(d); }
    if (served > rec.shavedPeakKw) { rec.shavedPeakKw = served; rec.shavedPeakDate = dateKeyOf(d); }
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
