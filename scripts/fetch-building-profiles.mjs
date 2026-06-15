// Build-time fetch + reduction of NREL ComStock state×building-type load
// shapes into compact normalized profiles bundled with the app.
//
// Source: NREL End-Use Load Profiles for the U.S. Building Stock (DOE-funded),
// ComStock AMY2018, on the OEDI public data lake. Each state aggregate is a
// clean 15-minute annual series (35,040 intervals). We keep only the total
// electricity column, normalize to a per-unit shape (fraction of annual peak),
// and pack it as little-endian uint16 base64 so the user can scale any profile
// to their site by entering a peak kW or annual kWh.
//
// Usage: node scripts/fetch-building-profiles.mjs
// Output: src/data/building-profiles.json
//
// NOTE: downloads ~70 CSVs of ~15 MB each (~1 GB total) but writes only a
// few MB. Re-run to refresh; safe to interrupt and resume (skips cached temp).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const TMP = '/tmp/comstock';
const OUT = join(ROOT, 'src/data/building-profiles.json');

// ---- Configurable scope -----------------------------------------------------
const RELEASE = '2024/comstock_amy2018_release_2';
const BASE = `https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/${RELEASE}/timeseries_aggregates/by_state/upgrade=0`;
const STATES = ['CA', 'NY', 'CT', 'MA', 'NJ'];
const TYPES = [
  ['fullservicerestaurant', 'Full-Service Restaurant'],
  ['quickservicerestaurant', 'Quick-Service Restaurant'],
  ['hospital', 'Hospital'],
  ['outpatient', 'Outpatient Healthcare'],
  ['largehotel', 'Large Hotel'],
  ['smallhotel', 'Small Hotel'],
  ['largeoffice', 'Large Office'],
  ['mediumoffice', 'Medium Office'],
  ['smalloffice', 'Small Office'],
  ['primaryschool', 'Primary School'],
  ['secondaryschool', 'Secondary School'],
  ['retailstandalone', 'Standalone Retail'],
  ['retailstripmall', 'Strip Mall'],
  ['warehouse', 'Warehouse'],
];
const CONCURRENCY = 5;
const INTERVALS = 35040; // 365 × 96

// ---- Helpers ----------------------------------------------------------------
function curl(url, dest) {
  // -f fail on http errors, --retry for transient S3 hiccups
  execFileSync('curl', ['-sf', '--retry', '4', '--retry-delay', '2', '--max-time', '300', '-o', dest, url],
    { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** Parse the two columns we need out of a ComStock aggregate CSV. */
function extractTotalKwh(csvPath) {
  const text = readFileSync(csvPath, 'utf8');
  const nl = text.indexOf('\n');
  const header = text.slice(0, nl).split(',');
  const tsIdx = header.indexOf('timestamp');
  const totIdx = header.indexOf('out.electricity.total.energy_consumption.kwh');
  if (tsIdx < 0 || totIdx < 0) throw new Error(`columns not found (ts=${tsIdx}, tot=${totIdx})`);

  const vals = [];
  let i = nl + 1;
  const n = text.length;
  while (i < n) {
    let end = text.indexOf('\n', i);
    if (end < 0) end = n;
    const line = text.slice(i, end);
    i = end + 1;
    if (!line) continue;
    // These aggregate rows have no quoted commas — plain split is safe.
    const cols = line.split(',');
    const v = parseFloat(cols[totIdx]);
    if (Number.isFinite(v)) vals.push(v);
  }
  return vals;
}

/** Normalize to fraction-of-peak and pack as little-endian uint16 base64. */
function pack(vals) {
  const peak = Math.max(...vals);
  const sum = vals.reduce((a, b) => a + b, 0);
  const u16 = new Uint16Array(vals.length);
  for (let k = 0; k < vals.length; k++) u16[k] = Math.round((vals[k] / peak) * 65535);
  const b64 = Buffer.from(u16.buffer).toString('base64');
  return {
    data: b64,
    loadFactor: +(sum / vals.length / peak).toFixed(4), // mean/peak
    // sumFraction lets the loader scale by annual kWh without unpacking twice
    sumFraction: +(sum / peak).toFixed(2), // Σ(fraction) over the year
    intervals: vals.length,
  };
}

// ---- Main -------------------------------------------------------------------
mkdirSync(TMP, { recursive: true });
mkdirSync(dirname(OUT), { recursive: true });

const jobs = [];
for (const st of STATES) for (const [type] of TYPES) jobs.push({ st, type });

const profiles = {};
let done = 0;
let failed = [];

async function worker(queue) {
  while (queue.length) {
    const { st, type } = queue.shift();
    const key = `${st}:${type}`;
    const url = `${BASE}/state=${st}/up00-${st.toLowerCase()}-${type}.csv`;
    const tmp = join(TMP, `${st}-${type}.csv`);
    try {
      if (!existsSync(tmp) || statSync(tmp).size < 1e6) curl(url, tmp);
      const vals = extractTotalKwh(tmp);
      if (vals.length < INTERVALS - 96 || vals.length > INTERVALS + 96) {
        throw new Error(`unexpected interval count ${vals.length}`);
      }
      profiles[key] = pack(vals);
      rmSync(tmp, { force: true });
    } catch (err) {
      failed.push({ key, err: err.message });
    }
    done++;
    process.stdout.write(`\r  ${done}/${jobs.length} processed (${failed.length} failed)   `);
  }
}

console.log(`Fetching ${jobs.length} ComStock profiles (${STATES.length} states × ${TYPES.length} types)…`);
const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));
process.stdout.write('\n');

if (failed.length) {
  console.warn('Failed:', failed.map((f) => `${f.key} (${f.err})`).join(', '));
}
if (Object.keys(profiles).length === 0) throw new Error('No profiles fetched — aborting.');

const out = {
  meta: {
    source: 'NREL End-Use Load Profiles for the U.S. Building Stock — ComStock AMY2018',
    release: RELEASE,
    publisher: 'National Renewable Energy Laboratory (DOE), via OEDI data lake',
    url: `https://oedi-data-lake.s3.amazonaws.com/nrel-pds-building-stock/end-use-load-profiles-for-us-building-stock/${RELEASE}/`,
    license: 'Public domain (U.S. Government work)',
    retrievedAt: new Date().toISOString().slice(0, 10),
    weatherYear: 2018,
    intervalMin: 15,
    encoding: 'uint16 little-endian, base64; value/65535 = fraction of annual peak (state aggregate shape)',
    note: 'State-aggregate shapes (sum of all simulated buildings of a type). Use as a normalized profile scaled to a site peak kW or annual kWh; not a single-building absolute load.',
  },
  states: STATES,
  buildingTypes: TYPES.map(([id, label]) => ({ id, label })),
  profiles,
};
writeFileSync(OUT, JSON.stringify(out));
console.log(`Wrote ${OUT} — ${Object.keys(profiles).length} profiles, ${(statSync(OUT).size / 1024 / 1024).toFixed(2)} MB`);
