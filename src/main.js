import { renderShell } from './ui/tabs.js';
import intervals from './modules/intervals/index.js';
import sizing from './modules/sizing/index.js';
import dispatch from './modules/dispatch/index.js';
import tariffs from './modules/tariffs/index.js';
import revenue from './modules/revenue/index.js';
import economics from './modules/economics/index.js';
import summary from './modules/summary/index.js';

const modules = [intervals, sizing, dispatch, tariffs, revenue, economics, summary];

document.addEventListener('DOMContentLoaded', () => {
  renderShell(document.getElementById('app'), modules);
});
