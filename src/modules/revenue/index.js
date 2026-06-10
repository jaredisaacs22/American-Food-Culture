// Module 5 — Revenue Stack Modeler.
// Conservative / base / aggressive scenarios layering DR, capacity programs,
// and TOU arbitrage on top of demand-charge savings, with conflict capping.
/* global Chart */

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, getTariffLibrary, notify, subscribe } from '../../model/store.js';
import { computeTariffSavings } from '../tariffs/calc.js';
import { theoreticalRequirement } from '../sizing/calc.js';
import { defaultScenarios, computeStack } from './calc.js';

let chart = null;
const SCENARIO_IDS = ['conservative', 'base', 'aggressive'];

export default {
  id: 'revenue',
  title: '5. Revenue Stack',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded || change.intervals || change.sizing || change.dispatch || change.tariff) render(panel);
    });
  },
};

/** Pull everything the stack needs from upstream modules; null if not ready. */
export function stackContext(site) {
  const { normalized, analysis } = site.intervals;
  const config = site.sizing.selectedConfig;
  const results = site.dispatch.results;
  const tariff = getTariffLibrary().find((t) => t.id === site.tariff.selectedId);
  if (!normalized || !analysis || !config || !results || !tariff) return null;

  const savings = computeTariffSavings(tariff, results.monthly);
  const req = theoreticalRequirement(normalized, analysis, site.sizing.targetShavePct);
  return {
    demandSavingsAnnual: savings.annual.demandSavings,
    arbitrageAnnual: savings.annual.energySavings,
    configKw: config.kw,
    configKwh: config.kwh,
    // Peak shaving reserves the largest monthly realized reduction (kW) and
    // one worst-day discharge of energy (kWh, capped at the config rating).
    reservedKw: Math.max(...results.monthly.map((m) => m.realizedReductionKw)),
    reservedKwh: Math.min(config.kwh, req.kwhNeed),
    tariff,
    config,
  };
}

function ensureScenarios(site) {
  if (!site.revenue.scenarios) site.revenue.scenarios = defaultScenarios();
  return site.revenue.scenarios;
}

function render(panel) {
  clear(panel);
  const site = getSite();
  const ctx = stackContext(site);

  if (!ctx) {
    panel.append(el('p', { class: 'empty-note' },
      'Needs data + a selected config + a dispatch run + a tariff (tabs 1–4) before revenue can stack.'));
    return;
  }

  const scenarios = ensureScenarios(site);
  const computed = {};
  for (const id of SCENARIO_IDS) computed[id] = computeStack(scenarios[id], ctx);
  // Persist totals so economics & summary read a stable slice
  site.revenue.computed = Object.fromEntries(SCENARIO_IDS.map((id) => [id, {
    total: computed[id].total,
    rows: computed[id].rows.map((r) => ({ name: r.name, annual: r.annual })),
    conflicts: computed[id].conflicts,
  }]));

  panel.append(headerPanel(panel, site, ctx, scenarios, computed));
  panel.append(el('div', { class: 'row' },
    ...SCENARIO_IDS.map((id) => scenarioPanel(panel, site, id, scenarios[id], computed[id], ctx))));
  panel.append(chartPanel(computed));
}

function headerPanel(panel, site, ctx, scenarios, computed) {
  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'v' }, v), el('div', { class: 'l' }, l));
  const sel = el('select', {},
    ...SCENARIO_IDS.map((id) => {
      const o = el('option', { value: id }, `${id} — ${fmt.usd(computed[id].total)}/yr`);
      if (id === scenarios.selected) o.selected = true;
      return o;
    }));
  sel.addEventListener('change', () => {
    scenarios.selected = sel.value;
    notify({ revenue: true });
    render(panel);
  });

  return el('div', { class: 'panel' },
    el('h2', {}, 'Revenue Stack'),
    el('div', { class: 'stats', style: 'margin-bottom:8px' },
      stat(fmt.usd(ctx.demandSavingsAnnual), 'Demand savings (tariff)'),
      stat(fmt.usd(ctx.arbitrageAnnual), 'TOU arbitrage (tariff)'),
      stat(`${Math.round(ctx.reservedKw)} kW / ${Math.round(ctx.reservedKwh)} kWh`, 'Reserved by peak shaving'),
      stat(`${Math.round(ctx.configKw)} kW / ${Math.round(ctx.configKwh)} kWh`, 'Config rating'),
    ),
    el('label', { class: 'field' }, 'Scenario used downstream (economics & summary):', sel),
    el('p', { class: 'muted', style: 'margin:6px 0 0' },
      'Conflict rule: peak shaving reserves capacity first; DR can only commit leftover kW, capacity programs leftover kWh. ',
      'DR and capacity program rates are PLACEHOLDER assumptions — edit per scenario.'),
  );
}

