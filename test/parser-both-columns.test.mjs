import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntervalRows, detectLayout } from '../src/modules/intervals/parser.js';

// Build a full year of 15-min rows. valueFn(i) -> kW for interval i.
function yearRows(headers, cellFn, days = 365) {
  const rows = [headers];
  const start = new Date(2023, 0, 1); // 2023: non-leap, 365 days
  const n = days * 96;
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000);
    const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    rows.push(cellFn(ts, i));
  }
  return rows;
}

// A realistic-ish daily shape so peaks/averages are sane.
function kwAt(i) {
  const hour = Math.floor(i / 4) % 24;
  const base = 100 + 80 * Math.sin(((hour - 6) / 24) * 2 * Math.PI);
  return Math.round(base * 100) / 100;
}

test('both kW and kWh columns: prefers kW, cross-check passes', () => {
  const rows = yearRows(['Timestamp', 'kW', 'kWh'], (ts, i) => {
    const kw = kwAt(i);
    return [ts, kw, Math.round(kw * 0.25 * 1000) / 1000]; // kWh = kW × 0.25h
  });
  const layout = detectLayout(rows);
  assert.equal(layout.type, 'long');
  assert.equal(layout.cols.valueCols.length, 2, 'both value columns detected');

  const { normalized, source } = parseIntervalRows(rows, 'both.csv');
  assert.equal(source.appliedUnit, 'kW', 'kW preferred when both present');
  assert.equal(source.valueColumns.length, 2);
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(normalized.kw.length, 365 * 96);
  assert.equal(source.coverage.isFullYear, true);
  // cross-check: kWh/kW ≈ 0.25 h
  assert.ok(source.consistency, 'consistency check present');
  assert.equal(source.consistency.agrees, true);
  assert.ok(Math.abs(source.consistency.medianRatioHours - 0.25) < 0.01);
  // peak from kW column
  assert.ok(Math.abs(Math.max(...normalized.kw) - 180) < 1);
});

test('both columns: forcing the kWh column yields the same kW series', () => {
  const rows = yearRows(['Timestamp', 'kW', 'kWh'], (ts, i) => {
    const kw = kwAt(i);
    return [ts, kw, Math.round(kw * 0.25 * 1000) / 1000];
  });
  const layout = detectLayout(rows);
  const kwhCol = layout.cols.valueCols.find((v) => v.unit === 'kWh').col;

  const viaKw = parseIntervalRows(rows, 'both.csv'); // defaults to kW col
  const viaKwh = parseIntervalRows(rows, 'both.csv', { valueCol: kwhCol });
  assert.equal(viaKwh.source.appliedUnit, 'kWh');
  // kWh column ÷ 0.25 must reproduce the kW column within rounding
  for (let i = 0; i < 1000; i++) {
    assert.ok(Math.abs(viaKw.normalized.kw[i] - viaKwh.normalized.kw[i]) < 0.02, `idx ${i}`);
  }
});

test('both columns mismatch: kWh that implies 60-min flags a warning', () => {
  // kWh = kW × 1.0 (as if 60-min), but timestamps are 15-min -> mismatch
  const rows = yearRows(['Timestamp', 'kW', 'kWh'], (ts, i) => {
    const kw = kwAt(i);
    return [ts, kw, kw]; // ratio 1.0 h, not 0.25 h
  });
  const { source } = parseIntervalRows(rows, 'mismatch.csv');
  assert.equal(source.consistency.agrees, false);
  assert.equal(source.consistency.impliedIntervalMin, 60);
  assert.ok(source.notes.some((n) => /cross-check/i.test(n) && /^⚠/.test(n)));
});

test('kW-only and kWh-only still parse correctly (regression)', () => {
  const kwOnly = yearRows(['Timestamp', 'Demand (kW)'], (ts, i) => [ts, kwAt(i)]);
  const a = parseIntervalRows(kwOnly, 'kw.csv');
  assert.equal(a.source.appliedUnit, 'kW');
  assert.equal(a.source.consistency, null, 'no cross-check with a single column');
  assert.ok(Math.abs(Math.max(...a.normalized.kw) - 180) < 1);

  const kwhOnly = yearRows(['Timestamp', 'Usage (kWh)'], (ts, i) => [ts, Math.round(kwAt(i) * 0.25 * 1000) / 1000]);
  const b = parseIntervalRows(kwhOnly, 'kwh.csv');
  assert.equal(b.source.appliedUnit, 'kWh');
  // kWh→kW: peak demand recovered
  assert.ok(Math.abs(Math.max(...b.normalized.kw) - 180) < 1);
});

test('coverage flags a partial year', () => {
  const rows = yearRows(['Timestamp', 'kW'], (ts, i) => [ts, kwAt(i)], 90); // one quarter
  const { source } = parseIntervalRows(rows, 'q1.csv');
  assert.equal(source.coverage.isFullYear, false);
  assert.equal(source.coverage.days, 90);
  assert.ok(source.notes.some((n) => /full year/i.test(n)));
});

test('leap year (366 days) parses as a full year', () => {
  const rows = [['Timestamp', 'kW']];
  const start = new Date(2024, 0, 1); // leap year
  for (let i = 0; i < 366 * 96; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000);
    rows.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, kwAt(i)]);
  }
  const { normalized, source } = parseIntervalRows(rows, 'leap.csv');
  assert.equal(normalized.kw.length, 366 * 96);
  assert.equal(source.coverage.isFullYear, true);
  assert.equal(source.detectedIntervalMin, 15);
});
