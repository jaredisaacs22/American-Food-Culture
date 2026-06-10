// Shared data model: one "active site" object that flows through every module.
// Modules read/write slices of it and call notify() so other modules can react.

import { defaultUnitSpecs } from './units.js';

export const WORKSPACE_VERSION = 1;

export function createEmptySite() {
  return {
    meta: {
      name: 'Untitled Site',
      customer: '',
      address: '',
      utility: '',
      notes: '',
      createdAt: new Date().toISOString(),
    },
    // Module 1 — Interval Data Workbench
    intervals: {
      // Normalized series: 15-minute kW. times are epoch ms (local-naive parsing).
      // { startMs, stepMin: 15, kw: number[], times: number[] }
      normalized: null,
      source: null, // { fileName, format, detectedIntervalMin, detectedUnit, rowsParsed, gapsFilled, duplicatesMerged, notes[] }
      analysis: null, // computed summary (monthly peaks, worst days, load factor, ...)
    },
    // Module 2 — Sizing
    sizing: {
      targetShavePct: 100, // % of (peak - average) to shave
      manualOverride: null, // { kw, kwh } or null
      selectedConfig: null, // chosen candidate config
    },
    // Module 3 — Dispatch
    dispatch: {
      params: {
        roundTripEfficiency: 0.88,
        chargeWindows: [], // [{startHour, endHour}] — empty = charge any time load headroom allows
      },
      results: null,
    },
    // Module 4 — Tariff
    tariff: { selectedId: null },
    // Module 5 — Revenue stack
    revenue: { scenarios: null },
    // Module 6 — Deal economics
    economics: { inputs: null, results: null },
    // Module 7 — Summary
    summary: { permittingRisk: 'Medium', permittingNotes: '' },
  };
}

const state = {
  site: createEmptySite(),
  unitSpecs: defaultUnitSpecs(),
  tariffLibrary: [], // seeded by tariff module
};

const listeners = new Set();

export function getSite() { return state.site; }
export function getUnitSpecs() { return state.unitSpecs; }
export function getTariffLibrary() { return state.tariffLibrary; }
export function setTariffLibrary(lib) { state.tariffLibrary = lib; }

/** Notify all modules that some slice of the site changed. */
export function notify(change = {}) {
  for (const fn of listeners) fn(change);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------- Workspace save/load (portable JSON, replaces localStorage) ----------

export function exportWorkspace() {
  return JSON.stringify({
    version: WORKSPACE_VERSION,
    savedAt: new Date().toISOString(),
    site: state.site,
    unitSpecs: state.unitSpecs,
    tariffLibrary: state.tariffLibrary,
  });
}

export function importWorkspace(json) {
  const data = JSON.parse(json);
  if (!data || typeof data !== 'object' || !data.site) {
    throw new Error('Not a BESS workbench workspace file');
  }
  if (data.version > WORKSPACE_VERSION) {
    throw new Error(`Workspace version ${data.version} is newer than this build supports (${WORKSPACE_VERSION})`);
  }
  // Merge onto a fresh site so fields added in later builds get defaults.
  state.site = Object.assign(createEmptySite(), data.site);
  if (Array.isArray(data.unitSpecs) && data.unitSpecs.length) state.unitSpecs = data.unitSpecs;
  if (Array.isArray(data.tariffLibrary)) state.tariffLibrary = data.tariffLibrary;
  notify({ workspaceLoaded: true });
}

export function resetSite() {
  state.site = createEmptySite();
  notify({ workspaceLoaded: true });
}
