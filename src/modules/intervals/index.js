// Module 1 — Interval Data Workbench.
// Upload CSV/XLSX interval data, auto-detect format, normalize to 15-min kW,
// and produce the analysis that drives sizing (worst day per billing period).
/* global XLSX */

import { el, clear, fmt, downloadFile } from '../../ui/dom.js';
import { getSite, notify, subscribe } from '../../model/store.js';
import { parseCsv, parseIntervalRows, detectLayout, extractRecords } from './parser.js';
import { analyzeIntervals, worstDayProfile } from './analysis.js';
import { renderDurationCurve, renderMonthlyPeaks, renderDayProfile } from './charts.js';
import { profileLibrary, loadReferenceProfile } from './profiles.js';

let lastRows = null; // raw parsed rows kept module-local for re-processing with overrides
let lastFileName = '';

export default {
  id: 'intervals',
  title: '1. Interval Data',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded) { lastRows = null; lastFileName = ''; render(panel); }
    });
  },
};

function render(panel) {
  clear(panel);
  const site = getSite();

  panel.append(uploadPanel(panel));
  panel.append(referencePanel(panel));

  if (site.intervals.source) panel.append(detectionPanel(panel));

  if (site.intervals.normalized) {
    if (!site.intervals.analysis) {
      site.intervals.analysis = analyzeIntervals(site.intervals.normalized);
    }
    panel.append(statsStrip(site.intervals.analysis));
    panel.append(chartsRow(site));
    panel.append(monthlyTablePanel(site.intervals.analysis));
    panel.append(heatmapPanel(site.intervals.analysis));
  } else {
    panel.append(el('p', { class: 'empty-note' },
      'Upload interval data to begin. Everything downstream (sizing, dispatch, economics) keys off this.'));
  }
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

function uploadPanel(panel) {
  const input = el('input', { type: 'file', accept: '.csv,.xlsx,.xls', style: 'display:none' });
  input.addEventListener('change', () => input.files[0] && handleFile(input.files[0], panel));

  const dz = el('div', { class: 'dropzone' },
    el('div', {}, el('b', {}, 'Drop interval data here'), ' or click to browse'),
    el('div', { class: 'muted', style: 'margin-top:6px' },
      'CSV or Excel — a full year of 15-minute data works best. ',
      'Auto-detects Green Button, SCE & SDG&E exports, or any file with a timestamp plus a kW and/or kWh column. ',
      '5/30/60-min data is accepted and normalized to 15-min.'),
  );
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], panel);
  });

  const templateBtn = el('button', { class: 'ghost-sm', onclick: downloadTemplate }, '↓ Download CSV template');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Interval Data Upload'),
    dz,
    input,
    el('div', { class: 'muted', style: 'margin-top:8px' },
      el('b', {}, 'Expected columns: '),
      'a timestamp (e.g. ', el('code', {}, '2024-01-01 00:15'),
      ') and a value column headed ', el('code', {}, 'kW'), ', ', el('code', {}, 'kWh'),
      ', or both. If both are present we use kW and cross-check them. ', templateBtn,
    ),
  );
}

function downloadTemplate() {
  const lines = ['Timestamp,kW,kWh'];
  const start = new Date(2024, 0, 1);
  for (let i = 0; i < 96; i++) { // one example day at 15-min
    const d = new Date(start.getTime() + i * 15 * 60000);
    const hour = d.getHours();
    const kw = Math.round((120 + 90 * Math.sin(((hour - 6) / 24) * 2 * Math.PI)) * 100) / 100;
    const ts = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    lines.push(`${ts},${kw},${Math.round(kw * 0.25 * 1000) / 1000}`);
  }
  lines.push('# … continue for a full year (35,040 rows at 15-min). Keep either kW, kWh, or both columns.');
  downloadFile('interval-data-template.csv', lines.join('\n'), 'text/csv');
}

// ---------------------------------------------------------------------------
// Reference building profiles (NREL ComStock) — for sites without real data
// ---------------------------------------------------------------------------

