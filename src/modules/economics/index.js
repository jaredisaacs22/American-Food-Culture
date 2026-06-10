// Module 6 — Deal Economics Model.
// Two-sided: customer (savings vs rental, payback) and Sunbelt (rental,
// utilization, ROIC). Solves both directions on each side.

import { el, clear, fmt } from '../../ui/dom.js';
import { getSite, notify, subscribe } from '../../model/store.js';
import {
  defaultEconInputs, customerSide, maxRentalForPayback, sunbeltSide, rentalForRoic,
} from './calc.js';

export default {
  id: 'economics',
  title: '6. Deal Economics',
  mount(panel) {
    render(panel);
    subscribe((change) => {
      if (change.workspaceLoaded || change.intervals || change.sizing || change.dispatch || change.tariff || change.revenue) render(panel);
    });
  },
};

function annualBenefit(site) {
  const computed = site.revenue.computed;
  const selected = site.revenue.scenarios?.selected || 'base';
  return computed?.[selected]?.total ?? null;
}

function render(panel) {
  clear(panel);
  const site = getSite();
  if (!site.economics.inputs) site.economics.inputs = defaultEconInputs();
  const inputs = site.economics.inputs;
  const benefit = annualBenefit(site);
  const config = site.sizing.selectedConfig;

  if (benefit === null || !config) {
    panel.append(el('p', { class: 'empty-note' },
      'Needs the revenue stack (tab 5) computed first — economics keys off the selected scenario total.'));
    return;
  }

  const capex = inputs.capexTotal ?? inputs.capexPerKwh * config.kwh;
  const scenario = site.revenue.scenarios?.selected || 'base';

  const cust = customerSide({ annualBenefit: benefit, monthlyRental: inputs.monthlyRental, oneTimeCost: inputs.oneTimeCost });
  const maxRental = maxRentalForPayback({ annualBenefit: benefit, oneTimeCost: inputs.oneTimeCost, targetPaybackMonths: inputs.targetPaybackMonths });
  const sun = sunbeltSide({ monthlyRental: inputs.monthlyRental, utilizationPct: inputs.utilizationPct, capex, opexPctPerYr: inputs.opexPctPerYr });
  const reqRental = rentalForRoic({ targetRoic: inputs.targetRoic, capex, utilizationPct: inputs.utilizationPct, opexPctPerYr: inputs.opexPctPerYr });

  // Persist a snapshot for the summary tab
  site.economics.results = {
    scenario, annualBenefit: benefit, capex,
    monthlyRental: inputs.monthlyRental,
    customer: cust, maxRentalForTargetPayback: maxRental,
    sunbelt: sun, rentalForTargetRoic: reqRental,
  };

  const num = (field, step = 1, pct = false) => {
    const inp = el('input', { type: 'number', step, value: pct ? Math.round(inputs[field] * 100) : inputs[field] });
    inp.addEventListener('change', () => {
      inputs[field] = pct ? +inp.value / 100 : +inp.value;
      notify({ economics: true });
      render(panel);
    });
    return inp;
  };
  const stat = (v, l, cls = '') => el('div', { class: 'stat' }, el('div', { class: `v ${cls}` }, v), el('div', { class: 'l' }, l));

  const capexInp = el('input', { type: 'number', step: 1000, value: Math.round(capex) });
  capexInp.addEventListener('change', () => {
    inputs.capexTotal = +capexInp.value;
    notify({ economics: true });
    render(panel);
  });

  panel.append(
    el('div', { class: 'panel' },
      el('h2', {}, `Deal Inputs — ${config.label}, scenario: ${scenario} (${fmt.usd(benefit)}/yr benefit)`),
      el('div', {},
        el('label', { class: 'field' }, 'Monthly rental $:', num('monthlyRental', 250)),
        el('label', { class: 'field' }, 'One-time cost $ (customer):', num('oneTimeCost', 500)),
        el('label', { class: 'field' }, 'Fleet capex $ for config:', capexInp,
          inputs.capexTotal === null ? el('span', { class: 'placeholder-tag' }, `PLACEHOLDER ${fmt.usd(inputs.capexPerKwh)}/kWh`) : null),
        el('label', { class: 'field' }, 'Utilization %:', num('utilizationPct', 5, true)),
        el('label', { class: 'field' }, 'Opex %/yr of capex:', num('opexPctPerYr', 1, true)),
      ),
    ),
    el('div', { class: 'row' },
      el('div', { class: 'panel' },
        el('h2', {}, 'Customer Side'),
        el('div', { class: 'stats', style: 'margin-bottom:10px' },
          stat(fmt.usd(cust.monthlySavings), 'Monthly savings'),
          stat(fmt.usd(inputs.monthlyRental), 'Monthly rental'),
          stat(fmt.usd(cust.netMonthly), 'Net monthly benefit', cust.netMonthly < 0 ? 'warn' : 'ok'),
          stat(cust.paybackMonths === Infinity ? 'never' : `${fmt.num(cust.paybackMonths, 1)} mo`,
            'Payback of one-time cost', cust.paybackMonths === Infinity ? 'warn' : ''),
        ),
        el('h3', {}, 'Solve the other direction'),
        el('div', {},
          el('label', { class: 'field' }, 'Target payback (months):', num('targetPaybackMonths', 1)),
          el('div', { class: 'stat', style: 'margin-top:6px' },
            el('div', { class: `v ${maxRental < 0 ? 'warn' : ''}` }, fmt.usd(maxRental)),
            el('div', { class: 'l' }, 'Max supportable monthly rental')),
        ),
        cust.netMonthly < 0 ? el('p', { class: 'warn' }, '⚠ Rental exceeds savings — the deal costs the customer money every month.') : null,
      ),
      el('div', { class: 'panel' },
        el('h2', {}, 'Sunbelt Side'),
        el('div', { class: 'stats', style: 'margin-bottom:10px' },
          stat(fmt.usd(sun.annualRevenue), `Annual revenue @ ${Math.round(inputs.utilizationPct * 100)}% util`),
          stat(fmt.usd(sun.annualOpex), 'Annual opex'),
          stat(fmt.usd(capex), 'Capex deployed'),
          stat(fmt.pct(sun.roic), 'ROIC', sun.roic < inputs.targetRoic ? 'warn' : 'ok'),
        ),
        el('h3', {}, 'Solve the other direction'),
        el('div', {},
          el('label', { class: 'field' }, 'Target ROIC %:', num('targetRoic', 1, true)),
          el('div', { class: 'stat', style: 'margin-top:6px' },
            el('div', { class: 'v' }, fmt.usd(reqRental)),
            el('div', { class: 'l' }, 'Monthly rental required')),
        ),
        reqRental > maxRental ? el('p', { class: 'warn' },
          `⚠ Rental needed for ${Math.round(inputs.targetRoic * 100)}% ROIC (${fmt.usd(reqRental)}) exceeds what the customer can support at the target payback (${fmt.usd(maxRental)}).`) :
          el('p', { class: 'ok' }, `✓ Deal window: rental between ${fmt.usd(reqRental)} (ROIC floor) and ${fmt.usd(maxRental)} (customer ceiling).`),
      ),
    ),
  );
}
