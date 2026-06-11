// Interval-data parsing & normalization. Pure functions (no DOM) so they can
// be tested under Node. Browser code passes rows from our CSV parser or from
// SheetJS (for XLSX); both arrive here as arrays of arrays of strings/numbers.
//
// Flagged assumptions (see README/SPEC discussion):
// - Timestamps are treated as local clock time; timezone suffixes are ignored.
//   DST spring-forward shows up as a gap (interpolated), fall-back as
//   duplicates (averaged). Counts of both are reported.
// - kWh -> kW conversion assumes the kWh value covers exactly one interval:
//   kW = kWh / (interval hours).
// - 30/60-min data is expanded to 15-min by holding kW constant (preserves
//   both demand and energy).

// ---------------------------------------------------------------------------
// CSV parsing (quote-aware)
// ---------------------------------------------------------------------------

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      rows.push(row); row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  // Drop fully-empty trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => String(c).trim() === '')) rows.pop();
  return rows;
}

// ---------------------------------------------------------------------------
// Timestamp parsing (local-naive)
// ---------------------------------------------------------------------------

const DATE_MDY = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/;
const DATE_YMD = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/;
const TIME_RE = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/;
const ISO_DT = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/;
const MDY_DT = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/;

function fixYear(y) { return y < 100 ? y + 2000 : y; }

// ---- Excel support: XLSX cells arrive as date serials (numbers) or Dates ----
// Excel 1900 system: day 0 = 1899-12-30. The fractional part is time of day.
// Serials are interpreted as local-naive wall time, same as string timestamps.
// (1904-system workbooks are detected upstream and flagged to the user.)
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

export function isExcelSerial(v) {
  // 20000..80000 covers years 1954–2119; interval kW/kWh values that large
  // never appear in a timestamp column.
  return typeof v === 'number' && isFinite(v) && v >= 20000 && v < 80000;
}

export function excelSerialToMs(serial) {
  // Use UTC arithmetic for the calendar math (DST-proof), then rebuild as
  // local-naive — consistent with how string timestamps are parsed.
  const u = new Date(EXCEL_EPOCH_UTC + Math.round(serial * DAY_MS));
  return new Date(
    u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(),
    u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds(),
  ).getTime();
}

export function parseDateOnly(s) {
  if (s instanceof Date) return { y: s.getFullYear(), mo: s.getMonth() + 1, d: s.getDate() };
  if (isExcelSerial(s)) {
    const d = new Date(excelSerialToMs(s));
    return { y: d.getFullYear(), mo: d.getMonth() + 1, d: d.getDate() };
  }
  s = String(s).trim();
  let m = DATE_MDY.exec(s);
  if (m) return { y: fixYear(+m[3]), mo: +m[1], d: +m[2] };
  m = DATE_YMD.exec(s);
  if (m) return { y: +m[1], mo: +m[2], d: +m[3] };
  return null;
}

export function parseTimeOnly(s) {
  if (s instanceof Date) return { hh: s.getHours(), mm: s.getMinutes() };
  if (typeof s === 'number' && isFinite(s)) {
    // Excel time-of-day = fraction of a day; a full datetime serial also
    // carries its time in the fractional part.
    if (s >= 0 && s < 1) {
      const mins = Math.round(s * 1440);
      return { hh: Math.floor(mins / 60) % 24, mm: mins % 60 };
    }
    if (isExcelSerial(s)) {
      const d = new Date(excelSerialToMs(s));
      return { hh: d.getHours(), mm: d.getMinutes() };
    }
    return null;
  }
  s = String(s).trim();
  const m = TIME_RE.exec(s);
  if (!m) return null;
  let hh = +m[1];
  const ampm = m[4] ? m[4].toUpperCase() : null;
  if (ampm === 'PM' && hh < 12) hh += 12;
  if (ampm === 'AM' && hh === 12) hh = 0;
  return { hh, mm: +m[2] };
}

/** Parse a combined timestamp (string, Date, or Excel serial) -> epoch ms (local), or null. */
export function parseTimestamp(s) {
  if (s instanceof Date) {
    return new Date(s.getFullYear(), s.getMonth(), s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds()).getTime();
  }
  if (isExcelSerial(s)) return excelSerialToMs(s);
  s = String(s).trim();
  let m = ISO_DT.exec(s);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime();
  m = MDY_DT.exec(s);
  if (m) {
    let hh = +m[4];
    const ampm = m[7] ? m[7].toUpperCase() : null;
    if (ampm === 'PM' && hh < 12) hh += 12;
    if (ampm === 'AM' && hh === 12) hh = 0;
    return new Date(fixYear(+m[3]), +m[1] - 1, +m[2], hh, +m[5], +(m[6] || 0)).getTime();
  }
  // Date-only (midnight) — used by wide formats
  const d = parseDateOnly(s);
  if (d) return new Date(d.y, d.mo - 1, d.d).getTime();
  return null;
}

