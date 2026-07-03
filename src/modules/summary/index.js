// Module 7 — Site Evaluation Summary.
// One-page composite per site + branded PDF export (jsPDF, Sunbelt orange,
// Roboto embedded). Permitting risk is manual entry by design (no AHJ lookup).
/* global jspdf */

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, getTariffLibrary, notify, subscribe } from '../../model/store.js';

const ORANGE = [255, 164, 0]; // PLACEHOLDER brand hex #FFA400 — to be confirmed
const INK = [31, 35, 41];

export default {
  id: 'summary',
  title: '7. Summary',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded || change.intervals || change.sizing || change.dispatch
        || change.tariff || change.revenue || change.economics || change.meta) render(panel);
    });
  },
};

/** Gather every slice the summary needs; missing pieces stay null. */
function snapshot(site) {
  const a = site.intervals.analysis;
  const src = site.intervals.source;
  const config = site.sizing.selectedConfig;
  const dispatch = site.dispatch.results;
  const tariff = getTariffLibrary().find((t) => t.id === site.tariff.selectedId) || null;
  const scenario = site.revenue.scenarios?.selected || 'base';
  const stack = site.revenue.computed?.[scenario] || null;
  const econ = site.economics.results || null;
  // Data basis drives how much to trust every number downstream
  const basis = !src ? null
    : src.invoice ? { label: `Invoice-calibrated estimate (${src.invoice.entries.length} invoice months, ${src.invoice.typeLabel} shape)`, estimate: true }
      : src.reference ? { label: `Reference shape (${src.reference.typeLabel}, scaled — no site data)`, estimate: true }
        : { label: `Metered interval data (${src.fileName})`, estimate: false };
  return { a, src, basis, config, dispatch, tariff, scenario, stack, econ };
}

function render(panel) {
  clear(panel);
  const site = getSite();
  const s = snapshot(site);

  panel.append(siteInfoPanel(panel, site));

  if (!s.a) {
    panel.append(el('p', { class: 'empty-note' }, 'Load interval data (tab 1) to populate the evaluation.'));
    return;
  }

  panel.append(compositePanel(site, s));
  panel.append(riskPanel(panel, site));
  panel.append(exportPanel(site, s));
}

// ---------------------------------------------------------------------------
// Site info (editable meta)
// ---------------------------------------------------------------------------

function siteInfoPanel(panel, site) {
  const text = (field, width = 220) => {
    const inp = el('input', { type: 'text', value: site.meta[field] || '', style: `width:${width}px` });
    inp.addEventListener('change', () => { site.meta[field] = inp.value; notify({ meta: true }); });
    return inp;
  };
  return el('div', { class: 'panel' },
    el('h2', {}, 'Site Information'),
    el('div', {},
      el('label', { class: 'field' }, 'Customer:', text('customer')),
      el('label', { class: 'field' }, 'Address:', text('address', 300)),
      el('label', { class: 'field' }, 'Utility:', text('utility', 140)),
    ),
    el('div', { style: 'margin-top:6px' },
      el('label', { class: 'field' }, 'Notes:', text('notes', 500))),
  );
}

// ---------------------------------------------------------------------------
// Composite view
// ---------------------------------------------------------------------------

