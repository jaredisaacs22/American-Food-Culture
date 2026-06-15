import test from 'node:test';
import assert from 'node:assert/strict';
import { profileLibrary, loadReferenceProfile } from '../src/modules/intervals/profiles.js';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';

test('library has all 5 states × 14 types', () => {
  const lib = profileLibrary();
  assert.deepEqual(lib.states, ['CA', 'NY', 'CT', 'MA', 'NJ']);
  assert.equal(lib.buildingTypes.length, 14);
  for (const s of lib.states) {
    for (const t of lib.buildingTypes) {
      assert.ok(lib.profiles[`${s}:${t.id}`], `missing ${s}:${t.id}`);
    }
  }
  assert.equal(Object.keys(lib.profiles).length, 70);
});

test('scale by peak kW: peak matches, length is a full year', () => {
  const { normalized, source } = loadReferenceProfile('CA', 'largeoffice', { mode: 'peakKw', value: 800 });
  assert.equal(normalized.kw.length, 35040);
  assert.equal(normalized.stepMin, 15);
  const peak = Math.max(...normalized.kw);
  assert.ok(Math.abs(peak - 800) < 0.5, `peak ${peak} should be ~800`);
  assert.equal(normalized.gapsFilled, 0);
  assert.equal(source.reference.impliedPeakKw, 800);
  assert.equal(source.appliedUnit, 'kW');
});

test('scale by annual kWh: total energy matches within rounding', () => {
  const target = 2_000_000;
  const { normalized, source } = loadReferenceProfile('NJ', 'warehouse', { mode: 'annualKwh', value: target });
  const total = normalized.kw.reduce((a, b) => a + b, 0) * 0.25;
  assert.ok(Math.abs(total - target) / target < 0.002, `total ${total} vs ${target}`);
  assert.ok(source.reference.impliedAnnualKwh > 0);
});

test('decoded fractions are normalized to [0,1] with peak == 1', () => {
  const lib = profileLibrary();
  const entry = lib.profiles['MA:hospital'];
  // load factor is mean/peak; must be a sane building load factor
  assert.ok(entry.loadFactor > 0.2 && entry.loadFactor < 0.95, `lf ${entry.loadFactor}`);
  const { normalized } = loadReferenceProfile('MA', 'hospital', { mode: 'peakKw', value: 1 });
  const peak = Math.max(...normalized.kw);
  const min = Math.min(...normalized.kw);
  assert.ok(Math.abs(peak - 1) < 0.001);
  assert.ok(min >= 0);
  // reported load factor should match the actual series within quantization
  const mean = normalized.kw.reduce((a, b) => a + b, 0) / normalized.kw.length;
  assert.ok(Math.abs(mean - entry.loadFactor) < 0.01, `lf mismatch ${mean} vs ${entry.loadFactor}`);
});

test('profile feeds the analysis pipeline cleanly', () => {
  const { normalized } = loadReferenceProfile('NY', 'secondaryschool', { mode: 'peakKw', value: 1200 });
  const a = analyzeIntervals(normalized);
  assert.equal(a.monthly.length, 12);
  assert.ok(Math.abs(a.overall.peakKw - 1200) < 1);
  // every month's worst day contains that month's peak
  for (const m of a.monthly) assert.equal(m.worstDay.peakKw, m.peakKw);
  // duration curve non-increasing
  for (let i = 1; i < a.durationCurve.kw.length; i++) {
    assert.ok(a.durationCurve.kw[i] <= a.durationCurve.kw[i - 1] + 1e-9);
  }
});

test('unknown profile throws, bad scale throws', () => {
  assert.throws(() => loadReferenceProfile('CA', 'nonexistent', { mode: 'peakKw', value: 1 }));
  assert.throws(() => loadReferenceProfile('CA', 'warehouse', { mode: 'peakKw', value: 0 }));
  assert.throws(() => loadReferenceProfile('CA', 'warehouse', { mode: 'annualKwh', value: -5 }));
});
