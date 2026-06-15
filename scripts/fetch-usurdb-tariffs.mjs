#!/usr/bin/env node
// Build-time extractor: pulls real C&I utility rate data out of the OpenEI
// USURDB dump and projects it into this app's tariff schema
// (see src/modules/tariffs/calc.js for the field meanings).
//
// Everything produced is flagged `placeholder: true` because the projection
// from USURDB's raw period/tier/schedule arrays into a single on/off-peak
// window model is lossy and unverified. VERIFY against filed tariff sheets.
//
// Usage:  node scripts/fetch-usurdb-tariffs.mjs
//   - Reuses /tmp/usurdb.csv if present, else downloads + gunzips it.
//
// Node built-ins only (ESM). No npm deps.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import https from 'node:https';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// CONFIG — edit these freely.
// ---------------------------------------------------------------------------
const CSV_PATH = '/tmp/usurdb.csv';
const DOWNLOAD_URL = 'https://apps.openei.org/USURDB/download/usurdb.csv.gz';
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'src', 'data', 'usurdb-tariffs.json');
const RETRIEVED_AT = new Date().toISOString().slice(0, 10);
const CAP_PER_UTILITY = 8; // keep at most this many schedules per utility

// utility-name substrings (lowercase) to match, grouped by state for reporting.
const TARGET_UTILITIES = {
  CA: ['san diego gas', 'southern california edison', 'pacific gas'],
  NY: [
    'long island', 'consolidated edison',
    'orange and rockland', 'orange & rockland', // USURDB uses the ampersand form
    'niagara mohawk', 'new york state electric', 'rochester gas', 'central hudson',
  ],
  CT: ['connecticut light', 'united illuminating', 'eversource'],
  MA: [
    'massachusetts electric', 'nstar', 'boston edison', 'cambridge electric',
    'commonwealth electric', 'fitchburg', 'western massachusetts',
  ],
  NJ: [
    'public service electric', 'public service elec', // PSE&G appears as "Public Service Elec & Gas Co"
    'jersey central', 'atlantic city electric',
    'rockland electric',
  ],
};
const ALL_SUBSTRINGS = Object.values(TARGET_UTILITIES).flat();

const DEFAULT_SUMMER_MONTHS = [6, 7, 8, 9, 10];

// ---------------------------------------------------------------------------
// Download (if needed)
// ---------------------------------------------------------------------------
function download(url, destPath) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} ...`);
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        download(res.headers.location, destPath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${res.statusCode}`));
        return;
      }
      const out = fs.createWriteStream(destPath);
      const gunzip = zlib.createGunzip();
      res.pipe(gunzip).pipe(out);
      out.on('finish', () => out.close(resolve));
      out.on('error', reject);
      gunzip.on('error', reject);
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Streaming, quote-aware CSV parser.  Calls onRow(arrayOfFields).
// Handles quoted fields containing commas, brackets and embedded newlines.
// Never buffers more than one logical row.
// ---------------------------------------------------------------------------
function streamCsv(filePath, onRow) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
    let inQuote = false;
    let field = '';
    let row = [];
    let pendingQuote = false; // saw a '"' inside a quoted field; could be escape or close

    rs.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const c = chunk[i];
        if (inQuote) {
          if (pendingQuote) {
            pendingQuote = false;
            if (c === '"') { field += '"'; continue; } // escaped quote
            inQuote = false; // the prior quote actually closed the field; fall through
          } else if (c === '"') {
            pendingQuote = true;
            continue;
          } else {
            field += c;
            continue;
          }
        }
        // not in quote (or just left it)
        if (c === '"') {
          inQuote = true;
        } else if (c === ',') {
          row.push(field); field = '';
        } else if (c === '\n') {
          row.push(field); field = '';
          onRow(row); row = [];
        } else if (c === '\r') {
          // ignore
        } else {
          field += c;
        }
      }
    });
    rs.on('error', reject);
    rs.on('end', () => {
      if (field.length || row.length) { row.push(field); onRow(row); }
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n, d = 4) => {
  const f = 10 ** d;
  return Math.round((Number.isFinite(n) ? n : 0) * f) / f;
};

// parse a serialized 12x24 grid of ints; return null if unparseable.
function parseSchedule(raw) {
  if (!raw || !raw.trim()) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const grid = arr.map((mo) =>
      Array.isArray(mo) ? mo.map((x) => (Number.isFinite(+x) ? +x : 0)) : []);
    // require something resembling 12 months x 24 hours
    if (grid.length < 12) return null;
    if (grid.some((mo) => mo.length < 24)) return null;
    return grid.slice(0, 12).map((mo) => mo.slice(0, 24));
  } catch {
    return null;
  }
}

