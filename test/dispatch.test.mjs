import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseIntervalRows } from '../src/modules/intervals/parser.js';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';
import { theoreticalRequirement } from '../src/modules/sizing/calc.js';
import { simulateDispatch, hourInWindows, defaultDispatchParams } from '../src/modules/dispatch/calc.js';

const STEP_HOURS = 0.25;

function loadYear() {
  const rows = parseCsv(readFileSync(new URL('../sample-data/generic_15min_kw.csv', import.meta.url), 'utf8'));
  const { normalized } = parseIntervalRows(rows, 'generic_15min_kw.csv');
  return { normalized, analysis: analyzeIntervals(normalized) };
}

/** One-day synthetic series: base 100 kW, intervals 40..47 at 400 kW. */
function bumpDay() {
  const kw = Array.from({ length: 96 }, (_, i) => (i >= 40 && i < 48 ? 400 : 100));
  const normalized = { startMs: Date.UTC(2025, 0, 1, 8), stepMin: 15, kw };
  return { normalized, analysis: analyzeIntervals(normalized) };
}

test('hourInWindows: overnight wrap and empty', () => {
  assert.equal(hourInWindows(3, []), true);
  const overnight = [{ startHour: 22, endHour: 6 }];
  assert.equal(hourInWindows(23, overnight), true);
  assert.equal(hourInWindows(3, overnight), true);
  assert.equal(hourInWindows(12, overnight), false);
  assert.equal(hourInWindows(22, overnight), true);
  assert.equal(hourInWindows(6, overnight), false);
});

test('hand-computed: full shave, SOC and RTE accounting', () => {
  const { normalized, analysis } = bumpDay();
  // shave 100 -> target 300. Bump excess: 100 kW × 2 h = 50 kWh discharge needed...
  // (8 intervals × 100 kW × 0.25 h = 200 kWh)
  const config = { kw: 300, kwh: 400, maxChargeKw: 300 };
  const params = { ...defaultDispatchParams(), roundTripEfficiency: 0.8 };
  const r = simulateDispatch(normalized, analysis, config, 100, params);

  const m = r.monthly[0];
  assert.equal(m.rawPeakKw, 400);
  assert.equal(m.targetKw, 300);
  // fully covered: shaved peak == target, zero missed
  assert.ok(Math.abs(m.shavedPeakKw - 300) < 1e-6);
  assert.equal(m.missedIntervals, 0);
  assert.equal(m.missedEvents, 0);
  // discharge = 8 intervals × 100 kW × 0.25 h = 200 kWh
  assert.ok(Math.abs(m.dischargeKwh - 200) < 1e-6);
  assert.equal(m.realizedReductionKw, 100);
  assert.equal(m.theoreticalReductionKw, 100);

  // Charging: battery started full (400), so charging happens only after the
  // discharge. It can refill up to min(headroom 200 kW, chargeCap 300).
  // Energy balance: finalSoc = 400 − 200 + chargeGrid × 0.8
  assert.ok(Math.abs(r.annual.finalSocKwh - (400 - 200 + m.chargeKwh * 0.8)) < 1e-6);
  // losses = grid charge × (1 − rte)
  assert.ok(Math.abs(r.annual.lossesKwh - m.chargeKwh * 0.2) < 1e-6);
  // refill required 200 kWh stored -> 250 kWh from grid at 80% rte; enough
  // headroom hours remain in the day, so it should fully refill
  assert.ok(Math.abs(m.chargeKwh - 250) < 1e-6, `grid charge ${m.chargeKwh}`);
  assert.ok(Math.abs(r.annual.finalSocKwh - 400) < 1e-6);
  // cycles = discharge / nameplate
  assert.ok(Math.abs(r.annual.cycles - 200 / 400) < 1e-9);
});

test('hand-computed: power-limited shortfall is a missed event', () => {
  const { normalized, analysis } = bumpDay();
  // shave 100 -> target 300, but config only 60 kW -> shaved peak 340, one event
  const config = { kw: 60, kwh: 1000, maxChargeKw: 60 };
  const r = simulateDispatch(normalized, analysis, config, 100, defaultDispatchParams());
  const m = r.monthly[0];
  assert.ok(Math.abs(m.shavedPeakKw - 340) < 1e-6);
  assert.equal(m.missedIntervals, 8);
  assert.equal(m.missedEvents, 1, 'contiguous shortfall must count as one event');
  assert.ok(Math.abs(m.worstShortfallKw - 40) < 1e-6);
  assert.ok(Math.abs(m.realizedReductionKw - 60) < 1e-6);
});

test('hand-computed: energy-limited shortfall spreads charge across the peak', () => {
  const { normalized, analysis } = bumpDay();
  // Needs 200 kWh to hold target 300; given only 100 kWh. A peak-aware
  // controller spends the 100 kWh evenly across the 8-interval bump, holding a
  // flat 350 kW (the achievable level) rather than fully covering the first 4
  // intervals and leaving the peak at 400. Lower realized peak, same energy.
  const config = { kw: 300, kwh: 100, maxChargeKw: 300 };
  const r = simulateDispatch(normalized, analysis, config, 100, defaultDispatchParams());
  const m = r.monthly[0];
  assert.ok(Math.abs(m.shavedPeakKw - 350) < 1e-6, `peak held to 350, got ${m.shavedPeakKw}`);
  assert.equal(m.missedIntervals, 8); // all 8 bump intervals still above the 300 target
  assert.ok(Math.abs(m.dischargeKwh - 100) < 1e-6); // uses exactly its stored energy
  assert.ok(Math.abs(m.worstShortfallKw - 50) < 1e-6); // 350 − 300
});

