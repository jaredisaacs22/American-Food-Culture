// Module 4 — Tariff Engine.
// Editable library of tariff schedules (seeded with PLACEHOLDER values for
// SDG&E, SCE, PSEG-LI). Savings everywhere compute against the selected
// schedule, never a flat $/kW assumption.

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, getTariffLibrary, setTariffLibrary, notify, subscribe } from '../../model/store.js';
import { seedTariffLibrary, computeTariffSavings } from './calc.js';
import usurdbTariffs from '../../data/usurdb-tariffs.json' with { type: 'json' };

// Default library = real USURDB-derived schedules (sourced, flagged "verify"),
// with the generic hand-built placeholders kept as a fallback for utilities
// outside the bundled states.
function defaultLibrary() {
  return [...usurdbTariffs.map((t) => ({ ...t })), ...seedTariffLibrary()];
}

let utilityFilter = 'all';

export default {
  id: 'tariffs',
  title: '4. Tariffs',
  mount(panel) {
    if (!getTariffLibrary().length) setTariffLibrary(defaultLibrary());
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded || change.dispatch) {
        if (!getTariffLibrary().length) setTariffLibrary(defaultLibrary());
        render(panel);
      }
    });
  },
};

function render(panel) {
  clear(panel);
  const site = getSite();
  const lib = getTariffLibrary();
  if (!site.tariff.selectedId || !lib.find((t) => t.id === site.tariff.selectedId)) {
    site.tariff.selectedId = lib[0]?.id ?? null;
  }
  const active = lib.find((t) => t.id === site.tariff.selectedId);

  panel.append(libraryPanel(panel, site, lib));
  if (active) panel.append(editorPanel(panel, active));
  if (active && site.dispatch.results) panel.append(savingsPanel(active, site.dispatch.results));
  else panel.append(el('p', { class: 'empty-note' }, 'Run a dispatch simulation (tab 3) to see $ savings on the selected schedule.'));
}

// ---------------------------------------------------------------------------
// Library list
// ---------------------------------------------------------------------------

function libraryPanel(panel, site, lib) {
  const utilities = [...new Set(lib.map((t) => t.utility))].sort();
  if (utilityFilter !== 'all' && !utilities.includes(utilityFilter)) utilityFilter = 'all';
  const shown = utilityFilter === 'all' ? lib : lib.filter((t) => t.utility === utilityFilter);

  const filterSel = el('select', {},
    el('option', { value: 'all' }, `All utilities (${lib.length})`),
    ...utilities.map((u) => {
      const o = el('option', { value: u }, `${u} (${lib.filter((t) => t.utility === u).length})`);
      if (u === utilityFilter) o.selected = true;
      return o;
    }));
  filterSel.addEventListener('change', () => { utilityFilter = filterSel.value; render(panel); });

  const header = el('tr', {}, ...['', 'Utility', 'Schedule', 'Facilities $/kW-mo', 'On-pk summer $/kW-mo', 'Ratchet', 'Status', '']
    .map((h) => el('th', {}, h)));
  const rows = shown.map((t) => {
    const isSel = t.id === site.tariff.selectedId;
    const pick = el('button', { class: isSel ? 'action' : 'ghost-sm', onclick: () => {
      site.tariff.selectedId = t.id;
      notify({ tariff: true });
      render(panel);
    } }, isSel ? 'Selected' : 'Select');
    const del = el('button', { class: 'ghost-sm', onclick: () => {
      if (!confirm(`Delete schedule "${t.utility} ${t.schedule}"?`)) return;
      setTariffLibrary(lib.filter((x) => x.id !== t.id));
      notify({ tariff: true });
      render(panel);
    } }, '✕');
    return el('tr', { class: isSel ? 'selected-row' : '' },
      el('td', {}, pick),
      el('td', {}, t.utility),
      el('td', {}, t.schedule),
      el('td', {}, fmt.num(t.demand.facilitiesKwMo, 2)),
      el('td', {}, fmt.num(t.demand.onPeakSummerKwMo, 2)),
      el('td', {}, t.ratchet?.enabled ? `${Math.round(t.ratchet.pct * 100)}%` : '—'),
      el('td', {}, t.placeholder ? el('span', { class: 'placeholder-tag' }, 'PLACEHOLDER') : el('span', { class: 'ok' }, 'verified')),
      el('td', {}, del),
    );
  });

  const addBtn = el('button', { class: 'action', onclick: () => {
    const t = {
      id: `tariff-${Date.now()}`,
      utility: 'New utility',
      schedule: 'New schedule',
      placeholder: true,
      notes: '',
      summerMonths: [6, 7, 8, 9],
      demand: { facilitiesKwMo: 0, onPeakSummerKwMo: 0, onPeakWinterKwMo: 0 },
      windows: [{ name: 'On-peak', startHour: 16, endHour: 21, summerRate: 0, winterRate: 0 }],
      offPeak: { summerRate: 0, winterRate: 0 },
      ratchet: { enabled: false, pct: 0.5 },
    };
    setTariffLibrary([...lib, t]);
    getSite().tariff.selectedId = t.id;
    notify({ tariff: true });
    render(panel);
  } }, '+ Add schedule');

  return el('div', { class: 'panel' },
    el('h2', {}, 'Tariff Library'),
    el('p', { class: 'warn' },
      '⚠ Rates are auto-derived from the OpenEI USURDB (or generic placeholders) and flagged ',
      el('span', { class: 'placeholder-tag' }, 'PLACEHOLDER'),
      ' — verify against the filed tariff sheet before quoting. Mark a schedule verified in its editor once confirmed.'),
    el('div', { style: 'margin-bottom:8px' },
      el('label', { class: 'field' }, 'Filter by utility:', filterSel),
      el('span', { class: 'muted' }, `Showing ${shown.length} of ${lib.length} schedules.`)),
    el('table', { class: 'data', style: 'max-width:980px' }, header, ...rows),
    el('div', { style: 'margin-top:8px' }, addBtn),
  );
}

