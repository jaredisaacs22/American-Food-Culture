// Sizing engine math. Pure functions (Node-testable).
//
// Flagged assumptions (surfaced in the UI as well):
// - The shave target applies to EACH billing month's peak: month m's target
//   level is (month peak − shave kW). Demand charges bill monthly, so every
//   month must be shaved to produce savings — not just the annual peak month.
// - Worst-day capture assumes the battery starts the day full and gets no
//   mid-day recharge (conservative). The dispatch simulator (Module 3)
//   validates against the full year including recharge between events.
// - Usable energy = nameplate kWh (no depth-of-discharge reserve). Round-trip
//   losses are applied on the charging side, so discharge draws 1:1 from
//   stored energy.

const STEP_HOURS = 0.25;

/** Theoretical kW/kWh requirement from peak − average × target %. */
export function theoreticalRequirement(normalized, analysis, targetShavePct) {
  const { peakKw, avgKw } = analysis.overall;
  const shaveKw = Math.max(0, (peakKw - avgKw) * (targetShavePct / 100));
  // Energy need: the largest single worst-day energy above that month's target level
  let kwhNeed = 0;
  let bindingMonth = null;
  for (const m of analysis.monthly) {
    const target = monthTargetLevel(m, shaveKw);
    const e = energyAbove(worstDayKw(normalized, m), target);
    if (e > kwhNeed) { kwhNeed = e; bindingMonth = m.key; }
  }
  return { shaveKw, kwhNeed, bindingMonth };
}

/**
 * The demand level a worst day is shaved down to in a given month.
 *
 * We shave the peak DOWN TOWARD the month's average by up to shaveKw, but never
 * below the month's average demand — this is peak shaving, not baseload
 * shifting (the spec's "peak minus average" methodology). Flooring at the
 * monthly average also prevents the degenerate case where shaveKw (derived from
 * the ANNUAL peak−average) exceeds a low month's peak, which would otherwise
 * ask the battery to flatten that month's entire baseload to zero and wildly
 * overstate the energy requirement.
 *
 * The SAME definition is used by sizing capture and the dispatch simulator so
 * "what sizing promises" matches "what dispatch delivers."
 */
export function monthTargetLevel(monthEntry, shaveKw) {
  return Math.max(monthEntry.avgKw, monthEntry.peakKw - shaveKw);
}

/** Slice the worst-day kW profile for a monthly analysis entry. */
export function worstDayKw(normalized, monthEntry) {
  const { profileStartIdx, profileLength } = monthEntry.worstDay;
  return normalized.kw.slice(profileStartIdx, profileStartIdx + profileLength);
}

/** kWh of energy above a demand level in a 15-min kW profile. */
export function energyAbove(kwArr, level) {
  let e = 0;
  for (const v of kwArr) if (v > level) e += (v - level) * STEP_HOURS;
  return e;
}

/**
 * Lowest demand level a config can hold a day's profile down to, honoring
 * both its kW rating and one full charge of energy (no mid-day recharge).
 */
export function achievableLevel(kwArr, configKw, configKwh) {
  let peak = -Infinity;
  for (const v of kwArr) if (v > peak) peak = v;
  const powerFloor = Math.max(0, peak - configKw);
  if (energyAbove(kwArr, powerFloor) <= configKwh + 1e-9) return powerFloor;
  // Energy-limited: binary search the level where energy above == configKwh
  let lo = powerFloor;
  let hi = peak;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (energyAbove(kwArr, mid) > configKwh) lo = mid; else hi = mid;
  }
  return hi;
}

/**
 * Capture rate: % of desired shave (kW) the config actually achieves across
 * the year's worst days, demand-weighted. Returns overall rate + per month.
 */
export function captureRate(normalized, analysis, shaveKw, config) {
  let desiredSum = 0;
  let capturedSum = 0;
  const perMonth = [];
  for (const m of analysis.monthly) {
    const day = worstDayKw(normalized, m);
    const target = monthTargetLevel(m, shaveKw);
    const desired = m.peakKw - target;
    const level = Math.max(achievableLevel(day, config.kw, config.kwh), target);
    const captured = Math.min(desired, Math.max(0, m.peakKw - level));
    desiredSum += desired;
    capturedSum += captured;
    perMonth.push({
      key: m.key,
      label: m.label,
      targetKw: target,
      desiredKw: desired,
      capturedKw: captured,
      achievableLevelKw: level,
      rate: desired > 0 ? captured / desired : 1,
    });
  }
  return { rate: desiredSum > 0 ? capturedSum / desiredSum : 1, perMonth };
}