function scenarioPanel(panel, site, id, sc, result) {
  const onChange = () => { notify({ revenue: true }); render(panel); };
  const num = (obj, field, step = 1) => {
    const inp = el('input', { type: 'number', step, value: obj[field], style: 'width:80px' });
    inp.addEventListener('change', () => { obj[field] = +inp.value; onChange(); });
    return inp;
  };
  const chk = (obj, field) => {
    const inp = el('input', { type: 'checkbox' });
    inp.checked = !!obj[field];
    inp.addEventListener('change', () => { obj[field] = inp.checked; onChange(); });
    return inp;
  };

  const rows = result.rows.map((r) => el('tr', {},
    el('td', {}, r.name),
    el('td', {}, fmt.usd(r.annual)),
  ));

  const isSelected = site.revenue.scenarios.selected === id;
  return el('div', { class: 'panel', style: isSelected ? 'border-color:#FFA400' : '' },
    el('h2', {}, `${id[0].toUpperCase()}${id.slice(1)} — ${fmt.usd(result.total)}/yr`,
      isSelected ? el('span', { class: 'placeholder-tag', style: 'margin-left:8px;background:#ffe6bf;color:#7a4b00' }, 'IN USE') : null),
    el('div', {},
      el('label', { class: 'field' }, 'Demand factor:', num(sc, 'demandFactor', 0.05)),
      el('label', { class: 'field' }, 'Arbitrage factor:', num(sc, 'arbitrageFactor', 0.05)),
    ),
    el('h3', {}, 'Demand response ', el('span', { class: 'placeholder-tag' }, 'PLACEHOLDER RATE')),
    el('div', {},
      el('label', { class: 'field' }, 'Enrolled:', chk(sc.dr, 'enabled')),
      el('label', { class: 'field' }, '$/kW-yr:', num(sc.dr, 'ratePerKwYr')),
      el('label', { class: 'field' }, 'Committed kW:', num(sc.dr, 'committedKw', 5)),
    ),
    el('h3', {}, 'Capacity / incentive ', el('span', { class: 'placeholder-tag' }, 'PLACEHOLDER RATE')),
    el('div', {},
      el('label', { class: 'field' }, 'Enrolled:', chk(sc.capacity, 'enabled')),
      el('label', { class: 'field' }, '$/kWh-yr:', num(sc.capacity, 'ratePerKwhYr')),
      el('label', { class: 'field' }, 'Committed kWh:', num(sc.capacity, 'committedKwh', 25)),
    ),
    el('table', { class: 'data', style: 'margin-top:8px' },
      el('tr', {}, el('th', {}, 'Stream'), el('th', {}, 'Annual $')),
      ...rows,
      el('tr', {}, el('td', {}, el('b', {}, 'Total')), el('td', {}, el('b', {}, fmt.usd(result.total)))),
    ),
    ...result.conflicts.map((c) => el('div', { class: 'warn', style: 'margin-top:6px' }, `⚠ ${c}`)),
  );
}

function chartPanel(computed) {
  const canvas = el('canvas');
  requestAnimationFrame(() => {
    // Union of stream ids across scenarios for a stacked comparison
    const names = [...new Set(SCENARIO_IDS.flatMap((id) => computed[id].rows.map((r) => r.id)))];
    const colors = { demand: '#FFA400', arbitrage: '#9aa3ad', dr: '#2e7d32', capacity: '#5b7fd4' };
    const labels = { demand: 'Demand savings', arbitrage: 'TOU arbitrage', dr: 'Demand response', capacity: 'Capacity/incentive' };
    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: SCENARIO_IDS,
        datasets: names.map((nid) => ({
          label: labels[nid] || nid,
          data: SCENARIO_IDS.map((sid) => computed[sid].rows.find((r) => r.id === nid)?.annual ?? 0),
          backgroundColor: colors[nid] || '#888',
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, title: { display: true, text: '$ / yr' } } },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  });
  return el('div', { class: 'panel' },
    el('h2', {}, 'Scenario Comparison'),
    el('div', { class: 'chart-box' }, canvas),
  );
}
