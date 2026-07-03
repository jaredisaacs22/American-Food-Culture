// Tariff schedule model + savings math. Pure functions (Node-testable).
//
// Schedule shape:
// {
//   id, utility, schedule, placeholder: true, notes,
//   summerMonths: [6,7,8,9,10],            // 1-based calendar months
//   demand: {
//     facilitiesKwMo,                       // $/kW-mo on the monthly max (NCD)
//     onPeakSummerKwMo, onPeakWinterKwMo,   // $/kW-mo on the max during the on-peak window
//   },
//   windows: [ { name, startHour, endHour, summerRate, winterRate } ], // first window = on-peak (drives the demand charge); evaluated in order
//   offPeak: { summerRate, winterRate },    // energy $/kWh outside all windows
//   ratchet: { enabled, pct },              // billed kW >= pct × max peak of prior 11 months
// }
//
// Flagged assumptions:
// - Billing period = calendar month (same as the analysis module).
// - The on-peak DEMAND charge applies to the max demand during the FIRST
//   window in `windows`; remaining windows are energy-rate-only (mid-peak etc).
// - Ratchet uses whatever prior months exist in the data (a 12-month upload
//   gives month 1 no lookback). Raw and shaved series are ratcheted
//   independently, which models a steady-state BESS year.
// - TOU arbitrage values discharged kWh at the rate of the hour it displaced
//   and costs charged kWh at the rate of the hour it was drawn.

export function seedTariffLibrary() {
  // ALL NUMBERS PLACEHOLDER — to be corrected with real filed rates.
  return [
    {
      id: 'sdge-al-tou',
      utility: 'SDG&E',
      schedule: 'AL-TOU (secondary)',
      placeholder: true,
      notes: 'PLACEHOLDER values — replace with current filed AL-TOU rates.',
      summerMonths: [6, 7, 8, 9, 10],
      demand: { facilitiesKwMo: 24.0, onPeakSummerKwMo: 19.0, onPeakWinterKwMo: 8.0 },
      windows: [
        { name: 'On-peak (4–9 pm)', startHour: 16, endHour: 21, summerRate: 0.32, winterRate: 0.26 },
      ],
      offPeak: { summerRate: 0.14, winterRate: 0.13 },
      ratchet: { enabled: false, pct: 0.5 },
    },
    {
      id: 'sce-tou-8',
      utility: 'SCE',
      schedule: 'TOU-8 (B, 2–50 kV)',
      placeholder: true,
      notes: 'PLACEHOLDER values — replace with current filed TOU-8 rates.',
      summerMonths: [6, 7, 8, 9],
      demand: { facilitiesKwMo: 22.0, onPeakSummerKwMo: 26.0, onPeakWinterKwMo: 0.0 },
      windows: [
        { name: 'On-peak (4–9 pm)', startHour: 16, endHour: 21, summerRate: 0.30, winterRate: 0.24 },
        { name: 'Mid-peak (9 pm–12 am)', startHour: 21, endHour: 24, summerRate: 0.18, winterRate: 0.15 },
      ],
      offPeak: { summerRate: 0.12, winterRate: 0.11 },
      ratchet: { enabled: false, pct: 0.5 },
    },
    {
      id: 'pseg-li-285',
      utility: 'PSEG Long Island',
      schedule: 'SC-285 (large GS)',
      placeholder: true,
      notes: 'PLACEHOLDER values — replace with current filed 285 rates. Ratchet enabled as typical for this schedule.',
      summerMonths: [6, 7, 8, 9],
      demand: { facilitiesKwMo: 18.0, onPeakSummerKwMo: 12.0, onPeakWinterKwMo: 5.0 },
      windows: [
        { name: 'On-peak (12–8 pm wkdy)', startHour: 12, endHour: 20, summerRate: 0.16, winterRate: 0.13 },
      ],
      offPeak: { summerRate: 0.09, winterRate: 0.08 },
      ratchet: { enabled: true, pct: 0.5 },
    },
  ];
}

export function isSummer(tariff, monthKey) {
  const m = +monthKey.slice(5, 7);
  return tariff.summerMonths.includes(m);
}