function compositePanel(site, s) {
  const stat = (v, l, cls = '') => el('div', { class: 'stat' }, el('div', { class: `v ${cls}` }, v), el('div', { class: 'l' }, l));
  const missing = (what, tab) => el('div', { class: 'warn' }, `⚠ ${what} missing — complete tab ${tab}.`);

  const blocks = [];

  if (s.basis?.estimate) {
    blocks.push(el('p', { class: 'warn' },
      `⚠ Data basis: ${s.basis.label}. All figures below are ESTIMATES — confirm with the customer’s interval data before contracting.`));
  }

  blocks.push(el('div', { class: 'stats', style: 'margin-bottom:10px' },
    stat(fmt.kw(s.a.overall.peakKw), 'Peak demand'),
    stat(fmt.kw(s.a.overall.avgKw), 'Average demand'),
    stat(fmt.pct(s.a.overall.loadFactor), 'Load factor'),
    s.config ? stat(s.config.label, 'Recommended config') : null,
    s.config ? stat(fmt.pct(s.config.captureRate), 'Capture rate') : null,
  ));

  if (!s.config) blocks.push(missing('Config selection', '2'));
  if (!s.dispatch) blocks.push(missing('Dispatch simulation', '3'));
  if (!s.tariff) blocks.push(missing('Tariff selection', '4'));
  if (!s.stack) blocks.push(missing('Revenue stack', '5'));
  if (!s.econ) blocks.push(missing('Deal economics', '6'));

  const row = (k, v) => el('tr', {}, el('td', {}, k), el('td', {}, v));
  const table = el('table', { class: 'data', style: 'max-width:720px' });
  if (s.basis) table.append(row('Data basis', s.basis.label));
  if (s.dispatch) {
    table.append(
      row('Annual cycles', fmt.num(s.dispatch.annual.cycles, 1)),
      row('Missed-peak events', String(s.dispatch.annual.missedEvents)),
      row('Avg realized reduction', fmt.kw(s.dispatch.annual.avgRealizedReductionKw)),
    );
  }
  if (s.tariff) {
    table.append(row('Tariff used', `${s.tariff.utility} ${s.tariff.schedule}${s.tariff.placeholder ? ' (PLACEHOLDER rates)' : ''}`));
  }
  if (s.stack) {
    table.append(
      row('Revenue scenario', s.scenario),
      row('Simulated annual benefit', fmt.usd(s.stack.total)),
      ...s.stack.rows.map((r) => row(`— ${r.name}`, fmt.usd(r.annual))),
    );
  }
  if (s.econ) {
    table.append(
      row('Monthly rental', fmt.usd(s.econ.monthlyRental)),
      row('Customer net / month', fmt.usd(s.econ.customer.netMonthly)),
      row('Customer payback', s.econ.customer.paybackMonths === Infinity ? 'never' : `${fmt.num(s.econ.customer.paybackMonths, 1)} months`),
      row('Sunbelt ROIC', fmt.pct(s.econ.sunbelt.roic)),
      row('Deal window (rental $/mo)', `${fmt.usd(s.econ.rentalForTargetRoic)} – ${fmt.usd(s.econ.maxRentalForTargetPayback)}`),
    );
  }

  return el('div', { class: 'panel' },
    el('h2', {}, 'Site Evaluation Composite'),
    ...blocks,
    table.children.length ? table : null,
  );
}

// ---------------------------------------------------------------------------
// Permitting risk (manual entry)
// ---------------------------------------------------------------------------

function riskPanel(panel, site) {
  const sel = el('select', {},
    ...['Low', 'Medium', 'High'].map((t) => {
      const o = el('option', { value: t }, t);
      if (t === site.summary.permittingRisk) o.selected = true;
      return o;
    }));
  sel.addEventListener('change', () => { site.summary.permittingRisk = sel.value; notify({ summary: true }); });

  const notes = el('textarea', { rows: 3, style: 'width:100%;max-width:700px;font-family:inherit;font-size:12.5px' },
    site.summary.permittingNotes || '');
  notes.addEventListener('change', () => { site.summary.permittingNotes = notes.value; notify({ summary: true }); });

  return el('div', { class: 'panel' },
    el('h2', {}, 'Permitting Risk (manual assessment)'),
    el('label', { class: 'field' }, 'Tier:', sel),
    el('div', { style: 'margin-top:6px' }, notes),
  );
}

// ---------------------------------------------------------------------------
// PDF export
// ---------------------------------------------------------------------------

function exportPanel(site, s) {
  const btn = el('button', { class: 'action', onclick: () => {
    try { exportPdf(site, s); } catch (err) { alert(`PDF export failed: ${err.message}`); }
  } }, 'Export PDF');
  return el('div', { class: 'panel' },
    el('h2', {}, 'Export'),
    btn,
    el('span', { class: 'muted', style: 'margin-left:10px' },
      'One-page executive summary — Sunbelt orange (#FFA400, hex to be confirmed), Roboto.'),
  );
}

function registerRoboto(doc) {
  if (typeof window.ROBOTO_REGULAR_B64 === 'string') {
    doc.addFileToVFS('Roboto-Regular.ttf', window.ROBOTO_REGULAR_B64);
    doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    doc.addFileToVFS('Roboto-Bold.ttf', window.ROBOTO_BOLD_B64);
    doc.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    return 'Roboto';
  }
  return 'helvetica'; // fallback if the embedded font is missing
}

