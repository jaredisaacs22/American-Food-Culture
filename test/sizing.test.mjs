import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseIntervalRows } from '../src/modules/intervals/parser.js';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';
import {
  theoreticalRequirement, energyAbove, achievableLevel, captureRate,
  configFromCounts, generateCandidates, manualConfig,
} from '../src/modules/sizing/calc.js';
import { defaultUnitSpecs } from '../src/model/units.js';

function loadYear() {
  const rows = parseCsv(readFileSync(new URL('../sample-data/generic_15min_kw.csv', import.meta.url), 'utf8'));
  const { normalized } = parseIntervalRows(rows, 'generic_15min_kw.csv');
  return { normalized, analysis: analyzeIntervals(normalized) };
}

// ---------------------------------------------------------------------------
// Hand-computed micro cases (verifiable on paper)
// ---------------------------------------------------------------------------

test('energyAbove: hand-computed', () => {
  // Profile (15-min, kW): 100, 200, 300, 200. Level 150.
  // Above-level kW: 0, 50, 150, 50 -> sum 250 kW × 0.25 h = 62.5 kWh
  assert.equal(energyAbove([100, 200, 300, 200], 150), 62.5);
  assert.equal(energyAbove([100, 200, 300, 200], 300), 0);
});

test('achievableLevel: power-limited case', () => {
  // Peak 300, config 100 kW with plenty of energy -> can hold to 200
  const day = [100, 200, 300, 200];
  assert.equal(achievableLevel(day, 100, 1000), 200);
});

test('achievableLevel: energy-limited case (hand-computed)', () => {
  // Day: 8 intervals at 400 kW (2 h) over a 100 kW base.
  // Config: 300 kW, 100 kWh. Power floor = 100 kW, but holding to 100 needs
  // 300 kW × 2 h = 600 kWh. With 100 kWh: level L satisfies (400−L)×2h = 100
  // -> L = 350.
  const day = [100, 100, 400, 400, 400, 400, 400, 400, 400, 400, 100, 100];
  const lvl = achievableLevel(day, 300, 100);
  assert.ok(Math.abs(lvl - 350) < 0.001, `expected 350, got ${lvl}`);
});

test('captureRate: hand-computed single month', () => {
  // Build a tiny normalized series: one day, peak 400, base 100.
  // 96 intervals: base 100 except intervals 40..47 (2 h) at 400.
  const kw = Array.from({ length: 96 }, (_, i) => (i >= 40 && i < 48 ? 400 : 100));
  const normalized = { startMs: Date.UTC(2025, 0, 1, 8), stepMin: 15, kw };
  const analysis = analyzeIntervals(normalized);
  assert.equal(analysis.monthly.length, 1);
  assert.equal(analysis.monthly[0].peakKw, 400);

  // shave 100 kW -> target level 300. Desired shave 100 kW.
  // Config A: 300 kW / 1000 kWh -> easily holds to 300 -> 100% capture.
  const a = captureRate(normalized, analysis, 100, { kw: 300, kwh: 1000 });
  assert.equal(a.rate, 1);

  // Config B: 50 kW / 1000 kWh -> can only hold to 350 -> captures 50 of 100 -> 50%
  const b = captureRate(normalized, analysis, 100, { kw: 50, kwh: 1000 });
  assert.ok(Math.abs(b.rate - 0.5) < 0.001, `expected 0.5, got ${b.rate}`);

  // Config C: 300 kW / 100 kWh -> energy-limited to level 350 (see prior test) -> 50%
  const c = captureRate(normalized, analysis, 100, { kw: 300, kwh: 100 });
  assert.ok(Math.abs(c.rate - 0.5) < 0.001, `expected 0.5, got ${c.rate}`);
});

// ---------------------------------------------------------------------------
// Full-year properties on sample data
// ---------------------------------------------------------------------------

test('theoretical requirement scales with target %', () => {
  const { normalized, analysis } = loadYear();
  const full = theoreticalRequirement(normalized, analysis, 100);
  const half = theoreticalRequirement(normalized, analysis, 50);
  assert.ok(Math.abs(half.shaveKw - full.shaveKw / 2) < 1e-9);
  assert.ok(half.kwhNeed < full.kwhNeed, 'smaller shave needs less energy');
  assert.equal(full.shaveKw, analysis.overall.peakKw - analysis.overall.avgKw);
});

test('capture rate is monotonic in units and hits 100% eventually', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 100);
  const specs = defaultUnitSpecs();
  let prev = -1;
  for (let n = 1; n <= 8; n++) {
    const cfg = configFromCounts({ 'bess-500-1000': n }, specs);
    const { rate } = captureRate(normalized, analysis, shaveKw, cfg);
    assert.ok(rate >= prev - 1e-9, `capture dropped adding units: n=${n}`);
    assert.ok(rate >= 0 && rate <= 1);
    prev = rate;
  }
  // A config at least as big as the theoretical requirement captures 100%
  const req = theoreticalRequirement(normalized, analysis, 100);
  const big = { kw: Math.ceil(req.shaveKw), kwh: Math.ceil(req.kwhNeed) };
  const { rate } = captureRate(normalized, analysis, req.shaveKw, big);
  assert.ok(rate > 0.9999, `theoretical-size config should capture ~100%, got ${rate}`);
});

test('candidate generation honors canParallel and dedupes', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 100);
  const specs = [
    ...defaultUnitSpecs(),
    { id: 'moxion', name: 'Moxion MP-75/600', kw: 75, kwh: 600, maxChargeKw: 75, canParallel: false, simultaneousChargeDischarge: false },
  ];
  const cands = generateCandidates(normalized, analysis, shaveKw, specs);
  for (const c of cands) {
    const mox = c.units.find((u) => u.id === 'moxion');
    if (mox) {
      assert.equal(mox.count, 1, 'non-parallel unit multiplied');
      assert.equal(c.units.length, 1, 'non-parallel unit mixed with others');
      assert.equal(c.simultaneousChargeDischarge, false, 'fleet flag must AND unit flags');
    }
  }
  const sigs = cands.map((c) => c.label);
  assert.equal(new Set(sigs).size, sigs.length, 'duplicate configs generated');
  // sorted smallest-first and the frontier is non-decreasing in capture
  for (let i = 1; i < cands.length; i++) assert.ok(cands[i].kwh >= cands[i - 1].kwh);
  const frontier = cands.filter((c) => !c.dominated);
  for (let i = 1; i < frontier.length; i++) {
    assert.ok(frontier[i].captureRate > frontier[i - 1].captureRate);
  }
});

test('manual override produces a scored custom config', () => {
  const { normalized, analysis } = loadYear();
  const { shaveKw } = theoreticalRequirement(normalized, analysis, 100);
  const c = manualConfig(normalized, analysis, shaveKw, 500, 2000);
  assert.equal(c.custom, true);
  assert.equal(c.kw, 500);
  assert.ok(c.captureRate > 0 && c.captureRate <= 1);
  assert.equal(c.perMonth.length, analysis.monthly.length);
});
