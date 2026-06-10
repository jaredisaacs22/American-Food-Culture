// Revenue stack math. Pure functions (Node-testable).
//
// Streams layered on top of demand-charge savings:
// - TOU arbitrage (from the tariff engine, derated per scenario)
// - Demand response program payments ($/kW-yr × committed kW)  [PLACEHOLDER rates]
// - Capacity / incentive programs ($/kWh-yr × committed kWh)   [PLACEHOLDER rates]
//
// Conflict logic: the same kW/kWh cannot be committed to conflicting programs
// simultaneously. Peak shaving reserves capacity first (it's the anchor use
// case); DR can only commit what's left of the power rating, and capacity
// programs what's left of the energy rating. Over-commitments are capped and
// reported, never silently honored.

export function defaultScenarios() {
  const mk = (demandFactor, arbitrageFactor, dr, capacity) => ({
    demandFactor,      // derate on tariff-computed demand savings
    arbitrageFactor,   // derate on tariff-computed TOU arbitrage
    dr,                // { enabled, ratePerKwYr, committedKw }   PLACEHOLDER rate
    capacity,          // { enabled, ratePerKwhYr, committedKwh } PLACEHOLDER rate
  });
  return {
    selected: 'base',
    conservative: mk(0.85, 0.5,
      { enabled: false, ratePerKwYr: 40, committedKw: 0 },
      { enabled: false, ratePerKwhYr: 5, committedKwh: 0 }),
    base: mk(1.0, 0.9,
      { enabled: true, ratePerKwYr: 60, committedKw: 0 },
      { enabled: false, ratePerKwhYr: 5, committedKwh: 0 }),
    aggressive: mk(1.0, 1.0,
      { enabled: true, ratePerKwYr: 90, committedKw: 0 },
      { enabled: true, ratePerKwhYr: 10, committedKwh: 0 }),
  };
}

/**
 * ctx: {
 *   demandSavingsAnnual, arbitrageAnnual,  // $ from tariff engine
 *   configKw, configKwh,                   // selected config rating
 *   reservedKw, reservedKwh,               // capacity the shave use-case consumes
 * }
 */
export function computeStack(scenario, ctx) {
  const conflicts = [];
  const rows = [];

  rows.push({
    id: 'demand',
    name: `Demand-charge savings × ${scenario.demandFactor}`,
    annual: ctx.demandSavingsAnnual * scenario.demandFactor,
  });

  rows.push({
    id: 'arbitrage',
    name: `TOU arbitrage × ${scenario.arbitrageFactor}`,
    annual: ctx.arbitrageAnnual * scenario.arbitrageFactor,
  });

  const availKw = Math.max(0, ctx.configKw - ctx.reservedKw);
  if (scenario.dr.enabled) {
    const wanted = scenario.dr.committedKw;
    const allowed = Math.min(wanted, availKw);
    if (wanted > availKw) {
      conflicts.push(
        `DR commitment ${Math.round(wanted)} kW exceeds the ${Math.round(availKw)} kW left after peak shaving reserves ${Math.round(ctx.reservedKw)} kW — capped.`);
    }
    rows.push({
      id: 'dr',
      name: `Demand response — ${Math.round(allowed)} kW @ $${scenario.dr.ratePerKwYr}/kW-yr`,
      committedKw: allowed,
      annual: allowed * scenario.dr.ratePerKwYr,
    });
  }

  const availKwh = Math.max(0, ctx.configKwh - ctx.reservedKwh);
  if (scenario.capacity.enabled) {
    const wanted = scenario.capacity.committedKwh;
    const allowed = Math.min(wanted, availKwh);
    if (wanted > availKwh) {
      conflicts.push(
        `Capacity commitment ${Math.round(wanted)} kWh exceeds the ${Math.round(availKwh)} kWh left after peak shaving reserves ${Math.round(ctx.reservedKwh)} kWh — capped.`);
    }
    rows.push({
      id: 'capacity',
      name: `Capacity / incentive — ${Math.round(allowed)} kWh @ $${scenario.capacity.ratePerKwhYr}/kWh-yr`,
      committedKwh: allowed,
      annual: allowed * scenario.capacity.ratePerKwhYr,
    });
  }

  return {
    rows,
    conflicts,
    total: rows.reduce((s, r) => s + r.annual, 0),
  };
}
