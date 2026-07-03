import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerSide, maxRentalForPayback, sunbeltSide, rentalForRoic,
} from '../src/modules/economics/calc.js';

test('customer side: hand-computed', () => {
  // $120k/yr benefit, $8k/mo rental, $12k one-time
  const c = customerSide({ annualBenefit: 120000, monthlyRental: 8000, oneTimeCost: 12000 });
  assert.equal(c.monthlySavings, 10000);
  assert.equal(c.netMonthly, 2000);
  assert.equal(c.paybackMonths, 6);
});

test('customer side: negative deal never pays back', () => {
  const c = customerSide({ annualBenefit: 60000, monthlyRental: 8000, oneTimeCost: 12000 });
  assert.ok(c.netMonthly < 0);
  assert.equal(c.paybackMonths, Infinity);
});

test('rental <-> payback inverse round-trip', () => {
  const annualBenefit = 120000;
  const oneTimeCost = 12000;
  const rental = maxRentalForPayback({ annualBenefit, oneTimeCost, targetPaybackMonths: 6 });
  // plugging the solved rental back in must hit exactly the target payback
  const c = customerSide({ annualBenefit, monthlyRental: rental, oneTimeCost });
  assert.ok(Math.abs(c.paybackMonths - 6) < 1e-9, `round-trip payback ${c.paybackMonths}`);
});

test('sunbelt side: hand-computed ROIC', () => {
  // $10k/mo at 75% utilization = $90k revenue; capex $400k, opex 5% = $20k
  const s = sunbeltSide({ monthlyRental: 10000, utilizationPct: 0.75, capex: 400000, opexPctPerYr: 0.05 });
  assert.equal(s.annualRevenue, 90000);
  assert.equal(s.annualOpex, 20000);
  assert.ok(Math.abs(s.roic - 70000 / 400000) < 1e-12);
});

test('rental <-> ROIC inverse round-trip', () => {
  const args = { capex: 400000, utilizationPct: 0.75, opexPctPerYr: 0.05 };
  const rental = rentalForRoic({ targetRoic: 0.25, ...args });
  const s = sunbeltSide({ monthlyRental: rental, ...args });
  assert.ok(Math.abs(s.roic - 0.25) < 1e-12, `round-trip ROIC ${s.roic}`);
});

test('degenerate inputs stay finite', () => {
  const s = sunbeltSide({ monthlyRental: 10000, utilizationPct: 0.75, capex: 0, opexPctPerYr: 0.05 });
  assert.equal(s.roic, 0);
});
