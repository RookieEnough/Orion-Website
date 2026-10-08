// Re-bakes the generated parts of index.html. No dependencies:
//   node website/tools/build.mjs
//
// 1. Release history rows, from tools/releases.snapshot.json
//    (refresh it with the `gh api` command in README.md).
// 2. The inline icon sprite, from tools/sprite.svg.html, pruned to the
//    icons index.html actually references.
// 3. Gallery frames for any image dropped into media/screens that the page
//    doesn't use yet, ordered and captioned by media/screens/captions.txt
//    (or from the file name when it isn't listed there).
// 4. Version stamps: every local stylesheet, script and media URL gets
//    ?v=<content hash>, and an import map does the same for the modules they
//    import, so a browser holding an old copy fetches the new one. Run this
//    after any CSS, JS or media edit (a regenerated upi-qr.svg included).
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const indexPath = join(here, '..', 'index.html');
let html = readFileSync(indexPath, 'utf8');

const REPO = 'https://github.com/RookieEnough/Orion-Store';
const fmtDate = (iso) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const cleanName = (name) => name.replace(/^.*?(?:[:;]| - )\s*/, '').replace(/[’]/g, "'").trim();

function inject(marker, body) {
  const re = new RegExp(`(<!--${marker}:start-->)[\\s\\S]*?(<!--${marker}:end-->)`);
  if (!re.test(html)) throw new Error(`marker ${marker} not found`);
  html = html.replace(re, `$1\n${body}\n$2`);
}

// Releases
const releases = JSON.parse(readFileSync(join(here, 'releases.snapshot.json'), 'utf8'));
const max = Math.max(...releases.map((r) => r.downloads));
const rows = releases.map((r) => {
  const w = (r.downloads / max).toFixed(3);
  const peak = r.downloads === max ? ' is-peak' : '';
  return `<li class="rel${peak}"><a href="${REPO}/releases/tag/${r.tag}">` +
    `<span class="rel-v">${r.tag}</span>` +
    `<span class="rel-name">${cleanName(r.name)}</span>` +
    `<time class="rel-date" datetime="${r.date}">${fmtDate(r.date)}</time>` +
    `<span class="rel-bar" aria-hidden="true"><i style="--w:${w}"></i></span>` +
    `<span class="rel-dl">${r.downloads.toLocaleString('en-US')}<span class="sr"> downloads</span></span>` +
    `</a></li>`;
});
inject('releases', rows.join('\n'));

// Sprite
const sprite = readFileSync(join(here, 'sprite.svg.html'), 'utf8');
const used = new Set([...html.matchAll(/href="#((?:i|s)-[a-z0-9-]+)"/g)].map((m) => m[1]));
const symbols = [...sprite.matchAll(/<symbol id="([^"]+)"[\s\S]*?<\/symbol>/g)]
  .filter((m) => used.has(m[1]))
  .map((m) => m[0]);
const missing = [...used].filter((id) => !symbols.some((s) => s.includes(`id="${id}"`)));
if (missing.length) console.warn('icons referenced but not in sprite:', missing.join(', '));
inject('sprite', `<svg xmlns="http://www.w3.org/2000/svg" class="sprite" aria-hidden="true" focusable="false">\n${symbols.join('\n')}\n</svg>`);

// Screens: every image in media/screens that the page doesn't show yet joins the
// end of the gallery. media/screens/captions.txt sets their order, titles and
// subtitles ("file | Title | Subtitle"); an unlisted file is captioned with its
// name (app-bundles.jpg → "App bundles").
const site = join(here, '..');
const shown = html.replace(/<!--screens:start-->[\s\S]*?<!--screens:end-->/, '');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const captionsPath = join(site, 'media/screens/captions.txt');
const captions = new Map(existsSync(captionsPath) ? readFileSync(captionsPath, 'utf8').split(/\r?\n/)
  .filter((l) => l.trim() && !l.trim().startsWith('#'))
  .map((l) => l.split('|').map((s) => s.trim()))
  .map(([f, title = '', sub = '']) => [f, { title, sub }]) : []);
const files = readdirSync(join(site, 'media/screens'));
const unknown = [...captions.keys()].filter((f) => !files.includes(f));
if (unknown.length) console.warn('captions.txt lists files that are not in media/screens:', unknown.join(', '));
const listed = [...captions.keys()];
const rank = (f) => (listed.includes(f) ? listed.indexOf(f) : listed.length);
const screens = files
  .filter((f) => /\.(jpe?g|png|webp|avif)$/i.test(f) && !shown.includes(`media/screens/${f}`))
  .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  .map((f) => {
    const name = f.replace(/\.\w+$/, '').replace(/[-_\s]+/g, ' ').trim();
    const { title: t = '', sub = '' } = captions.get(f) || {};
    const title = esc(t || (/[a-z]/i.test(name) ? name[0].toUpperCase() + name.slice(1) : ''));
    const caption = (title ? `<b>${title}</b>` : '') + (sub ? `<span>${esc(sub)}</span>` : '');
    return `        <li class="g-item">\n          <figure class="slot">\n` +
      `            <div class="slot-ph"><svg aria-hidden="true"><use href="#mark"/></svg></div>\n` +
      `            <img src="media/screens/${encodeURI(f)}" alt="${title || 'A screen from Orion Store'}" loading="lazy" onload="this.parentNode.classList.add('is-filled')" onerror="this.remove()">\n` +
      (caption ? `            <figcaption>${caption}</figcaption>\n` : '') +
      `          </figure>\n        </li>`;
  });
inject('screens', screens.join('\n'));

// Version stamps
const hash = (path) => createHash('sha256').update(readFileSync(join(site, path))).digest('hex').slice(0, 8);
// A media slot whose file hasn't been added yet keeps its bare URL.
html = html.replace(/((?:href|src)=")((?:css|js|vendor)\/[\w.-]+\.(?:css|js)|media\/[\w./-]+\.(?:svg|png|webp|avif|jpe?g|mp4))(?:\?v=\w+)?"/g,
  (_, attr, path) => existsSync(join(site, path)) ? `${attr}${path}?v=${hash(path)}"` : `${attr}${path}"`);
const modules = [
  ...readdirSync(join(site, 'js')).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`),
  'vendor/three.subset.min.js',
];
const imports = Object.fromEntries(modules.map((p) => [`./${p}`, `./${p}?v=${hash(p)}`]));
inject('importmap', `<script type="importmap">${JSON.stringify({ imports })}</script>`);

writeFileSync(indexPath, html);
const total = releases.reduce((a, r) => a + r.downloads, 0);
console.log(`baked ${rows.length} releases (total ${total.toLocaleString('en-US')} downloads), ${symbols.length} icons, ${screens.length} extra screens, ${modules.length} versioned modules`);
