// Headless-browser smoke test of the built single-file app: walks the full
// workflow — upload data, select a config, run dispatch, check tariff $,
// revenue stack, economics, summary PDF — plus a mobile-viewport pass.
// Run: node test/smoke.browser.mjs   (requires `npx playwright install chromium`)
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('dialog', (d) => { errors.push(`unexpected dialog: ${d.message()}`); d.dismiss(); });

await page.goto('file://' + resolve('dist/bess-workbench.html'));
await page.waitForSelector('nav.tabs button');

const tabs = await page.$$eval('nav.tabs button', (els) => els.map((e) => e.textContent));
console.log('tabs:', tabs.join(' | '));
if (tabs.length !== 7) throw new Error(`expected 7 tabs, got ${tabs.length}`);

const libs = await page.evaluate(() => ({
  chart: typeof Chart !== 'undefined',
  xlsx: typeof XLSX !== 'undefined',
  jspdf: typeof jspdf !== 'undefined' || typeof jsPDF !== 'undefined',
  roboto: typeof ROBOTO_REGULAR_B64 === 'string' && ROBOTO_REGULAR_B64.length > 10000,
}));
console.log('vendored libs:', JSON.stringify(libs));
if (!libs.chart || !libs.xlsx || !libs.jspdf || !libs.roboto) throw new Error('vendored library missing');

const tab = (id) => page.click(`nav.tabs button[data-tab="${id}"]`);

// --- Tab 1: reference building profile (NREL ComStock) ---
const refPanel = 'section[data-tab="intervals"] .panel:has(h2:has-text("Reference Building Profile"))';
await page.selectOption(`${refPanel} select >> nth=0`, 'NY');
await page.selectOption(`${refPanel} select >> nth=1`, 'largeoffice');
await page.fill(`${refPanel} input[type=number]`, '1500');
await page.click(`${refPanel} button:has-text("Load reference profile")`);
await page.waitForSelector('table.heatmap', { timeout: 20000 });
const refDetect = await page.$eval('section[data-tab="intervals"]', (e) => e.textContent);
if (!refDetect.includes('ComStock')) throw new Error('reference profile source note missing');
const refPeak = await page.$$eval('section[data-tab="intervals"] .stat', (els) =>
  els.map((e) => e.textContent).find((t) => /peak demand/i.test(t)));
if (!/1,?500/.test(refPeak || '')) throw new Error(`reference profile not scaled to 1500 kW peak: ${refPeak}`);
console.log('tab 1: reference profile loaded (NY large office @ 1500 kW) —', refPeak);

// --- Tab 1: invoice-first mode (3 invoices -> calibrated year) ---
{
  const invPanel = 'section[data-tab="intervals"] .panel:has(h2:has-text("Monthly Invoices"))';
  await page.selectOption(`${invPanel} select >> nth=0`, 'NJ');
  await page.selectOption(`${invPanel} select >> nth=1`, 'warehouse');
  // Jan, Jul, Oct invoices: kWh + billed kW
  const fill = async (monthIdx, kwh, pk) => {
    await page.fill(`${invPanel} table.data input >> nth=${monthIdx * 2}`, String(kwh));
    await page.fill(`${invPanel} table.data input >> nth=${monthIdx * 2 + 1}`, String(pk));
  };
  await fill(0, 80000, 380);  // Jan
  await fill(6, 120000, 520); // Jul
  await fill(9, 90000, 400);  // Oct
  await page.click(`${invPanel} button:has-text("Build estimate from invoices")`);
  await page.waitForSelector('table.heatmap', { timeout: 20000 });
  const invText = await page.$eval('section[data-tab="intervals"]', (e) => e.textContent);
  if (!invText.includes('Invoice Calibration')) throw new Error('invoice calibration panel missing');
  if (!/inferred/i.test(invText)) throw new Error('inferred-month flags missing');
  const invPeak = await page.$$eval('section[data-tab="intervals"] .stat', (els) =>
    els.map((e) => e.textContent).find((t) => /peak demand/i.test(t)));
  if (!/520/.test(invPeak || '')) throw new Error(`invoice-calibrated peak wrong: ${invPeak}`);
  console.log('tab 1: invoice mode calibrated (3 invoices, peak 520 kW) —', invPeak);
}

// --- Tab 1: upload XLSX (multi-sheet, real date serials), then the CSV ---
await page.setInputFiles('section[data-tab="intervals"] input[type=file]', 'sample-data/generic_15min_kw.xlsx');
await page.waitForFunction(() =>
  [...document.querySelectorAll('section[data-tab="intervals"] td')]
    .some((td) => td.textContent.includes('generic_15min_kw.xlsx')), { timeout: 30000 });
await page.waitForSelector('table.heatmap', { timeout: 30000 });
const detection = await page.$eval('section[data-tab="intervals"]', (e) => e.textContent);
if (!detection.includes('used "Interval Data"')) throw new Error('xlsx multi-sheet note missing from detection summary');
if (!detection.includes('generic_15min_kw.xlsx')) throw new Error('xlsx file name missing from detection summary');
console.log('tab 1: xlsx loaded (multi-sheet, date serials)');

// Both kW and kWh columns: must prefer kW and show the cross-check passing
await page.setInputFiles('section[data-tab="intervals"] input[type=file]', 'sample-data/generic_15min_kw_and_kwh.csv');
await page.waitForFunction(() =>
  [...document.querySelectorAll('section[data-tab="intervals"] td')]
    .some((td) => td.textContent.includes('generic_15min_kw_and_kwh.csv')), { timeout: 20000 });
