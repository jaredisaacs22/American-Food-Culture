import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  parseIntervalRows, excelSerialToMs, isExcelSerial, parseTimeOnly, parseTimestamp,
} from '../src/modules/intervals/parser.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

/** Round-trip an array-of-arrays through a real .xlsx buffer, reading it back
 *  exactly the way the app does (raw:true, cellDates:false → date serials). */
function throughXlsx(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), name);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: false });
  return Object.fromEntries(wb2.SheetNames.map((n) => [
    n, XLSX.utils.sheet_to_json(wb2.Sheets[n], { header: 1, raw: true, defval: '' }),
  ]));
}

function fourDaysLong(headerRow, valueOf, cellFor) {
  const aoa = [headerRow];
  const start = new Date(2025, 5, 1);
  for (let i = 0; i < 4 * 96; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000);
    aoa.push(cellFor(d, valueOf(i)));
  }
  return aoa;
}

test('excel serial conversion: hand-computed', () => {
  // 2025-06-15 00:00 local is serial 45823 (1900 system)
  assert.equal(excelSerialToMs(45823), new Date(2025, 5, 15).getTime());
  // +6 hours = 0.25 day fraction
  assert.equal(excelSerialToMs(45823.25), new Date(2025, 5, 15, 6).getTime());
  assert.deepEqual(parseTimeOnly(0.25), { hh: 6, mm: 0 });
  assert.deepEqual(parseTimeOnly(45823.0104166667 - 45823 + 45823), { hh: 0, mm: 15 });
  assert.equal(isExcelSerial(45823.5), true);
  assert.equal(isExcelSerial(450), false); // a plausible kW value, not a date
  assert.equal(parseTimestamp(new Date(2025, 5, 15, 14, 30)), new Date(2025, 5, 15, 14, 30).getTime());
});

test('xlsx long format: datetime serial column + kW', () => {
  const aoa = fourDaysLong(['Date/Time', 'kW'], (i) => 100 + (i % 96), (d, v) => [d, v]);
  const sheets = throughXlsx([['Interval Data', aoa]]);
  const rows = sheets['Interval Data'];
  assert.ok(typeof rows[1][0] === 'number', `expected a date serial, got ${typeof rows[1][0]}`);

  const { normalized, source } = parseIntervalRows(rows, 'export.xlsx');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(source.appliedUnit, 'kW');
  assert.equal(source.gapsFilled, 0, 'serial timestamps must not collapse to date-only');
  assert.equal(normalized.kw.length, 4 * 96);
  assert.equal(normalized.startMs, new Date(2025, 5, 1).getTime());
  assert.equal(normalized.kw[0], 100);
  assert.equal(normalized.kw[95], 195);
});

test('xlsx long format: separate date cell + time fraction columns', () => {
  const aoa = fourDaysLong(
    ['Date', 'Start Time', 'kWh'],
    (i) => 25 + (i % 96) / 10,
    (d, v) => [new Date(d.getFullYear(), d.getMonth(), d.getDate()),
      (d.getHours() * 60 + d.getMinutes()) / 1440, v],
  );
  const sheets = throughXlsx([['Sheet1', aoa]]);
  const { normalized, source } = parseIntervalRows(sheets['Sheet1'], 'export.xlsx');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(source.appliedUnit, 'kWh');
  assert.equal(source.gapsFilled, 0);
  assert.equal(normalized.kw.length, 4 * 96);
  // kWh over 15 min -> kW = value × 4
  assert.equal(normalized.kw[0], 100);
});

test('xlsx wide format: date serial rows × time-of-day headers', () => {
  const header = ['Date', ...Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4);
    const m = (i % 4) * 15;
    return `${h}:${String(m).padStart(2, '0')}`;
  }), 'Units'];
  const aoa = [header];
  for (let day = 1; day <= 4; day++) {
    aoa.push([new Date(2025, 5, day), ...Array.from({ length: 96 }, (_, i) => 10 + i / 100), 'kWh']);
  }
  const sheets = throughXlsx([['Usage', aoa]]);
  const { normalized, source } = parseIntervalRows(sheets['Usage'], 'wide.xlsx');
  assert.equal(source.detectedIntervalMin, 15);
  assert.equal(normalized.kw.length, 4 * 96);
});

test('app pickBestSheet skips cover sheets', async () => {
  globalThis.XLSX = XLSX; // module under test uses the XLSX global like the browser
  const { pickBestSheet } = await import('../src/modules/intervals/index.js');
  const data = fourDaysLong(['Date/Time', 'kWh'], (i) => 5 + (i % 10), (d, v) => [d, v]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Interval Usage Export'], ['Account', '123'], ['See next sheet'],
  ]), 'Report Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data, { cellDates: true }), 'Interval Data');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx', cellDates: true });
  const wb2 = XLSX.read(buf, { type: 'buffer', cellDates: false });

  const { rows, notes } = pickBestSheet(wb2);
  assert.equal(rows.length, data.length);
  assert.ok(notes[0].includes('used "Interval Data"'), notes[0]);

  // all-cover workbook -> clear error listing what was tried
  const wbBad = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wbBad, XLSX.utils.aoa_to_sheet([['hello'], ['world']]), 'Notes');
  const bufBad = XLSX.write(wbBad, { type: 'buffer', bookType: 'xlsx' });
  assert.throws(() => pickBestSheet(XLSX.read(bufBad, { type: 'buffer' })), /Sheets tried: "Notes"/);
});

test('generated sample xlsx files parse like their CSV twins', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseCsv } = await import('../src/modules/intervals/parser.js');
  const csvRows = parseCsv(readFileSync(new URL('../sample-data/generic_15min_kw.csv', import.meta.url), 'utf8'));
  const csvParsed = parseIntervalRows(csvRows, 'generic_15min_kw.csv');

  const wb = XLSX.read(readFileSync(new URL('../sample-data/generic_15min_kw.xlsx', import.meta.url)), { cellDates: false });
  globalThis.XLSX = XLSX;
  const { pickBestSheet } = await import('../src/modules/intervals/index.js');
  const { rows } = pickBestSheet(wb);
  const xlsxParsed = parseIntervalRows(rows, 'generic_15min_kw.xlsx');

  assert.equal(xlsxParsed.normalized.kw.length, csvParsed.normalized.kw.length);
  assert.equal(xlsxParsed.normalized.startMs, csvParsed.normalized.startMs);
  // identical series within float rounding
  for (let i = 0; i < 500; i++) {
    assert.ok(Math.abs(xlsxParsed.normalized.kw[i] - csvParsed.normalized.kw[i]) < 0.01, `idx ${i}`);
  }
});