function exportPdf(site, s) {
  const { jsPDF } = jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' }); // 612 × 792
  const font = registerRoboto(doc);
  const W = 612;
  const M = 46;
  let y = 0;

  // Header band
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, W, 64, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont(font, 'bold');
  doc.setFontSize(19);
  doc.text('SUNBELT RENTALS — BESS Site Evaluation', M, 40);
  doc.setTextColor(...INK);
  y = 92;

  const h2 = (t) => {
    doc.setFont(font, 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(...INK);
    doc.text(t, M, y);
    doc.setDrawColor(...ORANGE);
    doc.setLineWidth(1.4);
    doc.line(M, y + 4, W - M, y + 4);
    y += 18;
  };
  const kv = (k, v, indent = 0) => {
    doc.setFont(font, 'bold');
    doc.setFontSize(9.5);
    doc.text(k, M + indent, y);
    doc.setFont(font, 'normal');
    doc.text(String(v), M + 190, y);
    y += 13.5;
  };

  doc.setFont(font, 'bold');
  doc.setFontSize(14);
  doc.text(site.meta.name || 'Untitled Site', M, y);
  doc.setFont(font, 'normal');
  doc.setFontSize(9);
  doc.text(new Date().toLocaleDateString(), W - M, y, { align: 'right' });
  y += 22;

  h2('Site');
  kv('Customer', site.meta.customer || '—');
  kv('Address', site.meta.address || '—');
  kv('Utility', site.meta.utility || '—');
  kv('Peak / average demand', `${Math.round(s.a.overall.peakKw)} kW / ${Math.round(s.a.overall.avgKw)} kW (LF ${(s.a.overall.loadFactor * 100).toFixed(0)}%)`);
  if (s.basis) kv('Data basis', s.basis.label + (s.basis.estimate ? '  ** ESTIMATE **' : ''));
  y += 8;

  h2('Recommended Configuration');
  if (s.config) {
    kv('Configuration', s.config.label);
    kv('Rating', `${Math.round(s.config.kw)} kW / ${Math.round(s.config.kwh)} kWh`);
    kv('Capture rate', `${(s.config.captureRate * 100).toFixed(1)}% of target shave across worst days`);
    if (s.dispatch) {
      kv('Simulated annual cycles', s.dispatch.annual.cycles.toFixed(1));
      kv('Missed-peak events', s.dispatch.annual.missedEvents);
    }
  } else { kv('Configuration', 'not selected'); }
  y += 8;

  h2('Economics');
  if (s.tariff) kv('Tariff', `${s.tariff.utility} ${s.tariff.schedule}${s.tariff.placeholder ? '  ** PLACEHOLDER RATES **' : ''}`);
  if (s.stack) {
    kv('Revenue scenario', s.scenario);
    kv('Simulated annual benefit', fmt.usd(s.stack.total));
    for (const r of s.stack.rows) kv(`•  ${r.name}`, fmt.usd(r.annual), 8);
  }
  if (s.econ) {
    kv('Monthly rental', fmt.usd(s.econ.monthlyRental));
    kv('Customer payback', s.econ.customer.paybackMonths === Infinity ? 'never at this rental' : `${s.econ.customer.paybackMonths.toFixed(1)} months`);
    kv('Sunbelt ROIC', `${(s.econ.sunbelt.roic * 100).toFixed(1)}%`);
    kv('Deal window ($/mo)', `${fmt.usd(s.econ.rentalForTargetRoic)} – ${fmt.usd(s.econ.maxRentalForTargetPayback)}`);
  }
  y += 8;

  h2('Permitting Risk (manual assessment)');
  kv('Tier', site.summary.permittingRisk);
  if (site.summary.permittingNotes) {
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(site.summary.permittingNotes, W - 2 * M);
    doc.text(lines, M, y);
    y += lines.length * 11 + 4;
  }

  // Footer
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Internal tool — outputs depend on placeholder tariff/program rates unless marked verified. Not a customer quote.', M, 760);

  const name = (site.meta.name || 'site').replace(/[^\w.-]+/g, '_');
  doc.save(`${name}-evaluation.pdf`);
}