function referencePanel(panel) {
  const lib = profileLibrary();

  const stateSel = el('select', {}, ...lib.states.map((s) => el('option', { value: s }, s)));
  const typeSel = el('select', {}, ...lib.buildingTypes.map((t) => el('option', { value: t.id }, t.label)));
  const modeSel = el('select', {},
    el('option', { value: 'peakKw' }, 'Peak demand (kW)'),
    el('option', { value: 'annualKwh' }, 'Annual energy (kWh)'));
  const valInput = el('input', { type: 'number', min: 1, step: 50, value: 500, style: 'width:120px' });

  const loadBtn = el('button', { class: 'action', onclick: () => {
    const key = `${stateSel.value}:${typeSel.value}`;
    if (!lib.profiles[key]) { alert('That building type is not bundled for this state.'); return; }
    const value = +valInput.value;
    if (!(value > 0)) { alert('Enter a positive value to scale the profile.'); return; }
    try {
      const { normalized, source } = loadReferenceProfile(stateSel.value, typeSel.value, { mode: modeSel.value, value });
      const site = getSite();
      lastRows = null; lastFileName = '';
      site.intervals.normalized = normalized;
      site.intervals.source = source;
      site.intervals.analysis = analyzeIntervals(normalized);
      // Pre-fill site utility hint from the state if empty
      notify({ intervals: true });
      render(panel);
    } catch (err) {
      alert(`Could not load reference profile: ${err.message}`);
    }
  } }, 'Load reference profile');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Or Start From a Reference Building Profile'),
    el('p', { class: 'muted' },
      'No interval data yet? Load a normalized load shape from ', el('b', {}, 'NREL ComStock'),
      ' (DOE building-stock models, 15-min, weather year ', String(lib.meta.weatherYear), ') and scale it to the site. ',
      el('span', { class: 'placeholder-tag' }, 'REFERENCE SHAPE'),
      ' Replace with the customer’s actual meter data before quoting.'),
    el('div', {},
      el('label', { class: 'field' }, 'State:', stateSel),
      el('label', { class: 'field' }, 'Building type:', typeSel),
      el('label', { class: 'field' }, 'Scale by:', modeSel, valInput),
      loadBtn,
    ),
    el('p', { class: 'muted', style: 'margin:6px 0 0' },
      `Source: ${lib.meta.source}, ${lib.meta.release} (retrieved ${lib.meta.retrievedAt}). `,
      'State-aggregate shape, not a single building — used purely for its normalized hourly/seasonal pattern.'),
  );
}

async function handleFile(file, panel, overrides = {}) {
  try {
    let rows;
    let extraNotes = [];
    if (/\.(xlsx|xlsm|xlsb|xls)$/i.test(file.name)) {
      if (typeof XLSX === 'undefined') throw new Error('Spreadsheet engine failed to load — export the data as CSV instead');
      // raw:true keeps Excel date serials as numbers (the parser understands
      // them) instead of relying on the cell's display format, which often
      // drops the time of day entirely (e.g. renders as just "6/15/25").
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
      ({ rows, notes: extraNotes } = pickBestSheet(wb));
      if (wb.Workbook?.WBProps?.date1904) {
        extraNotes.push('Workbook uses the 1904 date system (old Mac Excel) — dates may be off by 4 years. Re-export as CSV if so.');
      }
    } else {
      rows = parseCsv(await file.text());
    }
    lastRows = rows;
    lastFileName = file.name;
    process(rows, file.name, panel, overrides, extraNotes);
  } catch (err) {
    alert(`Could not parse "${file.name}": ${err.message}`);
  }
}

/**
 * Try every sheet in the workbook and use the one that parses into the most
 * interval records — utility exports often put a cover/info sheet first.
 */
