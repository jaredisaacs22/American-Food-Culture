// Module 1 — Interval Data Workbench.
// Upload CSV/XLSX interval data, auto-detect format, normalize to 15-min kW,
// and produce the analysis that drives sizing (worst day per billing period).
/* global XLSX */

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, notify, subscribe } from '../../model/store.js';
import { parseCsv, parseIntervalRows, detectLayout, extractRecords } from './parser.js';
import { analyzeIntervals, worstDayProfile } from './analysis.js';
import { renderDurationCurve, renderMonthlyPeaks, renderDayProfile } from './charts.js';

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
      'CSV / XLSX — Green Button exports, SCE & SDG&E formats, or generic timestamp + kW/kWh. ',
      'Auto-detects 15/30/60-min intervals and normalizes to 15-min kW.'),
  );
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0], panel);
  });

  return el('div', { class: 'panel' }, el('h2', {}, 'Interval Data Upload'), dz, input);
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
  const gapPct = s.gapsFilled / (s.gapsFilled + s.rowsParsed);

  const unitSel = el('select', {},
    ...['kWh', 'kW'].map((u) => {
      const o = el('option', { value: u }, u);
      if (u === s.appliedUnit) o.selected = true;
      return o;
    }));
  const intSel = el('select', {},
    ...[15, 30, 60].map((m) => {
      const o = el('option', { value: m }, `${m} min`);
      if (m === s.appliedIntervalMin) o.selected = true;
      return o;
    }));
  const reBtn = el('button', { class: 'action', onclick: () => {
    if (!lastRows) { alert('Original file is no longer in memory — re-upload it to change interpretation.'); return; }
    process(lastRows, lastFileName, panel, { unit: unitSel.value, intervalMin: +intSel.value });
  } }, 'Re-process');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Detection Summary'),
    el('table', { class: 'data', style: 'max-width:680px' },
      tr('File', s.fileName),
      tr('Layout', s.format),
      tr('Detected interval', `${s.detectedIntervalMin} min`),
      tr('Detected unit', s.detectedUnit),
      tr('Rows parsed', s.rowsParsed.toLocaleString()),
      tr('Duplicate timestamps merged', s.duplicatesMerged.toLocaleString()),
      trNode('Gaps filled (linear interpolation)',
        el('span', { class: s.gapsFilled ? (gapPct > 0.02 ? 'warn' : '') : 'ok' },
          `${s.gapsFilled.toLocaleString()} intervals` +
          (s.gapsFilled ? ` (longest gap ${(s.longestGapIntervals * 15 / 60).toFixed(1)} h)` : ''))),
    ),
    s.notes.length ? el('div', { style: 'margin-top:8px' },
      ...s.notes.map((nt) => el('div', { class: 'warn' }, `⚠ ${nt}`))) : null,
    el('h3', {}, 'Override interpretation'),
    el('div', {},
      el('label', { class: 'field' }, 'Unit:', unitSel),
      el('label', { class: 'field' }, 'Interval:', intSel),
      reBtn,
    ),
  );
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