// Pull the period0..periodN tier0 rates (incl. adj) for a given prefix.
// returns array indexed by period number.
function readRateStructure(rec, idx, prefix) {
  const rates = [];
  for (let p = 0; p < 40; p++) {
    const key = `${prefix}/period${p}/tier0rate`;
    if (!(key in idx)) break;
    const v = rec[idx[key]];
    if (v === undefined || v === '') {
      // a missing period0 means no structure at all; missing later = end
      if (p === 0) { rates.push(NaN); break; }
      break;
    }
    const adjKey = `${prefix}/period${p}/tier0adj`;
    const adj = adjKey in idx ? num(rec[idx[adjKey]]) : 0;
    rates.push(num(v) + adj);
  }
  return rates;
}

// From a 12x24 schedule + per-period rate array, build per-month summary:
// { onPeriod, offPeriod, onHours:[start,end] (per month) }.
function analyzeEnergy(grid, rates) {
  // rate of a period index, 0 if unknown
  const rateOf = (p) => (Number.isFinite(rates[p]) ? rates[p] : 0);
  const months = [];
  for (let m = 0; m < 12; m++) {
    const hours = grid[m];
    let onP = hours[0], offP = hours[0];
    for (const p of hours) {
      if (rateOf(p) > rateOf(onP)) onP = p;
      if (rateOf(p) < rateOf(offP)) offP = p;
    }
    months.push({ onP, offP, hours });
  }
  return months;
}

// Find the longest contiguous run (with wraparound) of hours whose period == target.
function longestRun(hours, targetPeriod) {
  const flag = hours.map((p) => p === targetPeriod);
  if (!flag.some(Boolean)) return null;
  if (flag.every(Boolean)) return { startHour: 0, endHour: 24, multiple: false };
  // double the array to handle wraparound
  let best = { len: 0, start: 0 };
  let runs = 0;
  // count disjoint runs in the single (non-doubled) array
  for (let i = 0; i < 24; i++) {
    if (flag[i] && (i === 0 ? !flag[23] : !flag[i - 1])) runs++;
  }
  const dbl = flag.concat(flag);
  let i = 0;
  while (i < 48) {
    if (dbl[i]) {
      let j = i;
      while (j < 48 && dbl[j]) j++;
      const len = j - i;
      if (len <= 24 && len > best.len) best = { len, start: i % 24 };
      i = j;
    } else i++;
  }
  const start = best.start;
  const end = (best.start + best.len) % 24;
  return { startHour: start, endHour: end === 0 ? 24 : end, multiple: runs > 1 };
}

// Cluster months into summer/winter by max-energy-rate, return 1-based month list.
function deriveSummerMonths(monthMax) {
  const vals = monthMax.filter((v) => Number.isFinite(v));
  if (!vals.length) return { months: DEFAULT_SUMMER_MONTHS.slice(), clean: false };
  const lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-9) return { months: DEFAULT_SUMMER_MONTHS.slice(), clean: false };
  const mid = (lo + hi) / 2;
  const months = [];
  for (let m = 0; m < 12; m++) if (monthMax[m] > mid) months.push(m + 1);
  // Sanity: a real summer season is a handful of contiguous-ish months.
  if (months.length === 0 || months.length === 12) {
    return { months: DEFAULT_SUMMER_MONTHS.slice(), clean: false };
  }
  // Orientation sanity: physical summer is warm months (roughly May-Oct).
  // If the higher-rate cluster is mostly cold months, the seasonal split is
  // ambiguous/inverted for our summer/winter labels, so don't trust it.
  const warm = new Set([5, 6, 7, 8, 9, 10]);
  const warmHits = months.filter((m) => warm.has(m)).length;
  if (warmHits < months.length / 2) {
    return { months: DEFAULT_SUMMER_MONTHS.slice(), clean: false };
  }
  return { months, clean: true };
}

