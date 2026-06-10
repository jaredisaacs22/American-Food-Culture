// Module 2 — BESS Sizing Engine.
// Peak−average shave target with adjustable %, fleet candidate configs ranked
// by worst-day capture rate, manual override, editable unit-spec table.
/* global Chart */

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, getUnitSpecs, notify, subscribe } from '../../model/store.js';
import { theoreticalRequirement, generateCandidates, manualConfig, captureRate } from './calc.js';

let chart = null;
let showAllCombos = false;

export default {
  id: 'sizing',
  title: '2. Sizing',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded || change.intervals || change.unitSpecs) render(panel);
    });
  },
};

function render(panel) {
  clear(panel);
  const site = getSite();
  const { normalized, analysis } = site.intervals;

  if (!normalized || !analysis) {
    panel.append(
      unitSpecPanel(panel),
      el('p', { class: 'empty-note' }, 'Load interval data in tab 1 first — sizing keys off the worst day per billing period.'),
    );
    return;
  }

  const req = theoreticalRequirement(normalized, analysis, site.sizing.targetShavePct);

  panel.append(targetPanel(panel, site, analysis, req));
  panel.append(unitSpecPanel(panel));
  panel.append(candidatesPanel(panel, site, normalized, analysis, req));
  if (site.sizing.selectedConfig) panel.append(selectedPanel(site, normalized, analysis, req));
}

// ---------------------------------------------------------------------------
// Shave target
// ---------------------------------------------------------------------------

function targetPanel(panel, site, analysis, req) {
  const o = analysis.overall;
  const slider = el('input', {
    type: 'range', min: 5, max: 100, step: 5, value: site.sizing.targetShavePct, style: 'width:260px',
  });
  const pctLabel = el('b', {}, `${site.sizing.targetShavePct}%`);
  slider.addEventListener('input', () => { pctLabel.textContent = `${slider.value}%`; });
  slider.addEventListener('change', () => {
    site.sizing.targetShavePct = +slider.value;
    site.sizing.selectedConfig = null; // capture numbers are stale for the new target
    notify({ sizing: true });
    render(panel);
  });

  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
  return el('div', { class: 'panel' },
    el('h2', {}, 'Shave Target'),
    el('div', { style: 'margin-bottom:10px' },
      el('label', { class: 'field' }, 'Target shave (% of peak − average): ', slider, pctLabel)),
    el('div', { class: 'stats' },
      stat(fmt.kw(o.peakKw), 'Annual peak'),
      stat(fmt.kw(o.avgKw), 'Average'),
      stat(fmt.kw(o.peakKw - o.avgKw), 'Peak − average'),
      stat(fmt.kw(req.shaveKw), 'Target shave'),
      stat(fmt.kwh(req.kwhNeed), `Worst-day energy need (${req.bindingMonth || '—'})`),
    ),
    el('p', { class: 'muted', style: 'margin:8px 0 0' },
      'Assumptions: the shave target applies to each billing month’s peak (demand charges bill monthly); ',
      'capture assumes the battery starts each worst day full with no mid-day recharge (conservative — Module 3 simulates recharge against the full year); ',
      'usable energy = nameplate kWh.'),
  );
}

// ---------------------------------------------------------------------------
// Unit specs (editable)
// ---------------------------------------------------------------------------

