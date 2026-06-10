// Dispatch simulation math. Pure functions (Node-testable).
//
// Model (flagged assumptions, surfaced in the UI):
// - Greedy threshold dispatch: discharge whenever load exceeds the month's
//   target level; charge whenever load is below it (within charge windows),
//   capped so charging NEVER pushes site demand above the target level.
// - Round-trip losses are applied entirely on the charging side: grid kWh ×
//   efficiency goes into storage; discharge draws 1:1 from storage. Total
//   losses are identical to splitting the efficiency across both legs.
// - Battery starts the year full. Usable energy = nameplate kWh.
// - One aggregate battery per interval either charges or discharges, never
//   both — so the simultaneous-charge/discharge unit flag is structurally
//   honored. canParallel is enforced upstream in candidate generation.
// - Monthly target level = month peak − shave kW (same definition as sizing).

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

  const targets = new Map(analysis.monthly.map((m) => [m.key, Math.max(0, m.peakKw - shaveKw)]));

  const { startMs, kw } = normalized;
  const n = kw.length;
  const shaved = new Float64Array(n);
  const socSeries = new Float64Array(n);

  let soc = config.kwh; // start full
  let totalDischarge = 0;
  let totalChargeGrid = 0;
  let inMissRun = false;

  const months = new Map();

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
    const load = kw[i];
    const h = d.getHours();
    let served = load;

    if (load > target + 1e-9) {
      // Discharge to hold the target, limited by power rating and stored energy
      const want = load - target;
      const discharge = Math.min(want, config.kw, soc / STEP_HOURS);
      soc -= discharge * STEP_HOURS;
      served = load - discharge;
      totalDischarge += discharge * STEP_HOURS;
      rec.dischargeKwh += discharge * STEP_HOURS;
      rec.dischargeByHour[h] += discharge * STEP_HOURS;
      if (served > target + 1e-6) {
        rec.missedIntervals += 1;
        rec.worstShortfallKw = Math.max(rec.worstShortfallKw, served - target);
        if (!inMissRun) { rec.missedEvents += 1; inMissRun = true; }
      } else {
        inMissRun = false;
      }
    } else {
      inMissRun = false;
      if (soc < config.kwh - 1e-9 && hourInWindows(h, windows)) {
        const headroom = target - load; // never charge above the target level
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
    chargeKwhGrid: totalChargeGrid,
    lossesKwh,
    cycles: config.kwh > 0 ? totalDischarge / config.kwh : 0,
    missedIntervals: monthly.reduce((s, m) => s + m.missedIntervals, 0),
    missedEvents: monthly.reduce((s, m) => s + m.missedEvents, 0),
    avgRealizedReductionKw: monthly.reduce((s, m) => s + m.realizedReductionKw, 0) / monthly.length,
    avgTheoreticalReductionKw: monthly.reduce((s, m) => s + m.theoreticalReductionKw, 0) / monthly.length,
    finalSocKwh: soc,
  };

  return { monthly, annual, series: { shavedKw: shaved, soc: socSeries } };
}
