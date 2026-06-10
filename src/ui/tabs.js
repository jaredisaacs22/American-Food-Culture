// Tab-based UI shell: one tab per module. Each module exports
// { id, title, mount(panelEl) } and re-renders itself via store.subscribe.

import { el, clear, downloadFile } from './dom.js';
import { getSite, notify, exportWorkspace, importWorkspace, resetSite } from '../model/store.js';

export function renderShell(root, modules) {
  clear(root);

  const siteNameInput = el('input', {
    type: 'text',
    value: getSite().meta.name,
    onchange: (e) => { getSite().meta.name = e.target.value; notify({ meta: true }); },
  });

  const header = el('header', { class: 'appbar' },
    el('span', { class: 'logo' }, 'SUNBELT'),
    el('span', {}, 'BESS Site Analysis Workbench'),
    el('span', { class: 'site-name' }, siteNameInput),
    el('span', { class: 'spacer' }),
    el('button', { class: 'ghost', onclick: onNewSite }, 'New Site'),
    el('button', { class: 'ghost', onclick: onLoadWorkspace }, 'Load Workspace'),
    el('button', { onclick: onSaveWorkspace }, 'Save Workspace'),
  );

  const nav = el('nav', { class: 'tabs' });
  const host = el('main', { id: 'tab-host' });
  const panels = new Map();

  for (const mod of modules) {
    const btn = el('button', { onclick: () => activate(mod.id) }, mod.title);
    btn.dataset.tab = mod.id;
    nav.append(btn);
    const panel = el('section', { class: 'tab-panel' });
    panel.dataset.tab = mod.id;
    panels.set(mod.id, panel);
    host.append(panel);
  }

  root.append(header, nav, host);

  for (const mod of modules) mod.mount(panels.get(mod.id));

  function activate(id) {
    for (const b of nav.children) b.classList.toggle('active', b.dataset.tab === id);
    for (const [pid, p] of panels) p.classList.toggle('active', pid === id);
  }
  activate(modules[0].id);

  function onSaveWorkspace() {
    const name = (getSite().meta.name || 'site').replace(/[^\w.-]+/g, '_');
    downloadFile(`${name}.bess.json`, exportWorkspace());
  }

  function onLoadWorkspace() {
    const input = el('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        importWorkspace(await file.text());
        siteNameInput.value = getSite().meta.name;
      } catch (err) {
        alert(`Could not load workspace: ${err.message}`);
      }
    });
    input.click();
  }

  function onNewSite() {
    if (!confirm('Start a new site? Unsaved analysis will be lost.')) return;
    resetSite();
    siteNameInput.value = getSite().meta.name;
  }
}
