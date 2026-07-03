// Invoice-first load synthesis. Pure functions (Node-testable).
//
// Most prospects hand over a few monthly invoices, not interval data. Each
// invoice gives that month's energy (kWh) and usually its billed peak (kW).
// This module calibrates a ComStock reference shape month-by-month so the
// synthetic year reproduces the invoiced monthly peaks and energies EXACTLY,
// while borrowing the shape's realistic timing (when peaks occur, how wide
// they are). Downstream modules then run unchanged.
//
// Per-month affine calibration: kw_i = a·shape_i + b, solved so that
//   max(kw) = invoiced peak   and   Σ kw × 0.25 h = invoiced kWh.
// If that drives valleys negative (site peakier than the shape), values are
// floored at zero and b is re-solved by bisection so energy still matches;
// the month's peak is untouched (the max is always positive).
//
// Months without an invoice are inferred from the provided months' median
// ratios to the shape's own monthly energy/peak — flagged as INFERRED.
//
// Honesty: the invoice pins each peak's HEIGHT but not its WIDTH — battery
// energy sizing leans on the shape's peak duration. Everything produced here
// is tagged invoice-calibrated so it's never mistaken for metered data.

import { profileLibrary, profileFractions } from './profiles.js';

const STEP_MIN = 15;
const STEP_HOURS = 0.25;
const STEP_MS = STEP_MIN * 60000;

/** Per-month index ranges + shape stats for the profile year. */
export function monthShapeStats(frac, year) {
  const startMs = new Date(year, 0, 1).getTime();
  const months = [];
  let cur = null;
  for (let i = 0; i < frac.length; i++) {
    const m = new Date(startMs + i * STEP_MS).getMonth(); // 0-based
    if (!cur || cur.month !== m + 1) {
      cur = { month: m + 1, start: i, end: i + 1, maxS: frac[i], sumS: frac[i] };
      months.push(cur);
    } else {
      cur.end = i + 1;
      cur.sumS += frac[i];
      if (frac[i] > cur.maxS) cur.maxS = frac[i];
    }
  }
  for (const m of months) {
    m.n = m.end - m.start;
    m.meanS = m.sumS / m.n;
  }
  return { startMs, months };
}

/** Solve b by bisection so Σ max(0, a·s + b) × 0.25 == targetKwh. */
function solveFloorAndEnergy(frac, start, end, a, targetKwh) {
  const energyAt = (b) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += Math.max(0, a * frac[i] + b);
    return sum * STEP_HOURS;
  };
  // b bounds: all-zero floor vs generous positive offset
  let lo = -a; // a·s + b <= a·(s−1) ≤ 0 for all s -> energy 0
  let hi = targetKwh / ((end - start) * STEP_HOURS); // flat b alone exceeds target
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (energyAt(mid) < targetKwh) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * entries: [{ month: 1..12, kwh?: number, peakKw?: number }] — at least one
 * month with kwh. Returns { normalized, source } like the parser/loader.
 */
