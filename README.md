# BESS Site Analysis Workbench

Internal tool for evaluating customer sites for behind-the-meter battery storage (BESS)
rentals: interval-data analysis, fleet-based sizing, dispatch simulation, tariff-aware
savings, revenue stacking, and deal economics. See `SPEC.md` for the full product spec.

**Not customer-facing. All seeded tariff numbers are placeholders, not verified rates.**

## Using it

Open `dist/bess-workbench.html` in a browser. No server, install, or internet
required — Chart.js, SheetJS, and jsPDF are vendored into the file (~1.3 MB).

Analyses are saved/loaded as portable `*.bess.json` workspace files via the buttons in
the header bar — there is no localStorage persistence by design.

## Developing

```
npm install        # esbuild + playwright (dev only)
npm run build      # -> dist/bess-workbench.html (single self-contained file)
npm test           # parser/analysis unit tests (node --test)
npm run sample     # regenerate sample interval CSVs in sample-data/
node test/smoke.browser.mjs   # headless-browser end-to-end check (needs `npx playwright install chromium`)
```

Source layout:

```
src/main.js              entry point, registers modules
src/model/store.js       shared "active site" data model + workspace save/load
src/model/units.js       fleet unit-spec table (kW/kWh/constraint flags)
src/ui/                  tab shell + DOM helpers
src/modules/<name>/      one folder per module (tab)
build.mjs                bundles everything into dist/bess-workbench.html
```

Modules in build order: intervals → sizing → dispatch → tariffs → revenue →
economics → summary.
