import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrateFromInvoices, monthShapeStats } from '../src/modules/intervals/invoice.js';
import { profileFractions, profileLibrary } from '../src/modules/intervals/profiles.js';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';

const STEP_HOURS = 0.25;

function monthStats(normalized, month) {
  const { startMs, kw } = normalized;
  let peak = 0;
  let sum = 0;
  for (let i = 0; i < kw.length; i++) {
    const d = new Date(startMs + i * 15 * 60000);
    if (d.getMonth() + 1 !== month) continue;
    if (kw[i] > peak) peak = kw[i];
    sum += kw[i];
  }
  return { peakKw: peak, kwh: sum * STEP_HOURS };
}

test('monthShapeStats: 12 months covering the full year', () => {
  const frac = profileFractions('CA', 'warehouse');
  const { months } = monthShapeStats(frac, profileLibrary().meta.weatherYear);
  assert.equal(months.length, 12);
  assert.equal(months.reduce((s, m) => s + m.n, 0), frac.length);
  assert.deepEqual(months.map((m) => m.month), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('full 12 invoices: every month matches billed kWh and peak kW exactly', () => {
  const entries = [];
  for (let m = 1; m <= 12; m++) {
    // seasonal energy + peaks like a real site
    const summer = m >= 6 && m <= 9 ? 1.3 : 1.0;
    entries.push({ month: m, kwh: 90000 * summer, peakKw: 420 * summer });
  }
  const { normalized, source } = calibrateFromInvoices('NJ', 'warehouse', entries);
  assert.equal(source.fidelity, 'invoice');
  for (const e of entries) {
    const got = monthStats(normalized, e.month);
    assert.ok(Math.abs(got.kwh - e.kwh) / e.kwh < 0.005, `month ${e.month} kWh: ${got.kwh} vs ${e.kwh}`);
    assert.ok(Math.abs(got.peakKw - e.peakKw) / e.peakKw < 0.005, `month ${e.month} peak: ${got.peakKw} vs ${e.peakKw}`);
  }
  // calibration table agrees and is flagged measured
  for (const c of source.invoice.calibration) {
    assert.equal(c.measured, true);
    assert.ok(Math.abs(c.kwhOut - c.kwhIn) / c.kwhIn < 0.005);
  }
});

test('three invoices: provided months exact, missing months inferred and flagged', () => {
  const entries = [
    { month: 1, kwh: 80000, peakKw: 380 },
    { month: 7, kwh: 120000, peakKw: 520 },
    { month: 10, kwh: 90000, peakKw: 400 },
  ];
  const { normalized, source } = calibrateFromInvoices('CA', 'retailstandalone', entries);
  for (const e of entries) {
    const got = monthStats(normalized, e.month);
    assert.ok(Math.abs(got.kwh - e.kwh) / e.kwh < 0.005, `m${e.month} kwh`);
    assert.ok(Math.abs(got.peakKw - e.peakKw) / e.peakKw < 0.005, `m${e.month} peak`);
  }
  const inferred = source.invoice.calibration.filter((c) => !c.measured);
  assert.equal(inferred.length, 9);
  assert.ok(source.notes.some((n) => /INFERRED/.test(n)));
  // inferred months are in a plausible range of the provided ones
  for (const c of inferred) {
    assert.ok(c.peakIn > 100 && c.peakIn < 1000, `month ${c.month} inferred peak ${c.peakIn}`);
  }
});

test('kWh without billed kW: peak inferred from shape load factor', () => {
  const entries = [{ month: 6, kwh: 100000 }];
  const { source } = calibrateFromInvoices('NY', 'mediumoffice', entries);
  const c = source.invoice.calibration.find((x) => x.month === 6);
  assert.equal(c.measured, true);
  assert.equal(c.peakMeasured, false);
  assert.ok(c.peakIn > c.kwhIn / (30 * 24), 'inferred peak above the月 average');
  assert.ok(source.notes.some((n) => /no billed kW/.test(n)));
});

test('peaky site (low load factor): flooring keeps BOTH peak and energy', () => {
  // Very peaky vs any building shape: LF ~0.18
  const entries = [{ month: 3, kwh: 40000, peakKw: 300 }];
  const { normalized } = calibrateFromInvoices('MA', 'smalloffice', entries);
  const got = monthStats(normalized, 3);
  assert.ok(Math.abs(got.peakKw - 300) / 300 < 0.01, `peak ${got.peakKw}`);
  assert.ok(Math.abs(got.kwh - 40000) / 40000 < 0.01, `kwh ${got.kwh}`);
  assert.ok(Math.min(...normalized.kw) >= 0, 'no negative loads');
});

test('impossible invoice (peak below average) throws a clear error', () => {
  // 100,000 kWh over ~720h -> avg ~139 kW; claiming a 100 kW peak is impossible
  assert.throws(
    () => calibrateFromInvoices('CT', 'warehouse', [{ month: 5, kwh: 100000, peakKw: 100 }]),
    /below the average/,
  );
});

test('no usable entries throws', () => {
  assert.throws(() => calibrateFromInvoices('CA', 'warehouse', []), /at least one month/);
  assert.throws(() => calibrateFromInvoices('CA', 'warehouse', [{ month: 3 }]), /at least one month/);
});

test('calibrated year feeds the analysis pipeline (worst days intact)', () => {
  const entries = [
    { month: 2, kwh: 70000, peakKw: 350 },
    { month: 8, kwh: 110000, peakKw: 500 },
  ];
  const { normalized, source } = calibrateFromInvoices('CA', 'secondaryschool', entries);
  const a = analyzeIntervals(normalized);
  assert.equal(a.monthly.length, 12);
  // Annual peak = the max across all calibrated months (an inferred month may
  // legitimately run hotter than the largest provided invoice if the shape
  // says so), and must be at least the largest invoiced peak.
  const maxCal = Math.max(...source.invoice.calibration.map((c) => c.peakOut));
  assert.ok(Math.abs(a.overall.peakKw - maxCal) < 1, `annual peak ${a.overall.peakKw} vs calibration ${maxCal}`);
  assert.ok(a.overall.peakKw >= 500 - 1, 'annual peak at least the invoiced August peak');
  for (const m of a.monthly) {
    assert.equal(m.worstDay.peakKw, m.peakKw, `${m.key} worst day must contain the month peak`);
  }
});
