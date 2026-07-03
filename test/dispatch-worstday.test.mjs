import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeIntervals } from '../src/modules/intervals/analysis.js';
import { theoreticalRequirement } from '../src/modules/sizing/calc.js';
import { simulateDispatch, defaultDispatchParams } from '../src/modules/dispatch/calc.js';
import { computeTariffSavings, seedTariffLibrary } from '../src/modules/tariffs/calc.js';
import { loadReferenceProfile } from '../src/modules/intervals/profiles.js';

// Worst-day-of-month demand-charge logic:
// 1. The billed month peak (raw) is set by the worst day identified in the analysis.
// 2. Dispatch never wastes energy shaving an ordinary day below the level the
//    month's worst day pins the bill at.
// 3. Arbitrage must NEVER increase any month's billed demand — worst-day
//    demand savings outrank the $/kWh spread, even in chronic-deficit months
//    where a kWh spent tonight is still missing weeks later.

test('dispatch monthly raw peak = the analysis worst day, by date and kW', () => {
  const { normalized } = loadReferenceProfile('CA', 'retailstandalone', { mode: 'peakKw', value: 600 });
  const a = analyzeIntervals(normalized);
  const req = theoreticalRequirement(normalized, a, 40);
  const config = { kw: 300, kwh: 1500, maxChargeKw: 300, simultaneousChargeDischarge: true };
  const sim = simulateDispatch(normalized, a, config, req.shaveKw, defaultDispatchParams());
  for (const m of sim.monthly) {
    const am = a.monthly.find((x) => x.key === m.key);
    assert.ok(Math.abs(m.rawPeakKw - am.peakKw) < 1e-6, `${m.key}: raw billed kW must be the month peak`);
    assert.equal(m.rawPeakDate, am.worstDay.dateKey, `${m.key}: raw billed day must be the worst day`);
  }
});

test('no energy is wasted shaving ordinary days below the worst-day billing level', () => {
  // One month: base 100 kW; ordinary days bump to 300 for 2 h; day 15 (worst)
  // bumps to 400. Config 300 kW / 100 kWh -> worst day is energy-limited to a
  // flat 350 (100 kWh over the 2 h bump). Since the bill is pinned at 350,
  // ordinary days (peak 300 < 350) must see NO discharge at all.
  const kw = [];
  for (let day = 1; day <= 30; day++) {
    for (let i = 0; i < 96; i++) {
      const bump = i >= 48 && i < 56; // 12:00–14:00
      kw.push(bump ? (day === 15 ? 400 : 300) : 100);
    }
  }
  const normalized = { startMs: new Date(2023, 0, 1).getTime(), stepMin: 15, kw };
  const a = analyzeIntervals(normalized);
  // shave 150 kW -> month target = max(avg, 400-150=250)
  const config = { kw: 300, kwh: 100, maxChargeKw: 300, simultaneousChargeDischarge: true };
  const sim = simulateDispatch(normalized, a, config, 150, defaultDispatchParams());
  const m = sim.monthly[0];
  assert.ok(Math.abs(m.shavedPeakKw - 350) < 0.5, `bill pinned at worst-day level 350, got ${m.shavedPeakKw}`);
  assert.equal(m.shavedPeakDate, '2023-01-15', 'binding day is the worst day');
  // Total discharge = exactly the worst day's 100 kWh, not 29 ordinary days too
  assert.ok(m.dischargeKwh < 100 + 1, `only the worst day should draw energy, got ${m.dischargeKwh} kWh`);
  // Ordinary-day loads are untouched (shaved == raw on an ordinary day)
  const dayStart = 4 * 96 + 48; // Jan 5, noon
  for (let i = dayStart; i < dayStart + 8; i++) {
    assert.ok(Math.abs(sim.series.shavedKw[i] - kw[i]) < 1e-6, 'ordinary day must not be shaved');
  }
});

test('arbitrage never increases any month billed demand (worst-day priority)', () => {
  const { normalized } = loadReferenceProfile('CA', 'retailstandalone', { mode: 'peakKw', value: 600 });
  const a = analyzeIntervals(normalized);
  const config = { kw: 300, kwh: 1500, maxChargeKw: 300, simultaneousChargeDischarge: true };
  const tariff = seedTariffLibrary()[0]; // SDG&E AL-TOU placeholder
  for (const pct of [40, 100]) {
    const req = theoreticalRequirement(normalized, a, pct);
    const off = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: false });
    const on = simulateDispatch(normalized, a, config, req.shaveKw, { ...defaultDispatchParams(), tariff, arbitrage: true });
    for (let i = 0; i < off.monthly.length; i++) {
      assert.ok(on.monthly[i].shavedPeakKw <= off.monthly[i].shavedPeakKw + 0.01,
        `${pct}%: ${on.monthly[i].key} billed kW rose with arbitrage (${off.monthly[i].shavedPeakKw} -> ${on.monthly[i].shavedPeakKw})`);
    }
    const sOff = computeTariffSavings(tariff, off.monthly);
    const sOn = computeTariffSavings(tariff, on.monthly);
    assert.ok(sOn.annual.demandSavings >= sOff.annual.demandSavings - 1,
      `${pct}%: demand savings fell with arbitrage ($${sOff.annual.demandSavings} -> $${sOn.annual.demandSavings})`);
    assert.ok(sOn.annual.energySavings > sOff.annual.energySavings,
      `${pct}%: arbitrage should add energy value`);
    assert.ok(on.annual.arbitrageKwh > 0, `${pct}%: arbitrage should still run`);
  }
});

test('chronic-deficit month: arbitrage self-suppresses weeks ahead of the worst day', () => {
  // Every day needs ~120 kWh of shave but nights only refill ~66 kWh: a
  // permanent deficit. Any arbitrage spend would still be missing weeks later,
  // so with the spread available the guard must keep arbitrage near zero.
  const kw = [];
  for (let day = 0; day < 60; day++) {
    for (let i = 0; i < 96; i++) {
      const h = i / 4;
      if (h >= 9 && h < 21) kw.push(280);      // long daytime block above target
      else kw.push(190);                        // shallow overnight valley
    }
  }
  const normalized = { startMs: new Date(2023, 0, 1).getTime(), stepMin: 15, kw };
  const a = analyzeIntervals(normalized);
  const tariff = seedTariffLibrary()[0];
  const config = { kw: 100, kwh: 200, maxChargeKw: 25, simultaneousChargeDischarge: true };
  // target ≈ max(avg, 280 − shave): pick shave 40 -> target 240; need = 40×12h = 480 kWh/day
  const off = simulateDispatch(normalized, a, config, 40, { ...defaultDispatchParams(), tariff, arbitrage: false });
  const on = simulateDispatch(normalized, a, config, 40, { ...defaultDispatchParams(), tariff, arbitrage: true });
  for (let i = 0; i < off.monthly.length; i++) {
    assert.ok(on.monthly[i].shavedPeakKw <= off.monthly[i].shavedPeakKw + 0.01,
      `${on.monthly[i].key}: billed kW rose (${off.monthly[i].shavedPeakKw} -> ${on.monthly[i].shavedPeakKw})`);
  }
  assert.ok(on.annual.arbitrageKwh < off.annual.dischargeKwh * 0.02 + 1,
    `arbitrage should be ~fully suppressed in a chronic deficit, got ${on.annual.arbitrageKwh} kWh`);
});
