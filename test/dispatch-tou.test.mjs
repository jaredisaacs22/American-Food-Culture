import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';
import { theoreticalRequirement } from '../src/modules/sizing/calc.js';
import { simulateDispatch, defaultDispatchParams } from '../src/modules/dispatch/calc.js';
import { computeTariffSavings, monthEnergyRates } from '../src/modules/tariffs/calc.js';

const STEP_HOURS = 0.25;

// A TOU tariff with a clear spread: on-peak 16–21 @ $0.40, off-peak @ $0.10.
function touTariff() {
  return {
    id: 't', utility: 'U', schedule: 'TOU', placeholder: true,
    summerMonths: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], // summer year-round for a clean test
    demand: { facilitiesKwMo: 10, onPeakSummerKwMo: 15, onPeakWinterKwMo: 15 },
    windows: [{ name: 'On-peak', startHour: 16, endHour: 21, summerRate: 0.40, winterRate: 0.40 }],
    offPeak: { summerRate: 0.10, winterRate: 0.10 },
    ratchet: { enabled: false, pct: 0.5 },
  };
}

// Load with a morning peak (sets demand) and a below-target load during on-peak.
function profile() {
  const kw = [];
  const start = new Date(2023, 0, 1);
  for (let i = 0; i < 35040; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000);
    const h = d.getHours();
    let v = 100;
    if (h >= 9 && h < 12) v = 320;      // morning peak (off-peak price)
    else if (h >= 16 && h < 21) v = 90; // on-peak window, low load
    else v = 130;
    kw.push(v);
  }
  return { normalized: { startMs: start.getTime(), stepMin: 15, kw }, };
}

function bigConfig(req) {
  return { kw: Math.ceil(req.shaveKw) + 5, kwh: Math.ceil(req.kwhNeed) + 500, maxChargeKw: 1000, simultaneousChargeDischarge: true };
}

test('monthEnergyRates finds the cheap and pricey tiers', () => {
  const info = monthEnergyRates(touTariff(), '2023-07');
  assert.equal(info.minRate, 0.10);
  assert.equal(info.maxRate, 0.40);
  assert.equal(info.rateByHour[17], 0.40); // on-peak
  assert.equal(info.rateByHour[3], 0.10);  // off-peak
});

test('TOU-aware charging never buys energy during on-peak hours', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const tariff = touTariff();
  const sim = simulateDispatch(normalized, a, bigConfig(req), req.shaveKw, { ...defaultDispatchParams(), tariff });
  for (const m of sim.monthly) {
    for (let h = 16; h < 21; h++) {
      assert.equal(m.chargeByHour[h], 0, `charged during on-peak hour ${h} in ${m.key}`);
    }
  }
});

test('arbitrage converts a negative energy result into a positive one', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const tariff = touTariff();
  const config = bigConfig(req);

  const off = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: false });
  const on = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: true });
  assert.equal(off.annual.arbitrageKwh, 0);
  assert.ok(on.annual.arbitrageKwh > 0, 'arbitrage should move energy');

  const eOff = computeTariffSavings(tariff, off.monthly).annual.energySavings;
  const eOn = computeTariffSavings(tariff, on.monthly).annual.energySavings;
  assert.ok(eOn > eOff, `arbitrage should increase energy savings: ${eOn} vs ${eOff}`);
  assert.ok(eOn > 0, `energy savings should be positive with arbitrage: ${eOn}`);
});

test('arbitrage never sacrifices peak shaving', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const tariff = touTariff();
  const config = bigConfig(req);
  const withArb = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: true });
  const noArb = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: false });
  // The morning demand peak must be shaved at least as well with arbitrage on.
  for (let i = 0; i < withArb.monthly.length; i++) {
    assert.ok(withArb.monthly[i].shavedPeakKw <= noArb.monthly[i].shavedPeakKw + 1e-6,
      `${withArb.monthly[i].key}: arbitrage raised the shaved peak`);
  }
});

test('energy conservation holds with arbitrage on', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const tariff = touTariff();
  const params = { ...defaultDispatchParams(), tariff, arbitrage: true };
  const sim = simulateDispatch(normalized, a, bigConfig(req), req.shaveKw, params);
  const stored = sim.annual.chargeKwhGrid * params.roundTripEfficiency;
  const config = bigConfig(req);
  assert.ok(Math.abs(config.kwh + stored - sim.annual.dischargeKwh - sim.annual.finalSocKwh) < 1e-4);
  // discharge-by-hour totals reconcile with the annual discharge
  let dis = 0;
  for (const m of sim.monthly) for (let h = 0; h < 24; h++) dis += m.dischargeByHour[h];
  assert.ok(Math.abs(dis - sim.annual.dischargeKwh) < 1e-4);
});

test('flat tariff (no spread) does no arbitrage', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const flat = touTariff();
  flat.windows = [{ name: 'x', startHour: 16, endHour: 21, summerRate: 0.10, winterRate: 0.10 }]; // == off-peak
  const sim = simulateDispatch(normalized, a, bigConfig(req), req.shaveKw, { ...defaultDispatchParams(), tariff: flat, arbitrage: true });
  assert.equal(sim.annual.arbitrageKwh, 0, 'no spread -> no arbitrage');
});

test('no tariff -> price-blind behavior unchanged (arbitrageKwh 0)', () => {
  const { normalized } = profile();
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 60);
  const sim = simulateDispatch(normalized, a, bigConfig(req), req.shaveKw, defaultDispatchParams());
  assert.equal(sim.annual.arbitrageKwh, 0);
});