/** Split "0:00-0:15" style ranges to their start; pass non-strings through. */
function timeStart(v) {
  return typeof v === 'string' ? v.split('-')[0].trim() : v;
}

export function combineDateTime(dateStr, timeStr) {
  const d = parseDateOnly(dateStr);
  if (!d) return null;
  const t = timeStr === undefined || timeStr === null || String(timeStr).trim() === ''
    ? { hh: 0, mm: 0 }
    : parseTimeOnly(timeStart(timeStr)); // "0:00-0:15" -> start
  if (!t) return null;
  return new Date(d.y, d.mo - 1, d.d, t.hh, t.mm).getTime();
}

// ---------------------------------------------------------------------------
// Format detection
// ---------------------------------------------------------------------------

function norm(h) { return String(h).trim().toLowerCase(); }

const DATETIME_HEADERS = ['datetime', 'date/time', 'timestamp', 'interval start', 'intervalstart', 'starttime', 'start date/time', 'time stamp', 'date time', 'read date and time'];
const DATE_HEADERS = ['date', 'usage date', 'interval date', 'read date', 'day'];
const TIME_HEADERS = ['start time', 'time', 'interval start time', 'time of day', 'interval'];
const KW_HEADERS = ['kw', 'demand', 'demand (kw)', 'kw demand', 'avg kw', 'power'];
const KWH_HEADERS = ['kwh', 'usage', 'consumption', 'consumed', 'energy', 'usage (kwh)', 'consumption (kwh)', 'delivered', 'delivered kwh', 'net usage', 'value', 'usage(real energy in kilowatt-hours)'];
const UNIT_COL_HEADERS = ['units', 'uom', 'unit', 'unit of measure'];

function headerMatches(h, list) {
  const n = norm(h);
  if (list.includes(n)) return true;
  // contains-style match for verbose utility headers
  return list.some((k) => k.length >= 4 && n.includes(k));
}

function classifyValueHeader(h) {
  const n = norm(h);
  if (/\bkwh\b/.test(n) || n.endsWith('kwh') || headerMatches(h, KWH_HEADERS)) {
    // "kwh" wins over "kw" substring matches
    if (/\bkwh\b/.test(n) || n.includes('kwh')) return 'kWh';
    if (/\bkw\b/.test(n) || n.includes('(kw)')) return 'kW';
    return 'kWh';
  }
  if (/\bkw\b/.test(n) || headerMatches(h, KW_HEADERS)) return 'kW';
  return null;
}

function looksLikeTimeOfDay(s) {
  if (typeof s === 'number') return isFinite(s) && s >= 0 && s < 1; // Excel day fraction
  const part = String(s).split('-')[0].trim();
  return parseTimeOnly(part) !== null;
}

/**
 * Scan rows for the header row and classify the layout.
 * Returns { type: 'long'|'wide'|'generic', headerIdx, cols: {...}, notes }
 */
