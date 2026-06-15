// Reference building-profile loader. Decodes a bundled ComStock per-unit shape
// and scales it to a site's peak kW or annual kWh, producing the SAME
// normalized 15-min kW series shape the file parser yields — so everything
// downstream (sizing, dispatch, tariff savings) works identically.

import library from '../../data/building-profiles.json' with { type: 'json' };

const STEP_MIN = 15;
const STEP_HOURS = 0.25;

export function profileLibrary() {
  return library;
}

/** base64 LE uint16 -> Float64Array of fractions (0..1 of annual peak). */
function decodeFractions(b64) {
  const bin = atob(b64);
  const n = bin.length / 2;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const lo = bin.charCodeAt(i * 2);
    const hi = bin.charCodeAt(i * 2 + 1);
    out[i] = ((hi << 8) | lo) / 65535;
  }
  return out;
}

/**
 * Build a normalized site series from a reference profile.
 * scaleBy: { mode: 'peakKw'|'annualKwh', value: number }
 */
export function loadReferenceProfile(stateId, typeId, scaleBy, year = library.meta.weatherYear) {
  const key = `${stateId}:${typeId}`;
  const entry = library.profiles[key];
  if (!entry) throw new Error(`No bundled profile for ${key}`);

  const frac = decodeFractions(entry.data);
  let peakKw;
  if (scaleBy.mode === 'annualKwh') {
    // annual kWh = peakKw × Σfrac × stepHours  ->  peakKw = kWh / (Σfrac × h)
    if (!(scaleBy.value > 0)) throw new Error('Annual kWh must be positive');
    peakKw = scaleBy.value / (entry.sumFraction * STEP_HOURS);
  } else {
    if (!(scaleBy.value > 0)) throw new Error('Peak kW must be positive');
    peakKw = scaleBy.value;
  }

  const kw = new Array(frac.length);
  for (let i = 0; i < frac.length; i++) kw[i] = Math.round(frac[i] * peakKw * 1000) / 1000;

  const startMs = new Date(year, 0, 1, 0, 0, 0).getTime();
  const typeLabel = library.buildingTypes.find((t) => t.id === typeId)?.label || typeId;
  const annualKwh = Math.round(peakKw * entry.sumFraction * STEP_HOURS);

  return {
    normalized: {
      startMs,
      stepMin: STEP_MIN,
      kw,
      gapsFilled: 0,
      longestGapIntervals: 0,
      duplicatesMerged: 0,
    },
    source: {
      fileName: `${typeLabel} — ${stateId} (NREL ComStock reference)`,
      format: 'reference building profile (NREL ComStock, normalized shape)',
      detectedIntervalMin: STEP_MIN,
      detectedUnit: 'kW',
      appliedIntervalMin: STEP_MIN,
      appliedUnit: 'kW',
      rowsParsed: kw.length,
      gapsFilled: 0,
      longestGapIntervals: 0,
      duplicatesMerged: 0,
      reference: {
        stateId, typeId, typeLabel, year,
        scaledBy: scaleBy.mode, scaleValue: scaleBy.value,
        impliedPeakKw: Math.round(peakKw), impliedAnnualKwh: annualKwh,
        loadFactor: entry.loadFactor,
      },
      notes: [
        `Synthetic load shape from ${library.meta.source} (${library.meta.release}, retrieved ${library.meta.retrievedAt}), ` +
        `weather year ${year}, scaled to ${scaleBy.mode === 'annualKwh' ? `${scaleBy.value.toLocaleString()} kWh/yr` : `${Math.round(peakKw).toLocaleString()} kW peak`}. ` +
        'Representative shape only — replace with the customer’s actual interval data before quoting.',
      ],
    },
  };
}