/** Energy $/kWh for a given schedule, month, and hour-of-day. */
export function energyRate(tariff, monthKey, hour) {
  const summer = isSummer(tariff, monthKey);
  for (const w of tariff.windows) {
    const inWin = w.startHour <= w.endHour
      ? hour >= w.startHour && hour < w.endHour
      : hour >= w.startHour || hour < w.endHour;
    if (inWin) return summer ? w.summerRate : w.winterRate;
  }
  return summer ? tariff.offPeak.summerRate : tariff.offPeak.winterRate;
}

/** Max of an hourly-peaks array over the FIRST (on-peak) window. */
export function onPeakDemand(tariff, peakByHour) {
  const w = tariff.windows[0];
  if (!w) return 0;
  let max = 0;
  for (let h = 0; h < 24; h++) {
    const inWin = w.startHour <= w.endHour
      ? h >= w.startHour && h < w.endHour
      : h >= w.startHour || h < w.endHour;
    if (inWin && peakByHour[h] > max) max = peakByHour[h];
  }
  return max;
}

/**
 * Per-month hourly energy rates + the cheapest/priciest tiers, so the dispatch
 * can charge off-peak and discharge on-peak (energy arbitrage) instead of
 * being blind to $/kWh.
 */
export function monthEnergyRates(tariff, monthKey) {
  const rateByHour = new Array(24);
  let minRate = Infinity;
  let maxRate = -Infinity;
  for (let h = 0; h < 24; h++) {
    const r = energyRate(tariff, monthKey, h);
    rateByHour[h] = r;
    if (r < minRate) minRate = r;
    if (r > maxRate) maxRate = r;
  }
  return { rateByHour, minRate, maxRate };
}

/** Apply a ratchet floor to a sequence of monthly peaks (in order). */
export function applyRatchet(peaks, ratchet) {
  if (!ratchet?.enabled) return peaks.slice();
  return peaks.map((p, i) => {
    let prior = 0;
    for (let j = Math.max(0, i - 11); j < i; j++) prior = Math.max(prior, peaks[j]);
    return Math.max(p, ratchet.pct * prior);
  });
}

/**
 * Monthly $ savings of the dispatched BESS vs the raw load, on a tariff.
 * dispatchMonthly = site.dispatch.results.monthly (needs the byHour arrays).
 */
export function computeTariffSavings(tariff, dispatchMonthly) {
  const rawBilled = applyRatchet(dispatchMonthly.map((m) => m.rawPeakKw), tariff.ratchet);
  const shavedBilled = applyRatchet(dispatchMonthly.map((m) => m.shavedPeakKw), tariff.ratchet);

  const monthly = dispatchMonthly.map((m, i) => {
    const summer = isSummer(tariff, m.key);
    const onPeakRate = summer ? tariff.demand.onPeakSummerKwMo : tariff.demand.onPeakWinterKwMo;

    const facilitiesSavings = (rawBilled[i] - shavedBilled[i]) * tariff.demand.facilitiesKwMo;
    const rawOnPeakKw = onPeakDemand(tariff, m.rawPeakByHour);
    const shavedOnPeakKw = onPeakDemand(tariff, m.shavedPeakByHour);
    const onPeakSavings = (rawOnPeakKw - shavedOnPeakKw) * onPeakRate;

    let energySavings = 0;
    for (let h = 0; h < 24; h++) {
      const rate = energyRate(tariff, m.key, h);
      energySavings += (m.dischargeByHour[h] || 0) * rate;
      energySavings -= (m.chargeByHour[h] || 0) * rate;
    }

    return {
      key: m.key,
      summer,
      rawBilledKw: rawBilled[i],
      shavedBilledKw: shavedBilled[i],
      // Worst-day-of-month billing: which day's 15-min max set each figure
      rawPeakDate: m.rawPeakDate || null,
      shavedPeakDate: m.shavedPeakDate || null,
      facilitiesSavings,
      rawOnPeakKw,
      shavedOnPeakKw,
      onPeakSavings,
      demandSavings: facilitiesSavings + onPeakSavings,
      energySavings, // TOU arbitrage net of charging cost (can be negative)
      totalSavings: facilitiesSavings + onPeakSavings + energySavings,
    };
  });

  return {
    monthly,
    annual: {
      demandSavings: monthly.reduce((s, m) => s + m.demandSavings, 0),
      energySavings: monthly.reduce((s, m) => s + m.energySavings, 0),
      totalSavings: monthly.reduce((s, m) => s + m.totalSavings, 0),
    },
  };
}