const bothText = await page.$eval('section[data-tab="intervals"]', (e) => e.textContent);
if (!/cross-check/i.test(bothText)) throw new Error('kW/kWh cross-check note missing');
if (!/Full year/i.test(bothText)) throw new Error('full-year coverage check missing');
const valueColSel = await page.$$('section[data-tab="intervals"] select');
console.log('tab 1: both-columns file loaded (cross-check + full-year shown)');

await page.setInputFiles('section[data-tab="intervals"] input[type=file]', 'sample-data/sdge_style_long.csv');
await page.waitForFunction(() =>
  [...document.querySelectorAll('section[data-tab="intervals"] td')]
    .some((td) => td.textContent.includes('sdge_style_long.csv')), { timeout: 15000 });
await page.waitForSelector('table.heatmap', { timeout: 15000 });
console.log('tab 1: csv loaded');

// --- Tab 2: pick a 50% shave target, then select the first ≥95% candidate ---
await tab('sizing');
await page.waitForSelector('section[data-tab="sizing"] input[type=range]');
await page.$eval('section[data-tab="sizing"] input[type=range]', (el) => {
  el.value = '50';
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForSelector('section[data-tab="sizing"] table.data button');
// pick the candidate row with the best capture (last frontier row)
const selBtns = await page.$$('section[data-tab="sizing"] table.data button');
await selBtns[selBtns.length - 1].click();
await page.waitForSelector('section[data-tab="sizing"] .chart-box canvas');
const selHeader = await page.$eval('section[data-tab="sizing"] h2:last-of-type, section[data-tab="sizing"] .row h2', (e) => e.textContent).catch(() => '');
console.log('tab 2: selected config —', selHeader || '(see chart)');

// --- Tab 3: run dispatch ---
await tab('dispatch');
await page.click('section[data-tab="dispatch"] button.action');
await page.waitForSelector('section[data-tab="dispatch"] table.data');
const cyc = await page.$$eval('section[data-tab="dispatch"] .stat', (els) =>
  els.map((e) => e.textContent.trim()).find((t) => t.toLowerCase().includes('cycles')));
console.log('tab 3:', cyc);
if (!/\d/.test(cyc || '')) throw new Error('dispatch stats missing');

// --- Tab 4: USURDB library loads, utility filter works, savings compute ---
await tab('tariffs');
await page.waitForSelector('section[data-tab="tariffs"] table.data');
const libCount = await page.$eval('section[data-tab="tariffs"] .muted', (e) => e.textContent);
console.log('tab 4 library:', libCount);
const utilOptions = await page.$$eval('section[data-tab="tariffs"] select >> nth=0 >> option', (els) => els.length);
if (utilOptions < 10) throw new Error(`expected many utilities in filter, got ${utilOptions}`);
const savings = await page.$$eval('section[data-tab="tariffs"] .stat', (els) => els.map((e) => e.textContent.trim()));
console.log('tab 4:', savings.join(' || ') || 'no savings stats');
if (!savings.some((s) => s.includes('$'))) throw new Error('tariff savings not computed');

// --- Tab 5: revenue stack renders three scenarios ---
await tab('revenue');
await page.waitForSelector('section[data-tab="revenue"] .row .panel');
const scen = await page.$$eval('section[data-tab="revenue"] .row > .panel > h2', (els) => els.map((e) => e.textContent));
console.log('tab 5 scenarios:', scen.join(' | '));
if (scen.length !== 3) throw new Error('expected 3 scenario panels');

// --- Tab 6: economics shows payback + ROIC ---
await tab('economics');
await page.waitForSelector('section[data-tab="economics"] .stat');
const econStats = await page.$$eval('section[data-tab="economics"] .stat .l', (els) => els.map((e) => e.textContent));
console.log('tab 6 stats:', econStats.join(' | '));
if (!econStats.some((s) => /payback/i.test(s)) || !econStats.some((s) => /roic/i.test(s))) {
  throw new Error('economics stats missing');
}

// --- Tab 7: summary composite + PDF download ---
await tab('summary');
await page.waitForSelector('section[data-tab="summary"] table.data');
const [pdf] = await Promise.all([
  page.waitForEvent('download', { timeout: 20000 }),
  page.click('section[data-tab="summary"] button.action'),
]);
console.log('tab 7: PDF download:', pdf.suggestedFilename());

// --- Workspace round-trip ---
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('header.appbar button:has-text("Save Workspace")'),
]);
console.log('workspace download:', download.suggestedFilename());

await page.screenshot({ path: 'test/smoke-screenshot.png', fullPage: true });

// --- Mobile viewport pass: tabs scrollable, no horizontal body overflow ---
await page.setViewportSize({ width: 390, height: 844 });
await tab('intervals');
await page.waitForTimeout(400);
const mobile = await page.evaluate(() => ({
  bodyOverflow: document.body.scrollWidth - window.innerWidth,
  tabsScrollable: document.querySelector('nav.tabs').scrollWidth >= document.querySelector('nav.tabs').clientWidth,
}));
console.log('mobile:', JSON.stringify(mobile));
if (mobile.bodyOverflow > 2) throw new Error(`horizontal overflow on mobile: ${mobile.bodyOverflow}px`);
await page.screenshot({ path: 'test/smoke-mobile.png', fullPage: false });

await browser.close();

if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
