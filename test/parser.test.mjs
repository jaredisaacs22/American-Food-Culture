import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseIntervalRows, detectLayout, parseTimestamp, combineDateTime } from '../src/modules/intervals/parser.js';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';

function load(file) {
  return parseCsv(readFileSync(new URL(`../sample-data/${file}`, import.meta.url), 'utf8'));
}

test('timestamp parsing variants', () => {
  const a = parseTimestamp('2025-06-15 14:30');
  assert.equal(new Date(a).getHours(), 14);
  const b = parseTimestamp('6/15/2025 2:30 PM');
  assert.equal(a, b);
  const c = combineDateTime('6/15/2025', '14:30');
  assert.equal(a, c);
  const d = combineDateTime('6/15/2025', '0:00-0:15');
  assert.equal(new Date(d).getHours(), 0);
});

test('generic 15-min kW: detection, gaps, analysis', () => {
  const rows = load('generic_15min_kw.csv');
  const { normalized, source } = parseIntervalRows(rows, 'generic_15min_kw.csv');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(source.appliedUnit, 'kW');
  // Two gap days × 4 hours × 4 intervals = 32 filled
  assert.equal(source.gapsFilled, 32);
  assert.equal(normalized.kw.length, 365 * 96);

  const a = analyzeIntervals(normalized);
  assert.equal(a.monthly.length, 12);
  assert.ok(a.overall.peakKw > 400 && a.overall.peakKw < 700, `peak ${a.overall.peakKw}`);
  assert.ok(a.overall.avgKw > 100 && a.overall.avgKw < 300);
  assert.ok(a.overall.loadFactor > 0.2 && a.overall.loadFactor < 0.7);
  // Worst day must contain the month's peak
  for (const m of a.monthly) {
    assert.equal(m.worstDay.peakKw, m.peakKw, `worst-day peak mismatch in ${m.key}`);
  }
  // Summer months should peak higher than winter (cooling load)
  const aug = a.monthly.find((m) => m.key === '2025-08');
  const feb = a.monthly.find((m) => m.key === '2025-02');
  assert.ok(aug.peakKw > feb.peakKw);
  // Duration curve is non-increasing
  for (let i = 1; i < a.durationCurve.kw.length; i++) {
    assert.ok(a.durationCurve.kw[i] <= a.durationCurve.kw[i - 1] + 1e-9);
  }
});

test('generic hourly kWh: kWh->kW conversion and 60->15 expansion', () => {
  const rows = load('generic_60min_kwh.csv');
  const { normalized, source } = parseIntervalRows(rows, 'generic_60min_kwh.csv');
  assert.equal(source.detectedIntervalMin, 60);
  assert.equal(source.appliedUnit, 'kWh');
  assert.equal(normalized.kw.length, 365 * 96); // each hour expands to 4 sub-intervals
  // Energy must be preserved: sum(kw)*0.25h ≈ sum of file kWh
  const kwhTotal = rows.slice(1).reduce((s, r) => s + parseFloat(r[1]), 0);
  const normTotal = normalized.kw.reduce((s, v) => s + v, 0) * 0.25;
  assert.ok(Math.abs(normTotal - kwhTotal) / kwhTotal < 0.0001, `${normTotal} vs ${kwhTotal}`);
});

test('SDG&E-style long format with preamble', () => {
  const rows = load('sdge_style_long.csv');
  const layout = detectLayout(rows);
  assert.equal(layout.type, 'long');
  const { normalized, source } = parseIntervalRows(rows, 'sdge_style_long.csv');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(source.appliedUnit, 'kWh');
  assert.equal(source.gapsFilled, 0);
  assert.equal(normalized.kw.length, 365 * 96);
});

test('SCE-style wide format (date × 96 columns)', () => {
  const rows = load('sce_style_wide.csv');
  const layout = detectLayout(rows);
  assert.equal(layout.type, 'wide');
  const { normalized, source } = parseIntervalRows(rows, 'sce_style_wide.csv');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(source.appliedUnit, 'kWh');
  assert.equal(normalized.kw.length, 365 * 96);
});

test('Green Button-style export with UNITS column', () => {
  const rows = load('greenbutton_style.csv');
  const { normalized, source } = parseIntervalRows(rows, 'greenbutton_style.csv');
  assert.equal(source.detectedIntervalMin, 60);
  assert.equal(source.appliedUnit, 'kWh');
  assert.equal(normalized.kw.length, 365 * 96);
});

test('all formats agree on the underlying load shape', () => {
  const peaks = [];
  for (const f of ['generic_15min_kw.csv', 'sdge_style_long.csv', 'sce_style_wide.csv']) {
    const { normalized } = parseIntervalRows(load(f), f);
    const a = analyzeIntervals(normalized);
    peaks.push(a.overall.peakKw);
  }
  // same synthetic year — peaks should match within rounding
  assert.ok(Math.abs(peaks[0] - peaks[1]) < 1, `${peaks[0]} vs ${peaks[1]}`);
  assert.ok(Math.abs(peaks[0] - peaks[2]) < 1, `${peaks[0]} vs ${peaks[2]}`);
});

test('manual override changes interpretation', () => {
  const rows = load('generic_15min_kw.csv');
  const base = parseIntervalRows(rows, 'f.csv');
  const forced = parseIntervalRows(rows, 'f.csv', { unit: 'kWh' });
  // treating kW numbers as 15-min kWh multiplies kW by 4
  assert.ok(Math.abs(forced.normalized.kw[0] - base.normalized.kw[0] * 4) < 0.01);
});