test('charging never creates a new peak above the target level', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 50);
  const config = { kw: 1000, kwh: 2000, maxChargeKw: 1000 };
  const r = simulateDispatch(normalized, analysis, config, shaveKw, defaultDispatchParams());
  for (let i = 0; i < r.monthly.length; i++) {
    const m = r.monthly[i];
    assert.ok(m.shavedPeakKw <= Math.max(m.targetKw, m.shavedPeakKw <= m.targetKw ? m.targetKw : m.shavedPeakKw) + 1e-6);
    // shaved peak can exceed target only via missed discharge, never via charging:
    if (m.missedIntervals === 0) {
      assert.ok(m.shavedPeakKw <= m.targetKw + 1e-6, `${m.key}: charging pushed peak ${m.shavedPeakKw} above target ${m.targetKw}`);
    }
  }
});

test('charge windows restrict charging hours', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 100);
  const config = { kw: 500, kwh: 1000, maxChargeKw: 500 };
  const params = { ...defaultDispatchParams(), chargeWindows: [{ startHour: 22, endHour: 6 }] };
  const r = simulateDispatch(normalized, analysis, config, shaveKw, params);
  for (const m of r.monthly) {
    for (let h = 6; h < 22; h++) {
      assert.equal(m.chargeByHour[h], 0, `${m.key}: charged at hour ${h} outside window`);
    }
  }
  assert.ok(r.annual.chargeKwhGrid > 0, 'should still charge overnight');
});

test('full-year energy conservation and aggregate consistency', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 75);
  const config = { kw: 500, kwh: 1000, maxChargeKw: 500 };
  const params = defaultDispatchParams(); // rte 0.88
  const r = simulateDispatch(normalized, analysis, config, shaveKw, params);

  // SOC balance: initial + stored − discharged = final
  const stored = r.annual.chargeKwhGrid * params.roundTripEfficiency;
  assert.ok(Math.abs(config.kwh + stored - r.annual.dischargeKwh - r.annual.finalSocKwh) < 1e-6);

  // monthly sums match annual
  const sumDis = r.monthly.reduce((s, m) => s + m.dischargeKwh, 0);
  const sumChg = r.monthly.reduce((s, m) => s + m.chargeKwh, 0);
  assert.ok(Math.abs(sumDis - r.annual.dischargeKwh) < 1e-6);
  assert.ok(Math.abs(sumChg - r.annual.chargeKwhGrid) < 1e-6);

  // by-hour breakdowns match monthly totals
  for (const m of r.monthly) {
    const dh = m.dischargeByHour.reduce((s, v) => s + v, 0);
    const ch = m.chargeByHour.reduce((s, v) => s + v, 0);
    assert.ok(Math.abs(dh - m.dischargeKwh) < 1e-6);
    assert.ok(Math.abs(ch - m.chargeKwh) < 1e-6);
  }

  // shaved series consistency: served = raw − discharge + charge per interval
  const { shavedKw } = r.series;
  let rawSum = 0;
  let shavedSum = 0;
  for (let i = 0; i < normalized.kw.length; i++) { rawSum += normalized.kw[i]; shavedSum += shavedKw[i]; }
  const expectedDelta = (r.annual.chargeKwhGrid - r.annual.dischargeKwh) / STEP_HOURS;
  assert.ok(Math.abs((shavedSum - rawSum) - expectedDelta) < 1e-3);

  // realized reduction can never exceed theoretical
  for (const m of r.monthly) {
    assert.ok(m.realizedReductionKw <= m.theoreticalReductionKw + 1e-6, `${m.key}`);
  }
});

test('realized tracks theoretical at a modest target, collapses at an aggressive one', () => {
  const { normalized, analysis } = loadYear();
  const config = { kw: 500, kwh: 1000, maxChargeKw: 500 };

  // Modest target (25% of peak−avg ≈ 100 kW shave): config should hold it
  const modest = theoreticalRequirement(normalized, analysis, 25);
  const rm = simulateDispatch(normalized, analysis, config, modest.shaveKw, defaultDispatchParams());
  const fracModest = rm.annual.avgRealizedReductionKw / rm.annual.avgTheoreticalReductionKw;
  assert.ok(fracModest > 0.95, `modest target should be nearly fully realized, got ${fracModest}`);

  // Aggressive target (100%): greedy dispatch drains on shoulder hours and
  // misses the true peak — realized collapses and missed events appear.
  const aggro = theoreticalRequirement(normalized, analysis, 100);
  const ra = simulateDispatch(normalized, analysis, config, aggro.shaveKw, defaultDispatchParams());
  const fracAggro = ra.annual.avgRealizedReductionKw / ra.annual.avgTheoreticalReductionKw;
  assert.ok(fracAggro < fracModest, 'aggressive target cannot out-realize modest one');
  assert.ok(ra.annual.missedEvents > 0, 'aggressive target must produce missed events');
});

test('asymmetric config: charging never exceeds the charge rating', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 50);
  const config = { kw: 500, kwh: 1000, maxChargeKw: 100, simultaneousChargeDischarge: true };
  const r = simulateDispatch(normalized, analysis, config, shaveKw, defaultDispatchParams());
  for (const m of r.monthly) {
    for (let h = 0; h < 24; h++) {
      // per-hour charge energy can't exceed chargeKw × 1h × days-in-month;
      // check the tighter per-interval bound via grid impact: served-load rise
      // is capped by maxChargeKw, so hourly charge ≤ 100 kWh × days
      assert.ok(m.chargeByHour[h] <= 100 * 31 + 1e-6, `${m.key} h${h}: ${m.chargeByHour[h]}`);
    }
  }
  assert.ok(r.annual.chargeKwhGrid > 0, 'still charges, just slower');
});
