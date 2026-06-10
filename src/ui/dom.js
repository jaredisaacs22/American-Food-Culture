// Tiny DOM helpers — keep modules terse without a framework.

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export const fmt = {
  kw: (v) => v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v).toLocaleString()} kW`,
  kwh: (v) => v === null || v === undefined || Number.isNaN(v) ? '—' : `${Math.round(v).toLocaleString()} kWh`,
  num: (v, d = 1) => v === null || v === undefined || Number.isNaN(v) ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d }),
  pct: (v, d = 1) => v === null || v === undefined || Number.isNaN(v) ? '—' : `${(v * 100).toFixed(d)}%`,
  usd: (v) => v === null || v === undefined || Number.isNaN(v) ? '—' : v.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
};

export function downloadFile(name, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