// ---------------------------------------------------------------------------
// Per-rate conversion
// ---------------------------------------------------------------------------
function buildTariff(rec, idx) {
  const label = rec[idx.label] || '';
  const utility = rec[idx.utility] || '';
  const name = rec[idx.name] || '';
  const startdate = rec[idx.startdate] || '';

  // ---- Energy structure ----
  const energyRates = readRateStructure(rec, idx, 'energyratestructure');
  const energyGrid = parseSchedule(rec[idx.energyweekdayschedule]);

  // ---- Demand structures ----
  const flatUnit = (rec[idx.flatdemandunit] || '').toLowerCase();
  const demandRates = readRateStructure(rec, idx, 'demandratestructure');
  const demandUnit = (rec[idx.demandunit] || '').toLowerCase();
  const demandGrid = parseSchedule(rec[idx.demandweekdayschedule]);

  // flat (facilities) demand: pick the flatdemand period used most often across months
  let facilitiesKwMo = 0;
  {
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const counts = {};
    for (const mn of monthNames) {
      const k = `flatDemandMonth_${mn}`;
      if (k in idx) {
        const v = rec[idx[k]];
        if (v !== undefined && v !== '') {
          const p = parseInt(v, 10);
          if (Number.isFinite(p)) counts[p] = (counts[p] || 0) + 1;
        }
      }
    }
    let bestP = null, bestC = -1;
    for (const [p, c] of Object.entries(counts)) if (c > bestC) { bestC = c; bestP = +p; }
    const flatRates = readRateStructure(rec, idx, 'flatdemandstructure');
    if (bestP !== null && Number.isFinite(flatRates[bestP])) facilitiesKwMo = flatRates[bestP];
    else if (Number.isFinite(flatRates[0])) facilitiesKwMo = flatRates[0];
    // kW/day units are unusual; leave value as-is but it's flagged placeholder
  }

  // ---- summer/winter classification ----
  let monthMax = new Array(12).fill(NaN);
  if (energyGrid) {
    for (let m = 0; m < 12; m++) {
      let mx = -Infinity;
      for (const p of energyGrid[m]) {
        const r = Number.isFinite(energyRates[p]) ? energyRates[p] : 0;
        if (r > mx) mx = r;
      }
      monthMax[m] = mx;
    }
  }
  const summerInfo = deriveSummerMonths(monthMax);
  const summerMonths = summerInfo.months;
  const isSummer = (m1) => summerMonths.includes(m1); // m1 = 1-based

  // ---- energy windows ----
  const windows = [];
  let offPeak = { summerRate: 0, winterRate: 0 };
  let multipleRunNote = false;
  if (energyGrid) {
    const eAnalysis = analyzeEnergy(energyGrid, energyRates);
    // determine the dominant on-peak period across summer months (fallback: all)
    const onCounts = {};
    const offCounts = {};
    for (let m = 0; m < 12; m++) {
      onCounts[eAnalysis[m].onP] = (onCounts[eAnalysis[m].onP] || 0) + 1;
      offCounts[eAnalysis[m].offP] = (offCounts[eAnalysis[m].offP] || 0) + 1;
    }
    const dominant = (counts) => {
      let bp = null, bc = -1;
      for (const [p, c] of Object.entries(counts)) if (c > bc) { bc = c; bp = +p; }
      return bp;
    };
    const onPeriod = dominant(onCounts);
    const offPeriod = dominant(offCounts);

    // average a period's rate over summer / winter months (where that period appears)
    const avgRateForPeriod = (period, wantSummer) => {
      // The period's rate is constant in USURDB across months (period rate not month-keyed),
      // but we still average per the spec's intent: rate = energyRates[period].
      void wantSummer;
      return Number.isFinite(energyRates[period]) ? energyRates[period] : 0;
    };

    // Build the on-peak window from the month with the most on-peak hours
    // (use a representative summer month if available).
    let repMonth = summerMonths.length ? summerMonths[0] - 1 : 0;
    let run = longestRun(energyGrid[repMonth], onPeriod);
    if (!run) {
      // fall back to any month
      for (let m = 0; m < 12 && !run; m++) run = longestRun(energyGrid[m], onPeriod);
    }
    if (run && onPeriod !== offPeriod) {
      multipleRunNote = run.multiple;
      windows.push({
        name: 'On-peak',
        startHour: run.startHour,
        endHour: run.endHour,
        summerRate: round(avgRateForPeriod(onPeriod, true)),
        winterRate: round(avgRateForPeriod(onPeriod, false)),
      });

      // mid-peak: any period that is neither on nor off, appearing meaningfully.
      const periodsSeen = new Set();
      for (const p of energyGrid[repMonth]) periodsSeen.add(p);
      const midCandidates = [...periodsSeen].filter((p) => p !== onPeriod && p !== offPeriod);
      // pick the highest-rate mid candidate that forms a real run
      midCandidates.sort((a, b) =>
        (energyRates[b] || 0) - (energyRates[a] || 0));
      for (const mp of midCandidates) {
        const mrun = longestRun(energyGrid[repMonth], mp);
        if (mrun && mrun.endHour - mrun.startHour !== 0) {
          windows.push({
            name: 'Mid-peak',
            startHour: mrun.startHour,
            endHour: mrun.endHour,
            summerRate: round(avgRateForPeriod(mp, true)),
            winterRate: round(avgRateForPeriod(mp, false)),
          });
          break;
        }
      }
    }

    offPeak = {
      summerRate: round(avgRateForPeriod(offPeriod, true)),
      winterRate: round(avgRateForPeriod(offPeriod, false)),
    };

    // If no genuine TOU differentiation, still expose a single window at the flat rate
    if (windows.length === 0 && Number.isFinite(energyRates[0])) {
      offPeak = { summerRate: round(energyRates[0]), winterRate: round(energyRates[0]) };
    }
  }

  // ---- TOU demand (on-peak demand $/kW-mo) ----
  let onPeakSummerKwMo = 0, onPeakWinterKwMo = 0;
  if (demandGrid && windows.length) {
    const w = windows[0];
    // find which demand period covers the on-peak hours in a representative month
    const repMonth = summerMonths.length ? summerMonths[0] - 1 : 0;
    const winterMonth = (() => {
      for (let m = 0; m < 12; m++) if (!isSummer(m + 1)) return m;
      return 0;
    })();
    const periodForWindow = (monthRow) => {
      const counts = {};
      for (let h = 0; h < 24; h++) {
        const inWin = w.startHour <= w.endHour
          ? h >= w.startHour && h < w.endHour
          : h >= w.startHour || h < w.endHour;
        if (inWin) counts[monthRow[h]] = (counts[monthRow[h]] || 0) + 1;
      }
      // pick the demand period with the HIGHEST rate among those covering the window
      let best = null, bestRate = -Infinity;
      for (const p of Object.keys(counts).map(Number)) {
        const r = Number.isFinite(demandRates[p]) ? demandRates[p] : 0;
        if (r > bestRate) { bestRate = r; best = p; }
      }
      return best;
    };
    const sP = periodForWindow(demandGrid[repMonth]);
    const wP = periodForWindow(demandGrid[winterMonth]);
    if (sP !== null && Number.isFinite(demandRates[sP])) onPeakSummerKwMo = demandRates[sP];
    if (wP !== null && Number.isFinite(demandRates[wP])) onPeakWinterKwMo = demandRates[wP];
  } else if (demandGrid && !windows.length) {
    // Demand schedule exists but no TOU energy window was derived: take the
    // highest-rate demand period as the on-peak demand charge.
    const repMonth = summerMonths.length ? summerMonths[0] - 1 : 0;
    const winterMonth = (() => {
      for (let m = 0; m < 12; m++) if (!isSummer(m + 1)) return m;
      return 0;
    })();
    const peakPeriodFor = (monthRow) => {
      let best = null, bestRate = -Infinity;
      for (const p of monthRow) {
        const r = Number.isFinite(demandRates[p]) ? demandRates[p] : 0;
        if (r > bestRate) { bestRate = r; best = p; }
      }
      return best;
    };
    const sP = peakPeriodFor(demandGrid[repMonth]);
    const wP = peakPeriodFor(demandGrid[winterMonth]);
    if (sP !== null && Number.isFinite(demandRates[sP])) onPeakSummerKwMo = demandRates[sP];
    if (wP !== null && Number.isFinite(demandRates[wP])) onPeakWinterKwMo = demandRates[wP];
  } else if (!demandGrid && demandRates.length && Number.isFinite(demandRates[0])) {
    // demand structure with no schedule -> treat as flat-ish TOU demand
    onPeakSummerKwMo = demandRates[0];
    onPeakWinterKwMo = demandRates[0];
  }

  // ---- fallback on-peak window ----
  // The app requires windows[0] to exist (it anchors the on-peak demand
  // charge). If we could not derive a TOU energy window but the rate still
  // has a demand charge, synthesize an on-peak window from the demand
  // schedule's peak hours, or default business hours, so the demand charge
  // can actually apply. Energy rates on the window match the flat energy rate.
  let fallbackWindowNote = false;
  if (windows.length === 0) {
    let startHour = 8, endHour = 20, fromSchedule = false;
    if (demandGrid) {
      const repMonth = summerMonths.length ? summerMonths[0] - 1 : 0;
      let peakP = null, bestRate = -Infinity;
      for (const p of demandGrid[repMonth]) {
        const r = Number.isFinite(demandRates[p]) ? demandRates[p] : 0;
        if (r > bestRate) { bestRate = r; peakP = p; }
      }
      const run = peakP !== null ? longestRun(demandGrid[repMonth], peakP) : null;
      if (run && run.endHour !== run.startHour) {
        startHour = run.startHour; endHour = run.endHour; fromSchedule = true;
      }
    }
    const flatEnergy = Number.isFinite(energyRates[0]) ? round(energyRates[0]) : 0;
    windows.push({
      name: 'On-peak',
      startHour,
      endHour,
      summerRate: flatEnergy,
      winterRate: flatEnergy,
    });
    if (flatEnergy > 0) offPeak = { summerRate: flatEnergy, winterRate: flatEnergy };
    fallbackWindowNote = fromSchedule
      ? 'no TOU energy window found; on-peak window taken from the demand schedule peak hours'
      : 'no TOU energy or demand schedule found; on-peak window defaulted to business hours 08:00-20:00';
  }

  // ---- ratchet ----
  let ratchet = { enabled: false, pct: 0.5 };
  if ('lookbackpercent' in idx) {
    const lp = num(rec[idx.lookbackpercent]);
    if (lp > 0) {
      ratchet = { enabled: true, pct: lp > 1 ? round(lp / 100, 4) : round(lp, 4) };
    }
  }

  // ---- guards ----
  const clamp = (n) => (Number.isFinite(n) && n >= 0 ? round(n) : 0);
  facilitiesKwMo = clamp(facilitiesKwMo);
  onPeakSummerKwMo = clamp(onPeakSummerKwMo);
  onPeakWinterKwMo = clamp(onPeakWinterKwMo);
  for (const w of windows) {
    w.summerRate = clamp(w.summerRate);
    w.winterRate = clamp(w.winterRate);
  }
  offPeak.summerRate = clamp(offPeak.summerRate);
  offPeak.winterRate = clamp(offPeak.winterRate);

  const hasDemand = facilitiesKwMo > 0 || onPeakSummerKwMo > 0 || onPeakWinterKwMo > 0;
  // genuine (non-synthetic) TOU energy: a real window was derived before fallback
  const hasTouEnergy = windows.length > 0 && !fallbackWindowNote;

  // notes
  const approxBits = [];
  if (!summerInfo.clean) approxBits.push('summer season could not be cleanly split, defaulted to Jun-Oct');
  else approxBits.push(`summer months derived from energy-rate seasonality (${summerMonths.join(',')})`);
  if (multipleRunNote) approxBits.push('on-peak had multiple disjoint hour-runs, longest was used');
  if (flatUnit && flatUnit !== 'kw') approxBits.push(`flat demand unit was "${flatUnit}", treated as $/kW-mo`);
  if (demandUnit && demandUnit !== 'kw') approxBits.push(`TOU demand unit was "${demandUnit}", treated as $/kW-mo`);
  if (fallbackWindowNote) approxBits.push(fallbackWindowNote);
  else if (!hasTouEnergy) approxBits.push('no TOU energy differentiation found, single off-peak rate used');
  const notes =
    `Auto-derived from USURDB ${label} (retrieved ${RETRIEVED_AT}). ` +
    `${approxBits.join('; ')}. VERIFY against the filed tariff sheet before quoting.`;

  return {
    record: {
      id: `usurdb-${label}`,
      utility,
      schedule: name,
      placeholder: true,
      source: 'USURDB',
      usurdbLabel: label,
      startdate,
      retrievedAt: RETRIEVED_AT,
      notes,
      summerMonths,
      demand: { facilitiesKwMo, onPeakSummerKwMo, onPeakWinterKwMo },
      windows: windows.length ? windows : [],
      offPeak,
      ratchet,
    },
    hasDemand,
    hasTouEnergy,
  };
}