function unitSpecPanel(panel) {
  const specs = getUnitSpecs();
  const numCell = (u, field, step = 1) => {
    const inp = el('input', { type: 'number', value: u[field], min: 0, step });
    inp.addEventListener('change', () => { u[field] = +inp.value; onSpecsChanged(panel); });
    return el('td', {}, inp);
  };
  const boolCell = (u, field) => {
    const inp = el('input', { type: 'checkbox' });
    inp.checked = !!u[field];
    inp.addEventListener('change', () => { u[field] = inp.checked; onSpecsChanged(panel); });
    return el('td', { style: 'text-align:center' }, inp);
  };

  const header = el('tr', {},
    ...['Unit', 'kW', 'kWh', 'Max charge kW', 'Can parallel', 'Simultaneous chg/dis', '']
      .map((h) => el('th', {}, h)));
  const rows = specs.map((u, i) => {
    const nameInp = el('input', { type: 'text', value: u.name, style: 'width:200px' });
    nameInp.addEventListener('change', () => { u.name = nameInp.value; onSpecsChanged(panel); });
    const del = el('button', { class: 'ghost-sm', onclick: () => {
      if (specs.length <= 1) { alert('Keep at least one unit type.'); return; }
      specs.splice(i, 1);
      onSpecsChanged(panel);
    } }, '✕');
    return el('tr', {},
      el('td', {}, nameInp),
      numCell(u, 'kw'), numCell(u, 'kwh'), numCell(u, 'maxChargeKw'),
      boolCell(u, 'canParallel'), boolCell(u, 'simultaneousChargeDischarge'),
      el('td', {}, del),
    );
  });

  const addBtn = el('button', { class: 'action', onclick: () => {
    specs.push({
      id: `unit-${Date.now()}`, name: 'New unit', kw: 100, kwh: 200, maxChargeKw: 100,
      canParallel: true, simultaneousChargeDischarge: true,
    });
    onSpecsChanged(panel);
  } }, '+ Add unit type');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Fleet Unit Specs'),
    el('p', { class: 'muted' },
      'Editable reference table. Units with “can parallel” off are only offered as a single unit and never mixed ',
      '(e.g. legacy Moxion MP-75/600). Flags also feed the dispatch simulator.'),
    el('table', { class: 'data', style: 'max-width:820px' }, header, ...rows),
    el('div', { style: 'margin-top:8px' }, addBtn),
  );
}

function onSpecsChanged(panel) {
  const site = getSite();
  site.sizing.selectedConfig = null; // unit math changed under it
  notify({ unitSpecs: true });
  render(panel);
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

function candidatesPanel(panel, site, normalized, analysis, req) {
  const candidates = generateCandidates(normalized, analysis, req.shaveKw, getUnitSpecs());
  const shown = showAllCombos ? candidates : candidates.filter((c) => !c.dominated);

  const header = el('tr', {},
    ...['', 'Configuration', 'kW', 'kWh', 'Units', 'Capture rate', 'Worst month', '']
      .map((h) => el('th', {}, h)));

  const rows = shown.map((c) => {
    const worst = c.perMonth.reduce((w, m) => (m.rate < w.rate ? m : w), { rate: Infinity, label: '—' });
    const isSel = isSelected(site.sizing.selectedConfig, c);
    const pick = el('button', { class: isSel ? 'action' : 'ghost-sm', onclick: () => {
      site.sizing.selectedConfig = stripForStore(c);
      notify({ sizing: true });
      render(panel);
    } }, isSel ? 'Selected' : 'Select');
    return el('tr', { class: isSel ? 'selected-row' : '' },
      el('td', {}, c.captureRate >= 0.999 ? '●' : c.captureRate >= 0.95 ? '◐' : ''),
      el('td', {}, c.label),
      el('td', {}, fmt.num(c.kw, 0)),
      el('td', {}, fmt.num(c.kwh, 0)),
      el('td', {}, c.unitCount),
      el('td', {}, el('b', {}, fmt.pct(c.captureRate))),
      el('td', {}, worst.rate === Infinity ? '—' : `${fmt.pct(worst.rate)} (${worst.label})`),
      el('td', {}, pick),
    );
  });

  const allToggle = el('input', { type: 'checkbox' });
  allToggle.checked = showAllCombos;
  allToggle.addEventListener('change', () => { showAllCombos = allToggle.checked; render(panel); });

  // Manual override
  const kwInp = el('input', { type: 'number', min: 1, value: site.sizing.manualOverride?.kw ?? Math.ceil(req.shaveKw) });
  const kwhInp = el('input', { type: 'number', min: 1, value: site.sizing.manualOverride?.kwh ?? Math.ceil(req.kwhNeed) });
  const applyBtn = el('button', { class: 'action', onclick: () => {
    const kw = +kwInp.value;
    const kwh = +kwhInp.value;
    if (!(kw > 0) || !(kwh > 0)) { alert('Enter positive kW and kWh.'); return; }
    site.sizing.manualOverride = { kw, kwh };
    site.sizing.selectedConfig = stripForStore(manualConfig(normalized, analysis, req.shaveKw, kw, kwh));
    notify({ sizing: true });
    render(panel);
  } }, 'Force this config');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Candidate Configurations'),
    el('p', { class: 'muted' },
      'Capture rate = % of the desired shave actually achieved across all 12 worst days (demand-weighted). ',
      '● ≥ 99.9% capture, ◐ ≥ 95%. ',
      el('label', { class: 'field', style: 'margin-left:10px' }, allToggle, ' show dominated combos')),
    el('table', { class: 'data', style: 'max-width:980px' }, header, ...rows),
    el('h3', {}, 'Manual override'),
    el('div', {},
      el('label', { class: 'field' }, 'kW:', kwInp),
      el('label', { class: 'field' }, 'kWh:', kwhInp),
      applyBtn,
      el('span', { class: 'muted', style: 'margin-left:8px' }, 'Forces an arbitrary rating regardless of fleet units.'),
    ),
  );
}

