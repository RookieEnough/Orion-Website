// Small helpers shared by main.js and live.js.

export const REPO = 'https://github.com/RookieEnough/Orion-Store';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const full = new Intl.NumberFormat('en-US');
const compact1 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
const compact2 = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });

// Formats a number the way the element asks for it:
// data-format="compact" gives 3.6K / 1.26M, data-suffix is appended.
export function formatFor(el, n) {
  const compact = el.dataset.format === 'compact';
  const text = compact ? (n >= 1e6 ? compact2 : compact1).format(n) : full.format(Math.round(n));
  return text + (el.dataset.suffix || '');
}

export const fmtDate = (iso) =>
  new Date(iso.length === 10 ? iso + 'T12:00:00Z' : iso)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// "Orion Store v1.2.2: Orion’s Belt Update" -> "Orion's Belt Update". Same rule as tools/build.mjs.
export const cleanName = (name) => name.replace(/^.*?(?:[:;]| - )\s*/, '').replace(/[’]/g, "'").trim();

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
