// Headless-browser smoke test of the built single-file app:
// open dist/bess-workbench.html, upload a sample CSV, assert the analysis renders.
// Run: node test/smoke.browser.mjs   (requires `npx playwright install chromium`)
import { chromium } from 'playwright';
import { resolve } from 'node:path';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto('file://' + resolve('dist/bess-workbench.html'));
await page.waitForSelector('nav.tabs button');

const tabs = await page.$$eval('nav.tabs button', (els) => els.map((e) => e.textContent));
console.log('tabs:', tabs.join(' | '));
if (tabs.length !== 7) throw new Error(`expected 7 tabs, got ${tabs.length}`);

// CDN libs loaded?
const libs = await page.evaluate(() => ({
  chart: typeof Chart !== 'undefined',
  xlsx: typeof XLSX !== 'undefined',
  jspdf: typeof jspdf !== 'undefined' || typeof jsPDF !== 'undefined',
}));
console.log('vendored libs:', JSON.stringify(libs));
if (!libs.chart || !libs.xlsx || !libs.jspdf) throw new Error('vendored library missing');

// Upload a sample CSV through the hidden file input
await page.setInputFiles('section[data-tab="intervals"] input[type=file]', 'sample-data/sdge_style_long.csv');
await page.waitForSelector('table.heatmap', { timeout: 15000 });

const stats = await page.$$eval('.stat', (els) => els.map((e) => e.textContent.trim()));
console.log('stats:', stats.join(' || '));
const peak = stats.find((s) => s.toLowerCase().includes('peak demand'));
if (!peak || !/\d/.test(peak)) throw new Error('peak demand stat missing');

const monthlyRows = await page.$$eval('table.data tr', (els) => els.length);
console.log('monthly table rows (incl. headers):', monthlyRows);

const canvases = await page.$$eval('canvas', (els) => els.map((c) => c.width > 0 && c.height > 0));
console.log('canvases rendered:', canvases.length, 'non-zero:', canvases.filter(Boolean).length);

// Save workspace JSON round-trip
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.click('header.appbar button:has-text("Save Workspace")'),
]);
console.log('workspace download:', download.suggestedFilename());

await page.screenshot({ path: 'test/smoke-screenshot.png', fullPage: true });
await browser.close();

if (errors.length) {
  console.error('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE TEST PASSED');