function isSelected(sel, c) {
  return !!sel && sel.label === c.label && sel.kw === c.kw && sel.kwh === c.kwh;
}

/** Persist only what downstream modules and the workspace need. */
function stripForStore(c) {
  return {
    label: c.label,
    kw: c.kw,
    kwh: c.kwh,
    maxChargeKw: c.maxChargeKw,
    unitCount: c.unitCount,
    units: c.units,
    simultaneousChargeDischarge: c.simultaneousChargeDischarge,
    custom: c.custom,
    captureRate: c.captureRate,
    perMonth: c.perMonth,
  };
}

// ---------------------------------------------------------------------------
// Selected config detail
// ---------------------------------------------------------------------------

function selectedPanel(site, normalized, analysis, req) {
  // Recompute capture against current data/target so a stale stored config can't mislead
  const sel = site.sizing.selectedConfig;
  const cap = captureRate(normalized, analysis, req.shaveKw, sel);
  sel.captureRate = cap.rate;
  sel.perMonth = cap.perMonth;

  const canvas = el('canvas');
  requestAnimationFrame(() => {
    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: cap.perMonth.map((m) => m.label),
        datasets: [
          { label: 'Desired shave (kW)', data: cap.perMonth.map((m) => m.desiredKw), backgroundColor: '#9aa3ad' },
          { label: 'Captured (kW)', data: cap.perMonth.map((m) => m.capturedKw), backgroundColor: '#FFA400' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, title: { display: true, text: 'kW' } } },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  });

  const header = el('tr', {}, ...['Month', 'Worst-day peak', 'Target level', 'Achievable level', 'Captured kW', 'Capture'].map((h) => el('th', {}, h)));
  const rows = cap.perMonth.map((m, i) => el('tr', {},
    el('td', {}, m.label),
    el('td', {}, fmt.num(analysis.monthly[i].peakKw, 0)),
    el('td', {}, fmt.num(m.targetKw, 0)),
    el('td', {}, fmt.num(m.achievableLevelKw, 0)),
    el('td', {}, fmt.num(m.capturedKw, 1)),
    el('td', { class: m.rate < 0.95 ? 'warn' : 'ok' }, fmt.pct(m.rate)),
  ));

  return el('div', { class: 'row' },
    el('div', { class: 'panel' },
      el('h2', {}, `Selected: ${sel.label} — ${fmt.pct(sel.captureRate)} capture`),
      el('div', { class: 'chart-box' }, canvas)),
    el('div', { class: 'panel' },
      el('h2', {}, 'Per-Month Capture Detail'),
      el('table', { class: 'data' }, header, ...rows)),
  );
}
