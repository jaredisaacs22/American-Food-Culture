import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultScenarios, computeStack } from '../src/modules/revenue/calc.js';

const ctx = {
  demandSavingsAnnual: 10000,
  arbitrageAnnual: -500, // net negative arbitrage must flow through, not be clamped
  configKw: 500,
  configKwh: 1000,
  reservedKw: 300,
  reservedKwh: 600,
};

test('base scenario: hand-computed stack', () => {
  const sc = defaultScenarios().base; // demandFactor 1.0, arbitrage 0.9, DR on @ $60
  sc.dr.committedKw = 100;
  const r = computeStack(sc, ctx);
  const demand = r.rows.find((x) => x.id === 'demand');
  const arb = r.rows.find((x) => x.id === 'arbitrage');
  const dr = r.rows.find((x) => x.id === 'dr');
  assert.equal(demand.annual, 10000);
  assert.ok(Math.abs(arb.annual - -450) < 1e-9);
  assert.equal(dr.annual, 100 * 60);
  assert.ok(Math.abs(r.total - (10000 - 450 + 6000)) < 1e-9);
  assert.equal(r.conflicts.length, 0);
});

test('conflict: DR commitment above leftover kW is capped and reported', () => {
  const sc = defaultScenarios().base;
  sc.dr.committedKw = 400; // only 500 − 300 = 200 kW left
  const r = computeStack(sc, ctx);
  const dr = r.rows.find((x) => x.id === 'dr');
  assert.equal(dr.committedKw, 200);
  assert.equal(dr.annual, 200 * 60);
  assert.equal(r.conflicts.length, 1);
  assert.match(r.conflicts[0], /exceeds/);
});

test('conflict: capacity kWh capped against leftover energy', () => {
  const sc = defaultScenarios().aggressive; // capacity enabled @ $10/kWh-yr
  sc.capacity.committedKwh = 900; // only 1000 − 600 = 400 left
  sc.dr.committedKw = 0;
  const r = computeStack(sc, ctx);
  const cap = r.rows.find((x) => x.id === 'capacity');
  assert.equal(cap.committedKwh, 400);
  assert.equal(cap.annual, 4000);
  assert.ok(r.conflicts.some((c) => /kWh/.test(c)));
});

test('disabled streams contribute nothing', () => {
  const sc = defaultScenarios().conservative; // DR + capacity disabled
  const r = computeStack(sc, ctx);
  assert.equal(r.rows.length, 2); // demand + arbitrage only
  assert.ok(Math.abs(r.total - (10000 * 0.85 + -500 * 0.5)) < 1e-9);
});

test('scenario ordering: aggressive >= base >= conservative on same inputs', () => {
  const scs = defaultScenarios();
  // same commitments everywhere so only factors/rates differ
  for (const id of ['conservative', 'base', 'aggressive']) {
    scs[id].dr.committedKw = 100;
    scs[id].capacity.committedKwh = 100;
  }
  const posCtx = { ...ctx, arbitrageAnnual: 2000 };
  const c = computeStack(scs.conservative, posCtx).total;
  const b = computeStack(scs.base, posCtx).total;
  const a = computeStack(scs.aggressive, posCtx).total;
  assert.ok(c <= b && b <= a, `${c} <= ${b} <= ${a}`);
});