// ---------------------------------------------------------------------------
// Editor for the selected schedule
// ---------------------------------------------------------------------------

function editorPanel(panel, t) {
  const onChange = () => {
    notify({ tariff: true });
    render(panel);
  };
  const num = (obj, field, step = 0.01) => {
    const inp = el('input', { type: 'number', step, value: obj[field] });
    inp.addEventListener('change', () => { obj[field] = +inp.value; onChange(); });
    return inp;
  };
  const text = (obj, field, width = 200) => {
    const inp = el('input', { type: 'text', value: obj[field], style: `width:${width}px` });
    inp.addEventListener('change', () => { obj[field] = inp.value; onChange(); });
    return inp;
  };

  const summerInp = el('input', { type: 'text', value: t.summerMonths.join(','), style: 'width:120px' });
  summerInp.addEventListener('change', () => {
    const months = summerInp.value.split(/[,\s]+/).map(Number).filter((m) => m >= 1 && m <= 12);
    if (!months.length) { alert('Enter summer months as numbers 1–12, e.g. "6,7,8,9".'); return; }
    t.summerMonths = months;
    onChange();
  });

  const verifiedChk = el('input', { type: 'checkbox' });
  verifiedChk.checked = !t.placeholder;
  verifiedChk.addEventListener('change', () => { t.placeholder = !verifiedChk.checked; onChange(); });

  const ratchetChk = el('input', { type: 'checkbox' });
  ratchetChk.checked = !!t.ratchet?.enabled;
  ratchetChk.addEventListener('change', () => { t.ratchet.enabled = ratchetChk.checked; onChange(); });
  const ratchetPct = el('input', { type: 'number', min: 0, max: 100, value: Math.round((t.ratchet?.pct ?? 0.5) * 100) });
  ratchetPct.addEventListener('change', () => { t.ratchet.pct = +ratchetPct.value / 100; onChange(); });

  // TOU windows table
  const winHeader = el('tr', {}, ...['Window name', 'Start hour', 'End hour', 'Summer $/kWh', 'Winter $/kWh', '']
    .map((h) => el('th', {}, h)));
  const winRows = t.windows.map((w, i) => el('tr', {},
    el('td', {}, text(w, 'name', 170)),
    el('td', {}, num(w, 'startHour', 1)),
    el('td', {}, num(w, 'endHour', 1)),
    el('td', {}, num(w, 'summerRate')),
    el('td', {}, num(w, 'winterRate')),
    el('td', {}, el('button', { class: 'ghost-sm', onclick: () => {
      if (t.windows.length <= 1) { alert('Keep at least one window (the on-peak window drives the demand charge).'); return; }
      t.windows.splice(i, 1);
      onChange();
    } }, '✕')),
  ));

  return el('div', { class: 'panel' },
    el('h2', {},
      `Edit: ${t.utility} ${t.schedule} `,
      t.placeholder ? el('span', { class: 'placeholder-tag' }, 'PLACEHOLDER') : null),
    el('div', {},
      el('label', { class: 'field' }, 'Utility:', text(t, 'utility', 140)),
      el('label', { class: 'field' }, 'Schedule:', text(t, 'schedule', 200)),
      el('label', { class: 'field' }, 'Rates verified (clears placeholder flag):', verifiedChk),
    ),
    el('h3', {}, 'Demand charges ($/kW-month)'),
    el('div', {},
      el('label', { class: 'field' }, 'Facilities (any-hour max):', num(t.demand, 'facilitiesKwMo')),
      el('label', { class: 'field' }, 'On-peak, summer:', num(t.demand, 'onPeakSummerKwMo')),
      el('label', { class: 'field' }, 'On-peak, winter:', num(t.demand, 'onPeakWinterKwMo')),
    ),
    el('div', { style: 'margin-top:6px' },
      el('label', { class: 'field' }, 'Summer months (1–12):', summerInp),
      el('label', { class: 'field' }, 'Ratchet:', ratchetChk, ' at ', ratchetPct, '% of prior 11-month max'),
    ),
    el('h3', {}, 'TOU energy windows (first window also defines the on-peak demand period)'),
    el('table', { class: 'data', style: 'max-width:760px' }, winHeader, ...winRows),
    el('div', { style: 'margin-top:6px' },
      el('button', { class: 'ghost-sm', onclick: () => {
        t.windows.push({ name: 'New window', startHour: 0, endHour: 0, summerRate: 0, winterRate: 0 });
        onChange();
      } }, '+ Add window'),
      el('label', { class: 'field', style: 'margin-left:14px' }, 'Off-peak summer $/kWh:', num(t.offPeak, 'summerRate')),
      el('label', { class: 'field' }, 'Off-peak winter $/kWh:', num(t.offPeak, 'winterRate')),
    ),
    el('div', { style: 'margin-top:6px' },
      el('label', { class: 'field' }, 'Notes:', text(t, 'notes', 480))),
  );
}