export function calibrateFromInvoices(stateId, typeId, entries) {
  const lib = profileLibrary();
  const frac = profileFractions(stateId, typeId);
  const year = lib.meta.weatherYear;
  const { startMs, months } = monthShapeStats(frac, year);

  const provided = new Map();
  for (const e of entries || []) {
    if (!e || !(e.month >= 1 && e.month <= 12)) continue;
    if (!(e.kwh > 0)) continue;
    provided.set(e.month, { kwh: e.kwh, peakKw: e.peakKw > 0 ? e.peakKw : null });
  }
  if (!provided.size) throw new Error('Enter at least one month with kWh from an invoice.');

  // Ratios of invoice vs shape, for inferring missing months / missing peaks.
  const energyRatios = [];
  const peakRatios = [];
  for (const m of months) {
    const inv = provided.get(m.month);
    if (!inv) continue;
    energyRatios.push(inv.kwh / (m.sumS * STEP_HOURS)); // shape kWh at peak=1
    if (inv.peakKw) peakRatios.push(inv.peakKw / m.maxS);
  }
  const median = (arr) => {
    const s = [...arr].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  const medianEnergyRatio = median(energyRatios);
  const medianPeakRatio = peakRatios.length ? median(peakRatios) : medianEnergyRatio;

  const kw = new Array(frac.length).fill(0);
  const calibration = [];
  const notes = [];

  for (const m of months) {
    const inv = provided.get(m.month);
    const measured = !!inv;
    const E = inv ? inv.kwh : medianEnergyRatio * m.sumS * STEP_HOURS;
    let P = inv && inv.peakKw ? inv.peakKw : medianPeakRatio * m.maxS;
    const peakMeasured = !!(inv && inv.peakKw);

    const A = E / (m.n * STEP_HOURS); // average kW implied by the energy
    if (P <= A) {
      if (peakMeasured) {
        throw new Error(
          `Month ${m.month}: billed peak ${P.toFixed(0)} kW is at or below the average implied by ` +
          `${E.toLocaleString()} kWh (${A.toFixed(0)} kW). Check the units on that invoice.`);
      }
      P = A * 1.05; // inferred peak came out inconsistent — nudge above average
    }

    // Affine solve: a·maxS + b = P ; a·meanS + b = A
    let a = m.maxS - m.meanS > 1e-9 ? (P - A) / (m.maxS - m.meanS) : 0;
    let b = A - a * m.meanS;

    // Floor negatives (site peakier than the shape) and re-match energy.
    // Flooring alone would drop the peak below the invoice, so iterate a and b
    // jointly: b re-matches energy given a, then a re-matches the peak given b.
    let minVal = Infinity;
    for (let i = m.start; i < m.end; i++) {
      const v = a * frac[i] + b;
      if (v < minVal) minVal = v;
    }
    let floored = false;
    if (minVal < 0) {
      floored = true;
      for (let iter = 0; iter < 30; iter++) {
        b = solveFloorAndEnergy(frac, m.start, m.end, a, E);
        const peakNow = a * m.maxS + b;
        if (Math.abs(peakNow - P) < P * 1e-6) break;
        a = (P - b) / m.maxS;
      }
      // Always end on an energy solve so kWh matches even if the loop capped out.
      b = solveFloorAndEnergy(frac, m.start, m.end, a, E);
    }
    for (let i = m.start; i < m.end; i++) {
      kw[i] = Math.round(Math.max(0, a * frac[i] + b) * 1000) / 1000;
    }

    // Actual outcomes after rounding/flooring
    let outPeak = 0;
    let outSum = 0;
    for (let i = m.start; i < m.end; i++) {
      if (kw[i] > outPeak) outPeak = kw[i];
      outSum += kw[i];
    }
    calibration.push({
      month: m.month,
      measured,
      peakMeasured,
      kwhIn: Math.round(E),
      peakIn: Math.round(P * 10) / 10,
      kwhOut: Math.round(outSum * STEP_HOURS),
      peakOut: Math.round(outPeak * 10) / 10,
      floored,
    });
  }

  const inferredMonths = calibration.filter((c) => !c.measured).map((c) => c.month);
  if (inferredMonths.length) {
    notes.push(`Months ${inferredMonths.join(', ')} had no invoice — INFERRED from the provided months' ` +
      'ratio to the reference shape. More invoices = better estimate.');
  }
  const inferredPeaks = calibration.filter((c) => c.measured && !c.peakMeasured).map((c) => c.month);
  if (inferredPeaks.length) {
    notes.push(`Months ${inferredPeaks.join(', ')} had kWh but no billed kW — peak inferred from the shape's load factor.`);
  }
  notes.push('Invoice-calibrated estimate: monthly peaks/energies match the invoices exactly, but peak DURATION ' +
    'comes from the reference shape — battery energy sizing depends on it. Treat savings as an estimate and ' +
    'confirm with interval data before contracting.');

  const typeLabel = lib.buildingTypes.find((t) => t.id === typeId)?.label || typeId;
  const totalKwh = Math.round(kw.reduce((s, v) => s + v, 0) * STEP_HOURS);
  const peakKw = Math.max(...kw);

  return {
    normalized: {
      startMs,
      stepMin: STEP_MIN,
      kw,
      gapsFilled: 0,
      longestGapIntervals: 0,
      duplicatesMerged: 0,
    },
    source: {
      fileName: `${typeLabel} — ${stateId}, calibrated to ${provided.size} invoice month${provided.size > 1 ? 's' : ''}`,
      format: 'invoice-calibrated estimate (ComStock shape fitted to invoice months)',
      fidelity: 'invoice',
      detectedIntervalMin: STEP_MIN,
      detectedUnit: 'kW',
      appliedIntervalMin: STEP_MIN,
      appliedUnit: 'kW',
      rowsParsed: kw.length,
      gapsFilled: 0,
      longestGapIntervals: 0,
      duplicatesMerged: 0,
      coverage: {
        startMs, endMs: startMs + (kw.length - 1) * STEP_MS,
        intervals: kw.length, days: Math.round((kw.length / 96) * 10) / 10,
        isFullYear: true, nativeStepMin: STEP_MIN,
      },
      invoice: {
        stateId, typeId, typeLabel,
        entries: [...provided.entries()].map(([month, v]) => ({ month, kwh: v.kwh, peakKw: v.peakKw })),
        calibration,
        impliedAnnualKwh: totalKwh,
        impliedPeakKw: Math.round(peakKw),
      },
      notes,
    },
  };
}
