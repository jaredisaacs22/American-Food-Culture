// Deal economics math. Pure functions (Node-testable).
//
// Customer side: rental has no customer capex, so "payback" is measured on
// the one-time cost (delivery / install / interconnection) recovered by the
// net monthly benefit (savings − rental).
// Sunbelt side: simple ROIC = (annual rental revenue × utilization − opex) /
// fleet capex for the config. Capex defaults to a PLACEHOLDER $/kWh figure.

export function defaultEconInputs() {
  return {
    monthlyRental: 10000,
    oneTimeCost: 15000,       // delivery + install + interconnection (customer-paid)
    targetPaybackMonths: 12,
    capexPerKwh: 400,         // PLACEHOLDER fleet capex assumption, $/kWh
    capexTotal: null,         // null = derive from capexPerKwh × config kWh
    utilizationPct: 0.75,     // fraction of the year the unit is on rent
    opexPctPerYr: 0.05,       // annual O&M as a fraction of capex
    targetRoic: 0.25,
  };
}

/** Customer view for a given rental rate. */
export function customerSide({ annualBenefit, monthlyRental, oneTimeCost }) {
  const monthlySavings = annualBenefit / 12;
  const netMonthly = monthlySavings - monthlyRental;
  return {
    monthlySavings,
    netMonthly,
    annualNet: netMonthly * 12,
    paybackMonths: netMonthly > 0 ? oneTimeCost / netMonthly : Infinity,
  };
}

/** Inverse: max rental rate that still hits a target payback on one-time cost. */
export function maxRentalForPayback({ annualBenefit, oneTimeCost, targetPaybackMonths }) {
  return annualBenefit / 12 - oneTimeCost / targetPaybackMonths;
}

/** Sunbelt view for a given rental rate. */
export function sunbeltSide({ monthlyRental, utilizationPct, capex, opexPctPerYr }) {
  const annualRevenue = monthlyRental * 12 * utilizationPct;
  const annualOpex = capex * opexPctPerYr;
  return {
    annualRevenue,
    annualOpex,
    annualNet: annualRevenue - annualOpex,
    roic: capex > 0 ? (annualRevenue - annualOpex) / capex : 0,
  };
}

/** Inverse: rental rate required to hit a target ROIC. */
export function rentalForRoic({ targetRoic, capex, utilizationPct, opexPctPerYr }) {
  return (capex * (targetRoic + opexPctPerYr)) / (12 * utilizationPct);
}
