import test from 'node:test';
import assert from 'node:assert/strict';
import tariffs from '../src/data/usurdb-tariffs.json' with { type: 'json' };
import { computeTariffSavings, energyRate, onPeakDemand } from '../src/modules/tariffs/calc.js';

test('every USURDB tariff matches the tariff-engine schema', () => {
  assert.ok(tariffs.length >= 100, `expected 100+ tariffs, got ${tariffs.length}`);
  const ids = new Set();
  for (const t of tariffs) {
    assert.ok(t.id && !ids.has(t.id), `duplicate/missing id: ${t.id}`);
    ids.add(t.id);
    assert.equal(t.placeholder, true, `${t.id} must stay flagged placeholder`);
    assert.equal(t.source, 'USURDB');
    assert.ok(t.utility && t.schedule);
    assert.ok(Array.isArray(t.summerMonths) && t.summerMonths.every((m) => m >= 1 && m <= 12));
    for (const k of ['facilitiesKwMo', 'onPeakSummerKwMo', 'onPeakWinterKwMo']) {
      assert.ok(Number.isFinite(t.demand[k]) && t.demand[k] >= 0, `${t.id} demand.${k}`);
    }
    assert.ok(Array.isArray(t.windows) && t.windows.length >= 1);
    for (const w of t.windows) {
      assert.ok(w.startHour >= 0 && w.startHour <= 24 && w.endHour >= 0 && w.endHour <= 24, `${t.id} window hours`);
      assert.ok(Number.isFinite(w.summerRate) && Number.isFinite(w.winterRate) && w.summerRate >= 0 && w.winterRate >= 0);
    }
    assert.ok(Number.isFinite(t.offPeak.summerRate) && Number.isFinite(t.offPeak.winterRate));
    assert.ok(typeof t.ratchet.enabled === 'boolean' && t.ratchet.pct >= 0 && t.ratchet.pct <= 1);
    assert.ok(/VERIFY/i.test(t.notes), `${t.id} notes must carry a verify caveat`);
  }
});

test('covers utilities in all five target states', () => {
  const utils = tariffs.map((t) => t.utility.toLowerCase());
  const has = (s) => utils.some((u) => u.includes(s));
  assert.ok(has('san diego') || has('southern california') || has('pacific gas'), 'CA');
  assert.ok(has('long island') || has('consolidated edison'), 'NY');
  assert.ok(has('connecticut light') || has('united illuminating'), 'CT');
  assert.ok(has('massachusetts') || has('nstar'), 'MA');
  assert.ok(has('elec & gas') || has('atlantic city'), 'NJ'); // PSE&G or ACE
});

test('a real USURDB tariff computes finite savings end to end', () => {
  const t = tariffs.find((x) => x.utility.toLowerCase().includes('san diego'));
  assert.ok(t);
  // Minimal dispatch-monthly stub: one summer, one winter month
  const arr = (h, v) => Array.from({ length: 24 }, (_, i) => (i === h ? v : 0));
  const months = ['2025-07', '2025-12'].map((key) => ({
    key,
    rawPeakKw: 500, shavedPeakKw: 400,
    rawPeakByHour: arr(17, 500), shavedPeakByHour: arr(17, 400),
    dischargeByHour: arr(17, 50), chargeByHour: arr(2, 60),
  }));
  const s = computeTariffSavings(t, months);
  assert.ok(Number.isFinite(s.annual.totalSavings));
  assert.ok(s.annual.demandSavings > 0, 'shaving 100 kW on a real demand charge should save money');
  // sanity: rate lookups return finite numbers
  assert.ok(Number.isFinite(energyRate(t, '2025-07', 17)));
  assert.ok(Number.isFinite(onPeakDemand(t, arr(17, 500))));
});