// ---------------------------------------------------------------------------
// Savings vs the dispatch run
// ---------------------------------------------------------------------------

function savingsPanel(tariff, results) {
  const s = computeTariffSavings(tariff, results.monthly);
  const header = el('tr', {}, ...['Month', 'Season', 'Billed kW raw', 'Billed kW shaved', 'Worst day (raw → after BESS)', 'Facilities $', 'On-peak kW raw→shaved', 'On-peak $', 'TOU energy $', 'Total $']
    .map((h) => el('th', {}, h)));
  const dayOf = (dk) => (dk ? dk.slice(8) : '—'); // day-of-month from YYYY-MM-DD
  const rows = s.monthly.map((m) => el('tr', {},
    el('td', {}, m.key),
    el('td', {}, m.summer ? 'summer' : 'winter'),
    el('td', {}, fmt.num(m.rawBilledKw, 0)),
    el('td', {}, fmt.num(m.shavedBilledKw, 0)),
    el('td', {}, m.rawPeakDate
      ? `${dayOf(m.rawPeakDate)}${m.shavedPeakDate === m.rawPeakDate ? '' : ` → ${dayOf(m.shavedPeakDate)}`}`
      : '—'),
    el('td', {}, fmt.usd(m.facilitiesSavings)),
    el('td', {}, `${fmt.num(m.rawOnPeakKw, 0)} → ${fmt.num(m.shavedOnPeakKw, 0)}`),
    el('td', {}, fmt.usd(m.onPeakSavings)),
    el('td', { class: m.energySavings < 0 ? 'warn' : '' }, fmt.usd(m.energySavings)),
    el('td', {}, el('b', {}, fmt.usd(m.totalSavings))),
  ));
  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));

  return el('div', { class: 'panel' },
    el('h2', {}, `Simulated Savings on ${tariff.utility} ${tariff.schedule} (config: ${results.configLabel})`),
    tariff.placeholder ? el('p', { class: 'warn' }, '⚠ Computed on PLACEHOLDER rates — directionally useful only.') : null,
    el('div', { class: 'stats', style: 'margin-bottom:10px' },
      stat(fmt.usd(s.annual.demandSavings), 'Annual demand savings'),
      stat(fmt.usd(s.annual.energySavings), 'Annual TOU arbitrage (net)'),
      stat(fmt.usd(s.annual.totalSavings), 'Annual total'),
    ),
    el('table', { class: 'data' }, header, ...rows),
    el('p', { class: 'muted' },
      'Demand charges follow worst-day-of-month billing: each month bills its single highest 15-min interval — ',
      'raw = the worst day identified in tab 1; after BESS = whichever day becomes the new binding day ',
      '(an arrow shows when it moves). ',
      'TOU energy = discharged kWh valued at the displaced hour’s rate minus charging kWh at its hour’s rate ',
      '(negative means round-trip losses cost more than the rate spread recovered).'),
  );
}
