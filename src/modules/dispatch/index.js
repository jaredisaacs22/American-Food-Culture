// Module 3 — Dispatch Simulator.
// Simulates the selected config against the FULL year of 15-min data:
// SOC over time, round-trip efficiency, charge windows, missed-peak events,
// realized vs theoretical reduction, annual cycles, representative-day overlay.
/* global Chart */

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, getTariffLibrary, notify, subscribe } from '../../model/store.js';
import { theoreticalRequirement } from '../sizing/calc.js';
import { simulateDispatch } from './calc.js';

/** The tariff the dispatch should optimize energy arbitrage against (or null). */
function selectedTariff(site) {
  const lib = getTariffLibrary();
  return lib.find((t) => t.id === site.tariff.selectedId) || lib[0] || null;
}

let chart = null;
let lastSeries = null; // Float64Arrays kept module-local (too big for workspace JSON)

export default {
  id: 'dispatch',
  title: '3. Dispatch',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      // Tariff changes affect the TOU-aware charge/discharge schedule, so a
      // tariff edit re-runs the simulation (not just the downstream $ valuation).
      if (change.workspaceLoaded || change.intervals || change.sizing || change.unitSpecs) {
        lastSeries = null;
        render(panel);
      } else if (change.tariff && getSite().dispatch.results) {
        lastSeries = null;
        runSim(getSite());
        render(panel);
      }
    });
  },
};

function render(panel) {
  clear(panel);
  const site = getSite();
  const { normalized, analysis } = site.intervals;
  const config = site.sizing.selectedConfig;

  if (!normalized || !analysis) {
    panel.append(el('p', { class: 'empty-note' }, 'Load interval data in tab 1 first.'));
    return;
  }
  if (!config) {
    panel.append(el('p', { class: 'empty-note' }, 'Select a configuration in tab 2 (Sizing) first.'));
    return;
  }

  panel.append(paramsPanel(panel, site, config));

  if (site.dispatch.results) {
    const r = site.dispatch.results;
    panel.append(statsStrip(r, config));
    panel.append(overlayPanel(site, analysis));
    panel.append(monthlyPanel(r));
  } else {
    panel.append(el('p', { class: 'empty-note' }, 'Run the simulation to see results.'));
  }
}

function runSim(site) {
  const { normalized, analysis } = site.intervals;
  const config = site.sizing.selectedConfig;
  const { shaveKw } = theoreticalRequirement(normalized, analysis, site.sizing.targetShavePct);
  const tariff = selectedTariff(site);
  // Pass the tariff (and arbitrage flag) into the sim without persisting the
  // tariff object onto the results.
  const simParams = { ...site.dispatch.params, tariff };
  const out = simulateDispatch(normalized, analysis, config, shaveKw, simParams);
  lastSeries = out.series;
  site.dispatch.results = {
    monthly: out.monthly,
    annual: out.annual,
    configLabel: config.label,
    shaveKw,
    tariffId: tariff ? tariff.id : null,
    tariffLabel: tariff ? `${tariff.utility} ${tariff.schedule}` : null,
    params: JSON.parse(JSON.stringify(site.dispatch.params)),
    ranAt: new Date().toISOString(),
  };
  notify({ dispatch: true });
}

function ensureSeries(site) {
  if (!lastSeries) runSim(site); // cheap (~35k intervals); recompute after workspace load
  return lastSeries;
}

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

