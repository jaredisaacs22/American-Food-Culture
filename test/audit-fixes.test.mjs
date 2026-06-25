import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';
import { theoreticalRequirement, captureRate, monthTargetLevel } from '../src/modules/sizing/calc.js';
import { simulateDispatch, defaultDispatchParams } from '../src/modules/dispatch/calc.js';
import { normalizeTo15MinKw } from '../src/modules/intervals/parser.js';

// BUG 1: shaveKw derived from the ANNUAL peak−avg must not ask the battery to
// flatten a low/flat month's entire baseload (which exploded the energy need).
test('BUG1: flat months do not inflate the energy requirement', () => {
  const kw = new Array(35040).fill(150);
  kw[31 * 96 + 50] = 1000; // one Feb spike
  const normalized = { startMs: new Date(2023, 0, 1).getTime(), stepMin: 15, kw };
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 100);
  assert.equal(req.bindingMonth, '2023-02', 'spike month should bind');
  // The only thing to shave is the single 1000 kW spike for 15 min:
  // (1000 − ~150) × 0.25 h ≈ 212 kWh, NOT the whole day's 3600 kWh.
  assert.ok(req.kwhNeed > 150 && req.kwhNeed < 300, `kwhNeed ${req.kwhNeed}`);
});

test('monthTargetLevel never shaves below the monthly average', () => {
  const m = { avgKw: 200, peakKw: 500 };
  assert.equal(monthTargetLevel(m, 100), 400); // 500−100, above avg
  assert.equal(monthTargetLevel(m, 400), 200); // would be 100, floored to avg
  assert.equal(monthTargetLevel({ avgKw: 150, peakKw: 150 }, 850), 150); // flat month
});

test('peak-aware dispatch reconciles with sizing when recharge is not binding', () => {
  // Deep overnight valley (50 kW) so the battery refills fully each night,
  // and a clear daytime peak. With recharge not the bottleneck, the full-year
  // dispatch should realize essentially the whole theoretical reduction —
  // i.e. dispatch and sizing agree. (Greedy dispatch could not do this.)
  const kw = [];
  const start = new Date(2023, 0, 1);
  for (let i = 0; i < 35040; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000);
    const h = d.getHours();
    kw.push(h >= 12 && h < 15 ? 400 : 50); // short 3 h midday peak, long deep night
  }
  const normalized = { startMs: start.getTime(), stepMin: 15, kw };
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 50);
  const config = { kw: Math.ceil(req.shaveKw) + 5, kwh: Math.ceil(req.kwhNeed) + 50, maxChargeKw: 1000, simultaneousChargeDischarge: true };
  const cap = captureRate(normalized, a, req.shaveKw, config);
  assert.ok(cap.rate > 0.98, `capture ${cap.rate}`);
  const sim = simulateDispatch(normalized, a, config, req.shaveKw, defaultDispatchParams());
  const realizedFrac = sim.annual.avgRealizedReductionKw / sim.annual.avgTheoreticalReductionKw;
  assert.ok(realizedFrac > 0.98, `dispatch realized fraction ${realizedFrac} should reconcile with sizing`);
  assert.equal(sim.annual.missedEvents, 0, 'no missed peaks when the battery refills nightly');
});

// BUG 2: 5-min → 15-min resampling must preserve energy even when the record
// count is not a multiple of 3 (partial trailing bucket).
test('BUG2: 5-min resampling preserves energy on a partial final bucket', () => {
  // 13 five-minute readings of 1 kWh each = 13 kWh total.
  const records = [];
  const t0 = new Date(2023, 0, 1).getTime();
  for (let i = 0; i < 13; i++) records.push({ ms: t0 + i * 5 * 60000, value: 1 }); // 1 kWh per 5 min
  const norm = normalizeTo15MinKw(records, 'kWh', 5);
  const outEnergy = norm.kw.reduce((s, v) => s + v, 0) * 0.25;
  // Only the 4 complete 15-min buckets (12 readings) survive = 12 kWh; the
  // lone trailing reading is dropped, never inflated to 3 kWh.
  assert.ok(outEnergy <= 13 + 1e-6, `energy must not inflate: ${outEnergy}`);
  assert.ok(outEnergy >= 12 - 1e-6, `energy ${outEnergy}`);
  // each complete bucket: 3 × 1 kWh = 3 kWh over 0.25 h => 12 kW
  assert.ok(Math.abs(Math.max(...norm.kw) - 12) < 1e-6);
});

test('5-min resampling preserves energy exactly when count is a multiple of 3', () => {
  const records = [];
  const t0 = new Date(2023, 0, 1).getTime();
  for (let i = 0; i < 12; i++) records.push({ ms: t0 + i * 5 * 60000, value: 2 }); // 2 kWh / 5 min
  const norm = normalizeTo15MinKw(records, 'kWh', 5);
  const outEnergy = norm.kw.reduce((s, v) => s + v, 0) * 0.25;
  assert.ok(Math.abs(outEnergy - 24) < 1e-6, `energy ${outEnergy}`); // 12 × 2 kWh
});

// Minor 1: load factor must be a number (not NaN) for an all-zero series.
test('Minor1: all-zero load yields loadFactor 0, not NaN', () => {
  const kw = new Array(96 * 3).fill(0);
  const a = analyzeIntervals({ startMs: new Date(2023, 0, 1).getTime(), stepMin: 15, kw });
  assert.equal(a.overall.loadFactor, 0);
  assert.ok(!Number.isNaN(a.overall.loadFactor));
  for (const m of a.monthly) assert.ok(!Number.isNaN(m.loadFactor));
});
