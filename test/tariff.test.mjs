import test from 'node:test';
import assert from 'node:assert/strict';
import {
  seedTariffLibrary, isSummer, energyRate, onPeakDemand, applyRatchet, computeTariffSavings,
} from '../src/modules/tariffs/calc.js';

function flatTariff(overrides = {}) {
  return {
    id: 't', utility: 'U', schedule: 'S', placeholder: true,
    summerMonths: [6, 7, 8, 9],
    demand: { facilitiesKwMo: 10, onPeakSummerKwMo: 20, onPeakWinterKwMo: 5 },
    windows: [{ name: 'on', startHour: 16, endHour: 21, summerRate: 0.30, winterRate: 0.25 }],
    offPeak: { summerRate: 0.10, winterRate: 0.10 },
    ratchet: { enabled: false, pct: 0.5 },
    ...overrides,
  };
}

/** Minimal dispatch-monthly record. */
function monthRec(key, { rawPeak, shavedPeak, disHour = {}, chgHour = {}, rawHourPeaks = {}, shavedHourPeaks = {} }) {
  const arr = (obj) => Array.from({ length: 24 }, (_, h) => obj[h] || 0);
  return {
    key,
    rawPeakKw: rawPeak,
    shavedPeakKw: shavedPeak,
    dischargeByHour: arr(disHour),
    chargeByHour: arr(chgHour),
    rawPeakByHour: arr({ ...rawHourPeaks }),
    shavedPeakByHour: arr({ ...shavedHourPeaks }),
  };
}

test('seed library: three utilities, all placeholder-flagged', () => {
  const lib = seedTariffLibrary();
  assert.deepEqual(lib.map((t) => t.utility), ['SDG&E', 'SCE', 'PSEG Long Island']);
  for (const t of lib) {
    assert.equal(t.placeholder, true, `${t.utility} must be marked placeholder`);
    assert.ok(t.windows.length >= 1);
  }
});

test('season and window rate lookup', () => {
  const t = flatTariff();
  assert.equal(isSummer(t, '2025-07'), true);
  assert.equal(isSummer(t, '2025-12'), false);
  assert.equal(energyRate(t, '2025-07', 17), 0.30); // summer on-peak
  assert.equal(energyRate(t, '2025-12', 17), 0.25); // winter on-peak
  assert.equal(energyRate(t, '2025-07', 10), 0.10); // off-peak
  // overnight-wrapping window
  const t2 = flatTariff({ windows: [{ name: 'n', startHour: 22, endHour: 6, summerRate: 0.4, winterRate: 0.4 }] });
  assert.equal(energyRate(t2, '2025-07', 23), 0.4);
  assert.equal(energyRate(t2, '2025-07', 3), 0.4);
  assert.equal(energyRate(t2, '2025-07', 12), 0.10);
});

test('onPeakDemand picks max within the first window only', () => {
  const t = flatTariff();
  const peaks = new Array(24).fill(100);
  peaks[17] = 350; // in window
  peaks[10] = 500; // out of window
  assert.equal(onPeakDemand(t, peaks), 350);
});

test('ratchet floor: hand-computed', () => {
  const r = { enabled: true, pct: 0.5 };
  // peaks: 1000, then 300 -> billed max(300, 500) = 500
  assert.deepEqual(applyRatchet([1000, 300], r), [1000, 500]);
  // disabled passes through
  assert.deepEqual(applyRatchet([1000, 300], { enabled: false, pct: 0.5 }), [1000, 300]);
  // lookback caps at 11 months
  const peaks = [1000, ...new Array(12).fill(100)];
  const billed = applyRatchet(peaks, r);
  assert.equal(billed[11], 500, 'month 11 still sees the 1000 peak');
  assert.equal(billed[12], 100, 'month 12 is outside the 11-month lookback');
});

test('demand savings: hand-computed month', () => {
  const t = flatTariff();
  // July (summer): raw peak 500 -> shaved 400. On-peak raw 480 -> shaved 400.
  const m = monthRec('2025-07', {
    rawPeak: 500, shavedPeak: 400,
    rawHourPeaks: { 17: 480, 10: 500 },
    shavedHourPeaks: { 17: 400, 10: 400 },
  });
  const s = computeTariffSavings(t, [m]);
  const out = s.monthly[0];
  // facilities: (500-400) × $10 = $1000
  assert.equal(out.facilitiesSavings, 1000);
  // on-peak: (480-400) × $20 = $1600
  assert.equal(out.onPeakSavings, 1600);
  assert.equal(out.demandSavings, 2600);
  assert.equal(s.annual.demandSavings, 2600);
});

test('TOU arbitrage: hand-computed, including negative case', () => {
  const t = flatTariff();
  // Summer: discharge 100 kWh at hour 17 (on-peak 0.30), charge 113.6 kWh at hour 3 (off 0.10)
  const m = monthRec('2025-07', {
    rawPeak: 100, shavedPeak: 100,
    disHour: { 17: 100 }, chgHour: { 3: 113.6 },
  });
  const s = computeTariffSavings(t, [m]);
  const expected = 100 * 0.30 - 113.6 * 0.10;
  assert.ok(Math.abs(s.monthly[0].energySavings - expected) < 1e-9);

  // Flat rates -> arbitrage strictly negative (you pay for losses)
  const flat = flatTariff({
    windows: [{ name: 'on', startHour: 16, endHour: 21, summerRate: 0.10, winterRate: 0.10 }],
  });
  const s2 = computeTariffSavings(flat, [m]);
  assert.ok(s2.monthly[0].energySavings < 0, 'flat-rate arbitrage must be negative (RTE losses)');
});

test('ratchet limits savings when enabled', () => {
  const r = flatTariff({ ratchet: { enabled: true, pct: 0.5 } });
  // Month 1 peak 1000 shaved to 900; month 2 raw 300 shaved to 200.
  // Without ratchet month 2 saves 100×$10. With 50% ratchet both raw (500)
  // and shaved (450) get floored: savings = 50×$10 instead.
  const months = [
    monthRec('2025-01', { rawPeak: 1000, shavedPeak: 900 }),
    monthRec('2025-02', { rawPeak: 300, shavedPeak: 200 }),
  ];
  const s = computeTariffSavings(r, months);
  assert.equal(s.monthly[1].rawBilledKw, 500);
  assert.equal(s.monthly[1].shavedBilledKw, 450);
  assert.equal(s.monthly[1].facilitiesSavings, 500);
  const noRatchet = computeTariffSavings(flatTariff(), months);
  assert.equal(noRatchet.monthly[1].facilitiesSavings, 1000);
  assert.ok(s.annual.demandSavings < noRatchet.annual.demandSavings);
});
