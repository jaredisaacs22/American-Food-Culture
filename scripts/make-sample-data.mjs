// Generates synthetic interval-data files in sample-data/ covering each
// supported input format, for parser testing and demos.
// Profile: light-industrial site, ~120 kW base, weekday daytime ~380 kW,
// summer-afternoon cooling adds up to ~160 kW. Deterministic (seeded PRNG).
import { writeFileSync, mkdirSync } from 'node:fs';

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(42);

/** kW at a local Date — the "true" 15-min load shape. */
export function loadKw(d) {
  const h = d.getHours() + d.getMinutes() / 60;
  const dow = d.getDay();
  const month = d.getMonth(); // 0-11
  const weekday = dow >= 1 && dow <= 5;

  let kw = 120; // base
  if (weekday) {
    // business-hours block 6:00-18:00 with ramps
    const ramp = Math.min(1, Math.max(0, (h - 5.5) / 1.5)) * Math.min(1, Math.max(0, (19 - h) / 1.5));
    kw += 260 * ramp;
  } else {
    kw += 40 * Math.exp(-((h - 13) ** 2) / 18);
  }
  // summer cooling peak, strongest Jun-Sep mid-afternoon
  const seasonal = Math.max(0, Math.cos(((month - 7) / 12) * 2 * Math.PI));
  kw += 160 * seasonal * Math.exp(-((h - 15.5) ** 2) / 8) * (weekday ? 1 : 0.5);
  kw += (rand() - 0.5) * 18; // noise
  if (rand() < 0.0008) kw += 80; // occasional spike
  return Math.max(40, kw);
}

function* iterate15min(year) {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  for (let t = start.getTime(); t < end.getTime(); t += 15 * 60000) yield new Date(t);
}

function pad(x) { return String(x).padStart(2, '0'); }
function isoLocal(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function mdy(d) { return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; }
function hm(d) { return `${d.getHours()}:${pad(d.getMinutes())}`; }

const YEAR = 2025;
mkdirSync('sample-data', { recursive: true });

// Pre-compute the year once so all files share the same data.
const series = [...iterate15min(YEAR)].map((d) => ({ d, kw: loadKw(d) }));

// 1) Generic 15-min kW with a few gaps (tests interpolation)
{
  const gapDays = new Set(['2025-03-14', '2025-09-02']);
  const lines = ['Timestamp,kW'];
  for (const { d, kw } of series) {
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    // drop 10:00-13:45 on gap days
    if (gapDays.has(key) && d.getHours() >= 10 && d.getHours() < 14) continue;
    lines.push(`${isoLocal(d)},${kw.toFixed(2)}`);
  }
  writeFileSync('sample-data/generic_15min_kw.csv', lines.join('\n'));
}

// 2) Generic hourly kWh (tests 60-min + kWh->kW + expansion)
{
  const lines = ['Timestamp,Usage (kWh)'];
  for (let i = 0; i < series.length; i += 4) {
    const chunk = series.slice(i, i + 4);
    const kwh = chunk.reduce((s, p) => s + p.kw, 0) * 0.25;
    lines.push(`${isoLocal(chunk[0].d)},${kwh.toFixed(3)}`);
  }
  writeFileSync('sample-data/generic_60min_kwh.csv', lines.join('\n'));
}

// 3) SDG&E-style long format with preamble (15-min kWh, date+time columns)
{
  const lines = [
    'Name,SAMPLE CUSTOMER',
    'Address,"123 Industrial Way, San Diego, CA"',
    'Account Number,1234567890',
    'Service,Electric',
    '',
    'Meter Number,Date,Start Time,Duration,Consumption,Generation,Net',
  ];
  for (const { d, kw } of series) {
    const kwh = kw * 0.25;
    lines.push(`05551234,${mdy(d)},${hm(d)},15,${kwh.toFixed(4)},0,${kwh.toFixed(4)}`);
  }
  writeFileSync('sample-data/sdge_style_long.csv', lines.join('\n'));
}

// 4) SCE-style wide format: one row per day, 96 time-of-day kWh columns
{
  const times = [];
  for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 15) times.push(`${h}:${pad(m)}`);
  const lines = [
    'Energy Usage Report (kWh) - Service Account 8001234567',
    '',
    `Date,${times.join(',')}`,
  ];
  for (let i = 0; i < series.length; i += 96) {
    const day = series.slice(i, i + 96);
    lines.push(`${mdy(day[0].d)},${day.map((p) => (p.kw * 0.25).toFixed(4)).join(',')}`);
  }
  writeFileSync('sample-data/sce_style_wide.csv', lines.join('\n'));
}

// 5) Green Button-style CSV export (hourly kWh with UNITS column)
{
  const lines = [
    'Green Button Download My Data',
    'Retail Customer,SAMPLE CUSTOMER',
    '',
    'TYPE,DATE,START TIME,END TIME,USAGE,UNITS,COST,NOTES',
  ];
  for (let i = 0; i < series.length; i += 4) {
    const chunk = series.slice(i, i + 4);
    const kwh = chunk.reduce((s, p) => s + p.kw, 0) * 0.25;
    const d0 = chunk[0].d;
    const d1 = new Date(d0.getTime() + 59 * 60000);
    lines.push(`Electric usage,${mdy(d0)},${hm(d0)},${hm(d1)},${kwh.toFixed(2)},kWh,$0.00,`);
  }
  writeFileSync('sample-data/greenbutton_style.csv', lines.join('\n'));
}

console.log('sample-data/ written: 5 files for year', YEAR);