// ---------------------------------------------------------------------------
// Relevance scoring (for the per-utility cap): prefer large-C&I general
// service / TOU schedules that have BOTH demand and TOU energy.
// ---------------------------------------------------------------------------
function relevanceScore(t) {
  const r = t.record;
  const name = (r.schedule || '').toLowerCase();
  let s = 0;
  if (t.hasDemand && t.hasTouEnergy) s += 100;
  if (r.demand.onPeakSummerKwMo > 0 || r.demand.onPeakWinterKwMo > 0) s += 30; // TOU demand
  if (/general service|\bgs\b|gsd|g-?\d/.test(name)) s += 15;
  if (/\btou\b|time.?of.?use/.test(name)) s += 20;
  if (/secondary|primary|distribution/.test(name)) s += 12;
  if (/large|industrial|demand/.test(name)) s += 8;
  if (/small/.test(name)) s -= 10;
  if (/light|street|residential|standby|backup/.test(name)) s -= 50;
  // slight preference for higher demand magnitude (real large C&I)
  s += Math.min(20, r.demand.facilitiesKwMo + r.demand.onPeakSummerKwMo);
  return s;
}

function isExcludedName(name) {
  const n = (name || '').toLowerCase();
  return /residential|lighting|street\s?light|\bstandby\b|backup only|outdoor light/.test(n);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    await download(DOWNLOAD_URL, CSV_PATH);
  } else {
    console.log(`Using existing ${CSV_PATH}`);
  }

  let header = null;
  const idx = {};
  let rowCount = 0;
  const matchedByUtil = new Map(); // utility(lower) -> array of {record, hasDemand, hasTouEnergy, score}

  await streamCsv(CSV_PATH, (row) => {
    if (!header) {
      header = row;
      header.forEach((h, i) => { idx[h] = i; });
      return;
    }
    rowCount++;
    const utility = row[idx.utility] || '';
    const utilLower = utility.toLowerCase();
    const sector = row[idx.sector] || '';
    const enddate = row[idx.enddate] || '';

    if (enddate.trim() !== '') return; // active only
    if (sector !== 'Commercial' && sector !== 'Industrial') return;
    if (!ALL_SUBSTRINGS.some((sub) => utilLower.includes(sub))) return;
    if (isExcludedName(row[idx.name])) return;

    let built;
    try { built = buildTariff(row, idx); } catch { return; }

    // keep only peak-shaving-relevant rates: must have a demand charge,
    // and not be a no-demand/no-energy shell.
    if (!built.hasDemand) return;
    if (!built.hasDemand && !built.hasTouEnergy) return;

    built.score = relevanceScore(built);
    const key = utilLower;
    if (!matchedByUtil.has(key)) matchedByUtil.set(key, []);
    matchedByUtil.get(key).push(built);
  });

  console.log(`Scanned ${rowCount} data rows.`);

  // cap per utility, prefer highest relevance
  const out = [];
  const perUtilCount = {};
  for (const [util, list] of matchedByUtil) {
    list.sort((a, b) => b.score - a.score);
    const kept = list.slice(0, CAP_PER_UTILITY);
    for (const k of kept) out.push(k.record);
    perUtilCount[k_displayName(kept, util)] = kept.length;
  }

  // de-dup ids (USURDB labels are unique, but guard anyway)
  const seen = new Set();
  const deduped = out.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(deduped, null, 2) + '\n');

  console.log(`\nWrote ${deduped.length} tariffs to ${OUTPUT_PATH}`);
  console.log('Per-utility counts:');
  for (const [u, c] of Object.entries(perUtilCount).sort()) console.log(`  ${c.toString().padStart(2)}  ${u}`);

  return deduped;
}

function k_displayName(kept, fallback) {
  return kept.length ? kept[0].record.utility : fallback;
}

main().catch((err) => { console.error(err); process.exit(1); });