/** Build an aggregate config from { unitId: count }. */
export function configFromCounts(counts, unitSpecs) {
  let kw = 0;
  let kwh = 0;
  let maxChargeKw = 0;
  let unitCount = 0;
  const parts = [];
  const units = [];
  for (const u of unitSpecs) {
    const n = counts[u.id] || 0;
    if (!n) continue;
    kw += n * u.kw;
    kwh += n * u.kwh;
    maxChargeKw += n * (u.maxChargeKw ?? u.kw);
    unitCount += n;
    parts.push(`${n}× ${u.name}`);
    units.push({ id: u.id, name: u.name, count: n });
  }
  const allSimul = units.every((p) => {
    const u = unitSpecs.find((s) => s.id === p.id);
    return u && u.simultaneousChargeDischarge;
  });
  return { label: parts.join(' + '), kw, kwh, maxChargeKw, unitCount, units, simultaneousChargeDischarge: allSimul, custom: false };
}

/**
 * Candidate configurations: n × each unit type, plus mixed pairs.
 * Honors canParallel (a non-parallel unit can only ever appear as a single
 * unit, never multiplied or mixed with others).
 */
export function generateCandidates(normalized, analysis, shaveKw, unitSpecs, opts = {}) {
  const maxUnits = opts.maxUnits ?? 8;
  const maxMixedEach = opts.maxMixedEach ?? 3;
  const comboList = [];
  const seen = new Set();
  const push = (counts) => {
    const sig = Object.entries(counts).filter(([, n]) => n > 0).sort().map(([id, n]) => `${id}:${n}`).join('|');
    if (!sig || seen.has(sig)) return;
    seen.add(sig);
    comboList.push(counts);
  };

  for (const u of unitSpecs) {
    const nMax = u.canParallel ? maxUnits : 1;
    for (let n = 1; n <= nMax; n++) push({ [u.id]: n });
  }
  for (let i = 0; i < unitSpecs.length; i++) {
    for (let j = i + 1; j < unitSpecs.length; j++) {
      const a = unitSpecs[i];
      const b = unitSpecs[j];
      if (!a.canParallel || !b.canParallel) continue; // mixing implies paralleling
      for (let na = 1; na <= maxMixedEach; na++) {
        for (let nb = 1; nb <= maxMixedEach; nb++) {
          if (na + nb <= maxUnits) push({ [a.id]: na, [b.id]: nb });
        }
      }
    }
  }

  const out = comboList.map((counts) => {
    const cfg = configFromCounts(counts, unitSpecs);
    const cap = captureRate(normalized, analysis, shaveKw, cfg);
    return { ...cfg, captureRate: cap.rate, perMonth: cap.perMonth };
  });

  // Sort smallest-first so the table reads as a capture progression
  out.sort((x, y) => x.kwh - y.kwh || x.kw - y.kw || x.unitCount - y.unitCount);

  // Efficient frontier: a config is dominated if a no-bigger config captures at least as much
  let bestSoFar = -1;
  for (const c of out) {
    c.dominated = c.captureRate <= bestSoFar + 1e-9;
    if (c.captureRate > bestSoFar) bestSoFar = c.captureRate;
  }
  return out;
}

/** Manual override config. */
export function manualConfig(normalized, analysis, shaveKw, kw, kwh) {
  const cfg = {
    label: `Manual ${kw} kW / ${kwh} kWh`,
    kw,
    kwh,
    maxChargeKw: kw,
    unitCount: null,
    units: [],
    simultaneousChargeDischarge: true,
    custom: true,
  };
  const cap = captureRate(normalized, analysis, shaveKw, cfg);
  return { ...cfg, captureRate: cap.rate, perMonth: cap.perMonth };
}