export function detectLayout(rows) {
  const notes = [];
  const scanLimit = Math.min(rows.length, 40);

  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i].map(String);
    const nonEmpty = row.filter((c) => c.trim() !== '');
    if (nonEmpty.length < 2) continue;

    // Wide format: a date-ish first column + many time-of-day columns.
    // Time labels are checked on the RAW cells (Excel headers can be numeric
    // day-fractions), header words on the stringified ones.
    const timeCols = [];
    for (let c = 1; c < row.length; c++) {
      if (looksLikeTimeOfDay(rows[i][c])) timeCols.push(c);
    }
    if (timeCols.length >= 20 && headerMatches(row[0], [...DATE_HEADERS, ...DATETIME_HEADERS])) {
      const unitGuess = row.map(norm).join(' ').includes('kwh') ? 'kWh'
        : row.map(norm).join(' ').includes('kw') ? 'kW' : null;
      return {
        type: 'wide', headerIdx: i,
        cols: { date: 0, timeCols, timeLabels: timeCols.map((c) => rows[i][c]) },
        unitGuess, notes,
      };
    }

    // Long format: find date/time/value columns by header text
    let dtCol = -1, dateCol = -1, timeCol = -1, valCol = -1, unitCol = -1, valUnit = null;
    for (let c = 0; c < row.length; c++) {
      const h = row[c];
      if (h.trim() === '') continue;
      if (dtCol < 0 && headerMatches(h, DATETIME_HEADERS)) { dtCol = c; continue; }
      if (dateCol < 0 && DATE_HEADERS.includes(norm(h))) { dateCol = c; continue; }
      if (timeCol < 0 && headerMatches(h, TIME_HEADERS) && norm(h) !== 'datetime') { timeCol = c; continue; }
      if (unitCol < 0 && UNIT_COL_HEADERS.includes(norm(h))) { unitCol = c; continue; }
      if (valCol < 0) {
        const u = classifyValueHeader(h);
        // Skip generation/export columns on net meters; prefer consumption
        if (u && !/generat|export|received|surplus/.test(norm(h))) { valCol = c; valUnit = u; }
      }
    }
    if ((dtCol >= 0 || dateCol >= 0) && valCol >= 0) {
      return {
        type: 'long', headerIdx: i,
        cols: { datetime: dtCol, date: dateCol, time: timeCol, value: valCol, unit: unitCol },
        unitGuess: valUnit, notes,
      };
    }
  }

  // Generic fallback: first row whose col0 parses as timestamp and col1 as number
  for (let i = 0; i < scanLimit; i++) {
    const row = rows[i];
    if (row.length >= 2 && parseTimestamp(row[0]) !== null && isFinite(parseFloat(row[1]))) {
      notes.push('No recognizable header row; assumed column 1 = timestamp, column 2 = value.');
      return {
        type: 'generic', headerIdx: i - 1,
        cols: { datetime: 0, value: 1 },
        unitGuess: null, notes,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Record extraction
// ---------------------------------------------------------------------------

function toNumber(v) {
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/[,$"\s]/g, ''));
  return isFinite(n) ? n : null;
}

/** Extract raw {ms, value} records given a detected layout. */
export function extractRecords(rows, layout) {
  const records = [];
  const notes = [...layout.notes];
  let unit = layout.unitGuess;
  let unitFromColumn = null;
  const start = layout.headerIdx + 1;

  if (layout.type === 'wide') {
    const { date, timeCols, timeLabels } = layout.cols;
    const offsets = timeLabels.map((t) => {
      const p = parseTimeOnly(timeStart(t));
      return p ? (p.hh * 60 + p.mm) * 60000 : null;
    });
    for (let i = start; i < rows.length; i++) {
      const base = combineDateTime(rows[i][date], '0:00');
      if (base === null) continue;
      for (let j = 0; j < timeCols.length; j++) {
        if (offsets[j] === null) continue;
        const v = toNumber(rows[i][timeCols[j]]);
        if (v === null) continue;
        records.push({ ms: base + offsets[j], value: v });
      }
    }
  } else {
    const { datetime, date, time, value, unit: unitCol } = layout.cols;
    for (let i = start; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      let ms = null;
      if (datetime >= 0 && datetime !== undefined && row[datetime] !== undefined && String(row[datetime]).trim() !== '') {
        ms = parseTimestamp(row[datetime]);
      }
      if (ms === null && date >= 0) {
        ms = combineDateTime(row[date], time >= 0 ? row[time] : undefined);
      }
      if (ms === null) continue;
      const v = toNumber(row[value]);
      if (v === null) continue;
      if (unitCol >= 0 && row[unitCol] && !unitFromColumn) {
        const u = norm(row[unitCol]);
        if (u.includes('kwh') || u === 'wh') unitFromColumn = 'kWh';
        else if (u.includes('kw') || u === 'w') unitFromColumn = 'kW';
      }
      records.push({ ms, value: v });
    }
  }

  if (unitFromColumn) {
    if (unit && unit !== unitFromColumn) notes.push(`Header suggested ${unit} but units column says ${unitFromColumn}; using units column.`);
    unit = unitFromColumn;
  }
  if (!unit) {
    unit = 'kWh';
    notes.push('Could not determine kW vs kWh from headers; ASSUMED kWh (utility usage exports are typically energy). Override below if wrong.');
  }
  return { records, unit, notes };
}

/** Most common spacing between consecutive timestamps, in minutes. */
export function detectIntervalMinutes(records) {
  if (records.length < 3) return null;
  const counts = new Map();
  for (let i = 1; i < Math.min(records.length, 5000); i++) {
    const d = Math.round((records[i].ms - records[i - 1].ms) / 60000);
    if (d > 0 && d <= 1440) counts.set(d, (counts.get(d) || 0) + 1);
  }
  let best = null, bestCount = -1;
  for (const [d, c] of counts) if (c > bestCount) { best = d; bestCount = c; }
  return best;
}

// ---------------------------------------------------------------------------
// Normalization to 15-minute kW
// ---------------------------------------------------------------------------

export const STEP_MIN = 15;
const STEP_MS = STEP_MIN * 60000;

export function normalizeTo15MinKw(records, unit, intervalMin) {
  if (!records.length) throw new Error('No interval records to normalize');

  // Sort + merge duplicate timestamps (DST fall-back, meter re-reads): average.
  const sorted = [...records].sort((a, b) => a.ms - b.ms);
  const merged = [];
  let duplicatesMerged = 0;
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.ms === r.ms) {
      last.value = (last.value * last.n + r.value) / (last.n + 1);
      last.n += 1;
      duplicatesMerged++;
    } else {
      merged.push({ ms: r.ms, value: r.value, n: 1 });
    }
  }

  // Convert to kW: kWh over one interval -> average kW for that interval.
  const hours = intervalMin / 60;
  const points = merged.map((r) => ({ ms: r.ms, kw: unit === 'kWh' ? r.value / hours : r.value }));

  // Resample to the 15-min grid.
  let grid = [];
  if (intervalMin === STEP_MIN) {
    grid = points;
  } else if (intervalMin < STEP_MIN) {
    // e.g. 5-min: average into 15-min buckets anchored at first timestamp
    const t0 = points[0].ms;
    const buckets = new Map();
    for (const p of points) {
      const k = Math.floor((p.ms - t0) / STEP_MS);
      const b = buckets.get(k) || { sum: 0, n: 0 };
      b.sum += p.kw; b.n += 1;
      buckets.set(k, b);
    }
    for (const [k, b] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
      grid.push({ ms: t0 + k * STEP_MS, kw: b.sum / b.n });
    }
  } else {
    // 30/60-min: hold kW constant across sub-intervals
    const sub = intervalMin / STEP_MIN;
    for (const p of points) {
      for (let j = 0; j < sub; j++) grid.push({ ms: p.ms + j * STEP_MS, kw: p.kw });
    }
  }

  // Canonical timeline + linear-interpolation gap fill.
  const startMs = grid[0].ms;
  const endMs = grid[grid.length - 1].ms;
  const n = Math.round((endMs - startMs) / STEP_MS) + 1;
  const kw = new Array(n).fill(null);
  for (const p of grid) {
    const idx = Math.round((p.ms - startMs) / STEP_MS);
    // Off-grid timestamps snap to nearest slot
    if (idx >= 0 && idx < n) kw[idx] = p.kw;
  }

  let gapsFilled = 0;
  let longestGap = 0;
  let i = 0;
  while (i < n) {
    if (kw[i] !== null) { i++; continue; }
    let j = i;
    while (j < n && kw[j] === null) j++;
    const before = kw[i - 1]; // exists: grid starts/ends with data
    const after = kw[j];
    const len = j - i;
    for (let k = 0; k < len; k++) {
      kw[i + k] = before + ((after - before) * (k + 1)) / (len + 1);
    }
    gapsFilled += len;
    longestGap = Math.max(longestGap, len);
    i = j;
  }

  return {
    startMs,
    stepMin: STEP_MIN,
    kw: kw.map((v) => Math.round(v * 1000) / 1000),
    gapsFilled,
    longestGapIntervals: longestGap,
    duplicatesMerged,
  };
}

// ---------------------------------------------------------------------------
// Top-level entry
// ---------------------------------------------------------------------------

/**
 * Parse rows (array of arrays) into a normalized 15-min kW series.
 * overrides: { unit?: 'kW'|'kWh', intervalMin?: number } from the UI.
 */
export function parseIntervalRows(rows, fileName = '', overrides = {}) {
  const layout = detectLayout(rows);
  if (!layout) throw new Error('Could not detect a usable layout (no timestamp + value columns found)');

  const { records, unit: detectedUnit, notes } = extractRecords(rows, layout);
  if (records.length < 4) throw new Error(`Only ${records.length} data rows parsed — not enough to analyze`);

  const detectedIntervalMin = layout.type === 'wide'
    ? inferWideInterval(layout)
    : detectIntervalMinutes(records);
  if (!detectedIntervalMin) throw new Error('Could not detect interval length');

  const unit = overrides.unit || detectedUnit;
  const intervalMin = overrides.intervalMin || detectedIntervalMin;
  if (![5, 15, 30, 60].includes(intervalMin)) {
    notes.push(`Unusual interval length detected (${intervalMin} min); expected 5/15/30/60.`);
  }

  const normalized = normalizeTo15MinKw(records, unit, intervalMin);

  const formatLabel = { wide: 'wide (date × time-of-day columns)', long: 'long (one row per interval)', generic: 'generic timestamp + value' }[layout.type];
  return {
    normalized,
    source: {
      fileName,
      format: formatLabel,
      detectedIntervalMin,
      detectedUnit,
      appliedIntervalMin: intervalMin,
      appliedUnit: unit,
      rowsParsed: records.length,
      gapsFilled: normalized.gapsFilled,
      longestGapIntervals: normalized.longestGapIntervals,
      duplicatesMerged: normalized.duplicatesMerged,
      notes,
    },
  };
}

function inferWideInterval(layout) {
  const offs = layout.cols.timeLabels
    .map((t) => parseTimeOnly(timeStart(t)))
    .filter(Boolean)
    .map((p) => p.hh * 60 + p.mm)
    .sort((a, b) => a - b);
  if (offs.length < 2) return null;
  return offs[1] - offs[0];
}