function paramsPanel(panel, site, config) {
  const p = site.dispatch.params;

  const rteInp = el('input', { type: 'number', min: 50, max: 100, step: 0.5, value: Math.round(p.roundTripEfficiency * 1000) / 10 });
  const chgInp = el('input', { type: 'number', min: 1, value: p.maxChargeKw ?? (config.maxChargeKw || config.kw) });
  const arbChk = el('input', { type: 'checkbox' });
  arbChk.checked = p.arbitrage !== false;
  const tariff = selectedTariff(site);

  const windowsBox = el('div', {});
  const drawWindows = () => {
    clear(windowsBox);
    p.chargeWindows.forEach((w, i) => {
      const s = el('input', { type: 'number', min: 0, max: 24, value: w.startHour, style: 'width:60px' });
      const e = el('input', { type: 'number', min: 0, max: 24, value: w.endHour, style: 'width:60px' });
      s.addEventListener('change', () => { w.startHour = +s.value; });
      e.addEventListener('change', () => { w.endHour = +e.value; });
      windowsBox.append(el('div', { style: 'margin:3px 0' },
        el('label', { class: 'field' }, 'From hour', s, 'to hour', e),
        el('button', { class: 'ghost-sm', onclick: () => { p.chargeWindows.splice(i, 1); drawWindows(); } }, '✕'),
      ));
    });
    windowsBox.append(el('button', { class: 'ghost-sm', onclick: () => {
      p.chargeWindows.push({ startHour: 22, endHour: 6 });
      drawWindows();
    } }, '+ Add charge window'));
  };
  drawWindows();

  const runBtn = el('button', { class: 'action', onclick: () => {
    const rte = +rteInp.value / 100;
    if (!(rte > 0.5 && rte <= 1)) { alert('Round-trip efficiency must be 50–100%.'); return; }
    p.roundTripEfficiency = rte;
    p.maxChargeKw = +chgInp.value || null;
    p.arbitrage = arbChk.checked;
    runSim(site);
    render(panel);
  } }, site.dispatch.results ? 'Re-run simulation' : 'Run simulation');

  const flags = [];
  if (config.simultaneousChargeDischarge === false) {
    flags.push('Config includes units that cannot charge & discharge simultaneously — the simulator never does both in one interval, so this is honored structurally.');
  }

  return el('div', { class: 'panel' },
    el('h2', {}, `Simulation Parameters — ${config.label}`),
    el('div', {},
      el('label', { class: 'field' }, 'Round-trip efficiency %:', rteInp),
      el('label', { class: 'field' }, 'Max charge kW:', chgInp),
      el('label', { class: 'field' }, 'Energy arbitrage (charge off-peak / discharge on-peak):', arbChk),
      runBtn,
    ),
    el('p', { class: 'muted', style: 'margin:0 0 8px' },
      tariff
        ? `TOU rates from ${tariff.utility} ${tariff.schedule} (tab 4). The battery charges only off-peak and, with arbitrage on, discharges spare energy during on-peak hours to capture the $/kWh spread.`
        : 'No tariff selected (tab 4) — charging is price-blind. Select a tariff to enable TOU-aware charging and energy arbitrage.'),
    el('h3', {}, 'Charge windows (optional — further restricts charging hours; empty = any off-peak hour)'),
    windowsBox,
    el('p', { class: 'muted', style: 'margin:8px 0 0' },
      'Peak-aware dispatch: each day the battery reserves its stored energy for that day’s peak, shaving down to ',
      'the month’s target level (max of the monthly average and peak − shave) where energy allows, and to the ',
      'lowest flat level it can hold otherwise — it does not drain on the shoulders. It recharges when load is below ',
      'the target (within any charge windows), capped so charging never creates a new peak. Round-trip losses are ',
      'booked on the charging side; the battery starts the year full. Where overnight recharge can’t fully refill, ',
      'realized reduction falls below the sizing estimate — that gap is a real operational limit, shown per month below.'),
    ...flags.map((f) => el('div', { class: 'warn', style: 'margin-top:6px' }, `⚠ ${f}`)),
  );
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

function statsStrip(r) {
  const stat = (v, l, cls = '') => el('div', { class: 'stat' }, el('div', { class: `v ${cls}` }, v), el('div', { class: 'l' }, l));
  return el('div', { class: 'stats', style: 'margin-bottom:12px' },
    stat(fmt.num(r.annual.cycles, 1), 'Annual cycles'),
    stat(fmt.num(r.annual.dischargeKwh, 0) + ' kWh', 'Discharged (total)'),
    stat(fmt.num(r.annual.arbitrageKwh || 0, 0) + ' kWh', 'of which arbitrage'),
    stat(fmt.num(r.annual.lossesKwh, 0) + ' kWh', 'Round-trip losses'),
    stat(String(r.annual.missedEvents), 'Missed-peak events', r.annual.missedEvents ? 'warn' : 'ok'),
    stat(fmt.kw(r.annual.avgRealizedReductionKw), 'Avg realized reduction'),
    stat(fmt.pct(r.annual.avgTheoreticalReductionKw > 0 ? r.annual.avgRealizedReductionKw / r.annual.avgTheoreticalReductionKw : 1), 'Realized / theoretical'),
  );
}

function monthlyPanel(r) {
  const header = el('tr', {},
    ...['Month', 'Raw peak kW', 'Target kW', 'Shaved peak kW', 'Theoretical −kW', 'Realized −kW', 'Realized %', 'Missed events', 'Worst shortfall kW', 'Discharge kWh', 'Charge kWh (grid)']
      .map((h) => el('th', {}, h)));
  const rows = r.monthly.map((m) => {
    const pct = m.theoreticalReductionKw > 0 ? m.realizedReductionKw / m.theoreticalReductionKw : 1;
    return el('tr', {},
      el('td', {}, m.key),
      el('td', {}, fmt.num(m.rawPeakKw, 0)),
      el('td', {}, fmt.num(m.targetKw, 0)),
      el('td', {}, fmt.num(m.shavedPeakKw, 0)),
      el('td', {}, fmt.num(m.theoreticalReductionKw, 1)),
      el('td', {}, fmt.num(m.realizedReductionKw, 1)),
      el('td', { class: pct < 0.95 ? 'warn' : 'ok' }, fmt.pct(pct)),
      el('td', { class: m.missedEvents ? 'warn' : '' }, m.missedEvents),
      el('td', {}, m.worstShortfallKw ? fmt.num(m.worstShortfallKw, 1) : '—'),
      el('td', {}, fmt.num(m.dischargeKwh, 0)),
      el('td', {}, fmt.num(m.chargeKwh, 0)),
    );
  });
  return el('div', { class: 'panel' },
    el('h2', {}, 'Realized vs Theoretical Demand Reduction by Month'),
    el('p', { class: 'muted' },
      'Theoretical = raw peak − target level. Realized = raw peak − simulated (shaved) peak. ',
      'A missed-peak event is a contiguous run of intervals where the battery could not hold load to the target.'),
    el('table', { class: 'data' }, header, ...rows),
  );
}

// ---------------------------------------------------------------------------
// Representative day overlay
// ---------------------------------------------------------------------------

function overlayPanel(site, analysis) {
  const canvas = el('canvas');
  const sel = el('select', {},
    ...analysis.monthly.map((m, i) => {
      const o = el('option', { value: i }, `${m.label} — worst day ${m.worstDay.dateKey}`);
      if (m.peakKw === analysis.overall.peakKw) o.selected = true;
      return o;
    }));

  const draw = () => {
    const series = ensureSeries(site);
    const m = analysis.monthly[+sel.value];
    const { profileStartIdx, profileLength } = m.worstDay;
    const norm = site.intervals.normalized;
    const labels = [];
    const raw = [];
    const shaved = [];
    const soc = [];
    for (let i = 0; i < profileLength; i++) {
      const idx = profileStartIdx + i;
      const d = new Date(norm.startMs + idx * 15 * 60000);
      labels.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      raw.push(norm.kw[idx]);
      shaved.push(series.shavedKw[idx]);
      soc.push(series.soc[idx]);
    }
    const target = site.dispatch.results.monthly.find((x) => x.key === m.key)?.targetKw;

    if (chart) chart.destroy();
    chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Raw load (kW)', data: raw, borderColor: '#9aa3ad', pointRadius: 0, borderWidth: 1.5, fill: false },
          { label: 'Shaved load (kW)', data: shaved, borderColor: '#FFA400', backgroundColor: 'rgba(255,164,0,0.12)', pointRadius: 0, borderWidth: 2, fill: true },
          { label: 'Target level (kW)', data: raw.map(() => target), borderColor: '#c62828', borderDash: [6, 4], pointRadius: 0, borderWidth: 1.5, fill: false },
          { label: 'SOC (kWh)', data: soc, borderColor: '#2e7d32', pointRadius: 0, borderWidth: 1.5, fill: false, yAxisID: 'y2' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 13 } },
          y: { beginAtZero: true, title: { display: true, text: 'kW' } },
          y2: { beginAtZero: true, position: 'right', title: { display: true, text: 'SOC kWh' }, grid: { drawOnChartArea: false } },
        },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  };
  sel.addEventListener('change', draw);
  requestAnimationFrame(draw);

  return el('div', { class: 'panel' },
    el('h2', {}, 'Representative Day — Raw vs Shaved Load with SOC'),
    el('label', { class: 'field' }, 'Day:', sel),
    el('div', { class: 'chart-box tall' }, canvas),
  );
}
