// Build script: bundles src/ into a single self-contained HTML file.
// Usage: npm run build  ->  dist/bess-workbench.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const result = await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  minify: false,
  sourcemap: false,
});
const js = result.outputFiles[0].text;
const css = readFileSync('src/styles.css', 'utf8');
const template = readFileSync('src/template.html', 'utf8');

const vendor = ['chart.umd.min.js', 'xlsx.full.min.js', 'jspdf.umd.min.js', 'roboto-fonts.js']
  .map((f) => readFileSync(`vendor/${f}`, 'utf8'))
  .join('\n;\n');

const html = template
  .replace('/*__INLINE_CSS__*/', () => css)
  .replace('/*__VENDOR_JS__*/', () => vendor)
  .replace('/*__INLINE_JS__*/', () => js);

if (html.includes('__INLINE_')) {
  console.error('Build failed: template placeholder not replaced');
  process.exit(1);
}

mkdirSync('dist', { recursive: true });
writeFileSync('dist/bess-workbench.html', html);
console.log(`dist/bess-workbench.html written (${(html.length / 1024).toFixed(0)} KB)`);
