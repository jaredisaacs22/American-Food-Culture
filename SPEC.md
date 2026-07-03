I’m a Product Line Manager for Power & HVAC at Sunbelt Rentals building an **internal BESS site-analysis workbench** for our behind-the-meter battery storage initiative. This tool is for me and my team (not customer-facing): evaluating customer sites, sizing battery configurations from our rental fleet, simulating dispatch, and modeling deal economics.

## What to build

A modular single-page web application that bundles to **one self-contained HTML file** I can share internally (no server, no install — opens in a browser). Develop it as separate JS modules with a build step that produces the single-file output.

## Architecture requirements

- Vanilla JS or lightweight framework — your call, but the bundled output must be fully self-contained (inline all JS/CSS; CDN-loaded libs like Chart.js and SheetJS are acceptable)
- **Shared data model**: a site’s data flows through every module without re-uploading. One “active site” object holds raw intervals, normalized profile, selected config, tariff, and results
- Tab-based UI, one tab per module
- LocalStorage persistence is NOT required (these run as standalone files); instead support **save/load of a site workspace as JSON** so analyses are portable
- Initialize a git repo and commit at each working milestone
- Scaffold the full project structure (modules, shared model, build script) and get the build pipeline producing a valid empty-shell HTML file BEFORE writing any module logic

## Modules (build in this order)

### 1. Interval Data Workbench (foundation — build first)

- Accept CSV/XLSX uploads of utility interval data (SheetJS for parsing). Must handle: Green Button exports, SCE and SDG&E export formats, and generic timestamp+kW or timestamp+kWh CSVs
- Auto-detect interval length (15/30/60-min) and kW vs kWh columns; normalize everything to 15-minute kW
- Flag and gap-fill missing intervals (linear interpolation, with a count of filled gaps shown to the user)
- Outputs: load duration curve, monthly peak table, load factor, average vs peak demand, seasonal heat map (month × hour), and **worst-day identification per billing period** (the day containing each month’s peak demand — this drives sizing, following a worst-day on-peak billing methodology)
- All charts via Chart.js

### 2. BESS Sizing Engine

- Baseline sizing logic: **peak minus average demand** for the shave target, with a user-adjustable target shave % slider
- Map theoretical kW/kWh requirements to our fleet reference units: **60 kW / 300 kWh** and **500 kW / 1 MWh**. Generate candidate configurations (n × small, n × large, mixed)
- For each candidate config, compute a **capture rate**: % of shaveable demand the config actually captures across the year’s worst days. Present configs ranked by capture rate with cost-of-units count, e.g. “2× 60/300 → 87% capture; 3× → 96%”
- Always include a **manual override** field for kW and kWh so I can force a config
- Honor per-unit constraint flags (see Unit Constraints below)

### 3. Dispatch Simulator

- Simulate the selected config against the FULL year of 15-min interval data, not just worst days
- Model: state of charge over time, round-trip efficiency (default 88%, editable), max charge/discharge rates, configurable charge windows (e.g., charge only off-peak)
- Honor unit constraints: some units **cannot charge and discharge simultaneously** and **cannot parallel** — these must be config flags per unit type
- Outputs: missed-peak events (intervals where load exceeded target and BESS couldn’t cover), realized vs theoretical demand reduction per month, annual cycle count
- Chart: representative day overlay (raw load, shaved load, SOC)

### 4. Tariff Engine

- Structured, editable library of tariff schedules: utility, schedule name, demand charge $/kW (with seasonal/TOU variants), TOU energy windows and rates, and ratchet clause parameters
- Seed with placeholder schedules for **SDG&E, SCE, and PSEG Long Island** that I will correct with real values — clearly mark all seeded numbers as PLACEHOLDER, do not present them as verified rates
- Savings math in other modules must compute against the selected tariff (monthly demand charge × realized kW reduction, TOU arbitrage where applicable), not a flat $/kW assumption

### 5. Revenue Stack Modeler

- Layer revenue streams on top of demand-charge savings: demand response program payments, capacity/incentive programs, TOU arbitrage
- Include **conflict logic**: the same kWh/kW cannot be committed to conflicting programs simultaneously
- Three scenarios per site: conservative / base / aggressive, with editable assumptions per stream

### 6. Deal Economics Model

- Two-sided view: (a) customer side — monthly savings, payback vs rental cost; (b) Sunbelt side — monthly rental rate, utilization assumption, ROIC per unit deployed
- Solve in both directions: given a rental rate → customer payback; given a target customer payback → max supportable rental rate

### 7. Site Evaluation Summary

- One-page composite per site: site info, recommended config + capture rate, simulated annual savings, tariff used, revenue stack scenario, deal economics snapshot, and a manual-entry permitting risk tier (Low/Med/High with notes field)
- Export to PDF via jsPDF using Sunbelt branding: **Sunbelt orange (#FFA400ish — I’ll confirm exact hex), Roboto font**, clean executive layout

## Unit Constraints reference

Maintain a small editable unit-spec table: name, kW, kWh, max charge rate, can_parallel (bool), simultaneous_charge_discharge (bool). Seed with the two reference units above (assume both can parallel and can simultaneously charge/discharge unless I say otherwise) — but the flags must exist because some fleet units (e.g., legacy Moxion MP-75/600) cannot do either.

## Non-goals (v1)

- No backend, no auth, no database
- No customer-facing polish — internal density over aesthetics
- No automated tariff scraping — tariff library is manually maintained
- No AHJ/permitting lookup automation — manual risk tier entry only
- No solar/EV/other DER modeling — BESS only for now

## Working style

- Commit working increments; don’t write all seven modules before anything runs
- After scaffolding, build Module 1 end-to-end and stop for my review with a sample CSV test before proceeding
- I will provide real SCE/SDG&E interval CSVs for parser testing — ask me for them when Module 1’s parser is ready
- Flag any assumption you make about tariff math, sizing logic, or battery behavior rather than silently choosing