export function pickBestSheet(wb) {
  let best = null;
  const tried = [];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
    let count = 0;
    try {
      const layout = detectLayout(rows);
      if (layout) count = extractRecords(rows, layout).records.length;
    } catch { /* sheet doesn't parse — score stays 0 */ }
    tried.push(`"${name}" (${count.toLocaleString()} readable rows)`);
    if (count >= 4 && (!best || count > best.count)) best = { name, rows, count };
  }
  if (!best) {
    throw new Error(
      `No sheet contained recognizable interval data. Sheets tried: ${tried.join(', ')}. ` +
      'Expected a header row with date/time + kW or kWh columns (or a date × time-of-day grid).');
  }
  const notes = wb.SheetNames.length > 1
    ? [`Workbook has ${wb.SheetNames.length} sheets — used "${best.name}". Tried: ${tried.join(', ')}.`]
    : [];
  return { rows: best.rows, notes };
}

function process(rows, fileName, panel, overrides, extraNotes = []) {
  const site = getSite();
  try {
    const { normalized, source } = parseIntervalRows(rows, fileName, overrides);
    source.notes.push(...extraNotes);
    site.intervals.normalized = normalized;
    site.intervals.source = source;
    site.intervals.analysis = analyzeIntervals(normalized);
    notify({ intervals: true });
    render(panel);
  } catch (err) {
    alert(`Could not interpret interval data: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Detection summary + overrides
// ---------------------------------------------------------------------------

function detectionPanel(panel) {
  const s = getSite().intervals.source;
  const isReference = !!(s.reference);
  const gapPct = s.gapsFilled / (s.gapsFilled + s.rowsParsed || 1);
  const cov = s.coverage;

  // --- "Did it read what I expected?" check chips -------------------------
  const chip = (ok, okText, badText) =>
    el('span', { class: ok ? 'check-ok' : 'check-warn' }, (ok ? '✓ ' : '⚠ ') + (ok ? okText : badText));
  const checks = el('div', { class: 'checks' },
    chip(s.appliedIntervalMin === 15, '15-minute intervals',
      `${s.appliedIntervalMin}-min intervals (normalized to 15-min)`),
    cov ? chip(cov.isFullYear, `Full year — ${cov.days} days`, `${cov.days} days (not a full year)`) : null,
    chip(gapPct <= 0.02, gapPosLabel(s), gapPosLabel(s)),
    el('span', { class: 'check-ok' }, `✓ Reads as ${s.appliedUnit}`),
    s.consistency ? chip(s.consistency.agrees,
      `kW vs kWh cross-check passed (≈${s.consistency.medianRatioHours} h)`,
      `kW vs kWh mismatch (≈${s.consistency.medianRatioHours} h → ${s.consistency.impliedIntervalMin} min)`) : null,
  );

  // --- Override controls --------------------------------------------------
  const controls = [];
  // Value-column picker (only when the file has more than one kW/kWh column)
  let colSel = null;
  if (s.valueColumns && s.valueColumns.length > 1) {
    colSel = el('select', {},
      ...s.valueColumns.map((v) => {
        const o = el('option', { value: v.col }, `${v.header} (${v.unit})`);
        if (v.col === s.selectedValueCol) o.selected = true;
        return o;
      }));
    controls.push(el('label', { class: 'field' }, 'Value column:', colSel));
  }
  const unitSel = el('select', {},
    ...['kWh', 'kW'].map((u) => {
      const o = el('option', { value: u }, u);
      if (u === s.appliedUnit) o.selected = true;
      return o;
    }));
  const intSel = el('select', {},
    ...[5, 15, 30, 60].map((m) => {
      const o = el('option', { value: m }, `${m} min`);
      if (m === s.appliedIntervalMin) o.selected = true;
      return o;
    }));
  controls.push(
    el('label', { class: 'field' }, 'Unit:', unitSel),
    el('label', { class: 'field' }, 'Interval:', intSel),
    el('button', { class: 'action', onclick: () => {
      if (!lastRows) { alert('Original file is no longer in memory — re-upload it to change interpretation.'); return; }
      const ov = { unit: unitSel.value, intervalMin: +intSel.value };
      if (colSel) ov.valueCol = +colSel.value;
      process(lastRows, lastFileName, panel, ov);
    } }, 'Re-process'),
  );

  // --- Notes: separate confirmations (✓) from warnings (⚠) ---------------
  const warnNotes = (s.notes || []).filter((n) => /^⚠/.test(n));
  const infoNotes = (s.notes || []).filter((n) => !/^⚠/.test(n));

  return el('div', { class: 'panel' },
    el('h2', {}, 'What We Read From Your File'),
    checks,
    el('table', { class: 'data', style: 'max-width:720px;margin-top:10px' },
      tr('File', s.fileName),
      tr('Layout', s.format),
      cov ? tr('Date range', `${new Date(cov.startMs).toLocaleDateString()} – ${new Date(cov.endMs).toLocaleDateString()}`) : null,
      tr('Native interval', `${s.detectedIntervalMin} min`),
      trNode('Value column used',
        el('span', {}, valueColLabel(s))),
      tr('Rows parsed', s.rowsParsed.toLocaleString()),
      tr('Duplicate timestamps merged', s.duplicatesMerged.toLocaleString()),
      trNode('Gaps filled (linear interpolation)',
        el('span', { class: s.gapsFilled ? (gapPct > 0.02 ? 'warn' : '') : 'ok' },
          `${s.gapsFilled.toLocaleString()} intervals` +
          (s.gapsFilled ? ` (longest gap ${(s.longestGapIntervals * 15 / 60).toFixed(1)} h)` : ' — none'))),
    ),
    warnNotes.length ? el('div', { style: 'margin-top:8px' },
      ...warnNotes.map((nt) => el('div', { class: 'warn' }, nt))) : null,
    infoNotes.length ? el('div', { class: 'muted', style: 'margin-top:6px' },
      ...infoNotes.map((nt) => el('div', {}, nt))) : null,
    isReference ? null : el('h3', {}, 'Override interpretation'),
    isReference ? null : el('p', { class: 'muted', style: 'margin:0 0 6px' },
      'If anything above looks wrong, correct it here and re-process.'),
    isReference ? null : el('div', {}, ...controls),
  );
}

function gapPosLabel(s) {
  if (!s.gapsFilled) return 'No gaps — complete series';
  const pct = (s.gapsFilled / (s.gapsFilled + s.rowsParsed) * 100).toFixed(1);
  return `${s.gapsFilled.toLocaleString()} gap intervals filled (${pct}%)`;
}

function valueColLabel(s) {
  if (!s.valueColumns || !s.valueColumns.length) return s.appliedUnit;
  const sel = s.valueColumns.find((v) => v.col === s.selectedValueCol);
  const others = s.valueColumns.filter((v) => v.col !== s.selectedValueCol);
  let label = sel ? `${sel.header} (${sel.unit})` : s.appliedUnit;
  if (others.length) label += ` — also available: ${others.map((v) => `${v.header} (${v.unit})`).join(', ')}`;
  return label;
}

function tr(label, value) {
  return el('tr', {}, el('td', {}, label), el('td', {}, value));
}
function trNode(label, node) {
  return el('tr', {}, el('td', {}, label), el('td', {}, node));
}

// ---------------------------------------------------------------------------
// Stats + charts + tables
// ---------------------------------------------------------------------------

function statsStrip(a) {
  const o = a.overall;
  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
  return el('div', { class: 'stats', style: 'margin-bottom:12px' },
    stat(fmt.kw(o.peakKw), 'Peak demand'),
    stat(fmt.kw(o.avgKw), 'Average demand'),
    stat(fmt.pct(o.loadFactor), 'Load factor'),
    stat(fmt.num(o.totalKwh, 0) + ' kWh', `Energy (${Math.round(o.days)} days)`),
    stat(fmt.kw(o.peakKw - o.avgKw), 'Peak − average'),
    stat(new Date(o.startMs).toLocaleDateString() + ' – ' + new Date(o.endMs).toLocaleDateString(), 'Data range'),
  );
}

function chartsRow(site) {
  const a = site.intervals.analysis;

  const ldCanvas = el('canvas');
  const mpCanvas = el('canvas');
  const wdCanvas = el('canvas');

  const wdSel = el('select', {},
    ...a.monthly.map((m, i) => {
      const o = el('option', { value: i }, `${m.label} — worst day ${m.worstDay.dateKey} (${fmt.kw(m.worstDay.peakKw)})`);
      if (i === a.monthly.length - 1) o.selected = true;
      return o;
    }));
  const drawWd = () => {
    const m = a.monthly[+wdSel.value];
    renderDayProfile(wdCanvas, worstDayProfile(site.intervals.normalized, m),
      `Worst day ${m.worstDay.dateKey} — peak ${fmt.kw(m.worstDay.peakKw)} at ${new Date(m.worstDay.peakMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };
  wdSel.addEventListener('change', drawWd);

  const row = el('div', { class: 'row' },
    el('div', { class: 'panel' },
      el('h2', {}, 'Load Duration Curve'),
      el('div', { class: 'chart-box' }, ldCanvas)),
    el('div', { class: 'panel' },
      el('h2', {}, 'Monthly Peak vs Average'),
      el('div', { class: 'chart-box' }, mpCanvas)),
    el('div', { class: 'panel' },
      el('h2', {}, 'Worst-Day Profile (per billing period)'),
      el('label', { class: 'field' }, 'Billing period:', wdSel),
      el('div', { class: 'chart-box' }, wdCanvas)),
  );

  // Charts need the canvas in the DOM with layout; defer one frame.
  requestAnimationFrame(() => {
    renderDurationCurve(ldCanvas, a.durationCurve, a.overall.avgKw);
    renderMonthlyPeaks(mpCanvas, a.monthly);
    drawWd();
  });
  return row;
}

function monthlyTablePanel(a) {
  const header = el('tr', {},
    ...['Billing period', 'Peak kW', 'Peak time', 'Avg kW', 'Load factor', 'Energy kWh', 'Worst day', 'Worst-day peak kW']
      .map((h) => el('th', {}, h)));
  const rows = a.monthly.map((m) => el('tr', {},
    el('td', {}, m.label),
    el('td', {}, fmt.num(m.peakKw)),
    el('td', {}, new Date(m.peakMs).toLocaleString([], { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })),
    el('td', {}, fmt.num(m.avgKw)),
    el('td', {}, fmt.pct(m.loadFactor)),
    el('td', {}, fmt.num(m.energyKwh, 0)),
    el('td', {}, m.worstDay.dateKey),
    el('td', {}, fmt.num(m.worstDay.peakKw)),
  ));
  return el('div', { class: 'panel' },
    el('h2', {}, 'Monthly Peaks & Worst Days'),
    el('p', { class: 'muted' },
      'Worst day = the day containing each calendar month’s peak 15-min demand (assumes billing period ≈ calendar month). This drives sizing.'),
    el('table', { class: 'data' }, header, ...rows),
  );
}

function heatmapPanel(a) {
  const hm = a.heatmap;
  const color = (v) => {
    if (v === null) return '#f0f0f0';
    const t = hm.max ? v / hm.max : 0;
    // white -> sunbelt orange -> dark
    const r = Math.round(255 - t * 30);
    const g = Math.round(255 - t * 130);
    const b = Math.round(255 - t * 230);
    return `rgb(${r},${g},${b})`;
  };
  const header = el('tr', {}, el('th', {}, 'Month'),
    ...Array.from({ length: 24 }, (_, h) => el('th', {}, h)));
  const rows = hm.months.map((mk, mi) => el('tr', {},
    el('th', {}, mk),
    ...hm.values[mi].map((v) => el('td', {
      style: `background:${color(v)}`,
      title: v === null ? 'no data' : `${Math.round(v)} kW avg`,
    }, v === null ? '' : Math.round(v))),
  ));
  return el('div', { class: 'panel' },
    el('h2', {}, 'Seasonal Heat Map — Average kW by Month × Hour'),
    el('div', { style: 'overflow-x:auto' }, el('table', { class: 'heatmap' }, header, ...rows)),
  );
}
