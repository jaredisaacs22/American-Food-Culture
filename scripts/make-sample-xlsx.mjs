// Generate sample XLSX files from the CSV samples, using REAL Excel date
// cells (serials) and a cover sheet first — the shape utility exports
// actually arrive in. Usage: node scripts/make-sample-xlsx.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/modules/intervals/parser.js';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

function loadCsv(name) {
  return parseCsv(readFileSync(new URL(`../sample-data/${name}`, import.meta.url), 'utf8'));
}

// ---- Long format: true datetime cells + kW values, behind a cover sheet ----
{
  const csv = loadCsv('generic_15min_kw.csv');
  const aoa = [['Date/Time', 'kW']];
  for (let i = 1; i < csv.length; i++) {
    const [ts, kw] = csv[i];
    const d = new Date(ts.replace(' ', 'T'));
    aoa.push([d, +kw]);
  }
  const wb = XLSX.utils.book_new();
  const cover = XLSX.utils.aoa_to_sheet([
    ['Interval Usage Export'],
    ['Account', '1234567890'],
    ['Generated', new Date().toLocaleDateString()],
    ['See the "Interval Data" sheet for readings.'],
  ]);
  XLSX.utils.book_append_sheet(wb, cover, 'Report Info');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Interval Data');
  XLSX.writeFile(wb, new URL('../sample-data/generic_15min_kw.xlsx', import.meta.url).pathname, { cellDates: true, compression: true });
  console.log('sample-data/generic_15min_kw.xlsx written:', aoa.length - 1, 'rows + cover sheet');
}

// ---- Wide format: date cells down column A, time-of-day headers ----
{
  const csv = loadCsv('sce_style_wide.csv');
  // find the header row (first row with many time columns)
  const headerIdx = csv.findIndex((r) => r.filter((c) => /^\d{1,2}:\d{2}/.test(String(c).trim())).length >= 20);
  const aoa = csv.slice(0, headerIdx + 1);
  for (let i = headerIdx + 1; i < csv.length; i++) {
    const row = [...csv[i]];
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(row[0]).trim());
    if (m) row[0] = new Date(+m[3], +m[1] - 1, +m[2]);
    for (let c = 1; c < row.length; c++) if (row[c] !== '') row[c] = +row[c];
    aoa.push(row);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), 'Usage');
  XLSX.writeFile(wb, new URL('../sample-data/sce_style_wide.xlsx', import.meta.url).pathname, { cellDates: true, compression: true });
  console.log('sample-data/sce_style_wide.xlsx written:', aoa.length, 'rows');
}
