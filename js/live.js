// Refreshes the baked numbers from the public GitHub API. The page ships with a
// snapshot (tools/build.mjs), so if anything here fails the visitor never notices.

import { $, $$, REPO, formatFor, fmtDate, cleanName, esc } from './util.js';

const API = 'https://api.github.com';
const USER = 'RookieEnough';
const CACHE_KEY = 'orion-live-v1';
const CACHE_MS = 60 * 60 * 1000; // unauthenticated API allows 60 requests an hour

async function getJSON(path, ms = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(API + path, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// "Prometheus Update" -> "Prometheus", "The Rigel Hotfix" -> "Rigel".
const shortName = (name) => cleanName(name).replace(/^The\s+/i, '').replace(/\s+(Update|Hotfix|Patch)$/i, '');

function summarise(repos, user, releases) {
  const v = {};
  let totalStars = 0;
  for (const r of repos) {
    v[`repos.${r.name}.stars`] = r.stargazers_count;
    v[`repos.${r.name}.forks`] = r.forks_count;
    if (!r.fork) totalStars += r.stargazers_count;
  }
  v['repos.totalStars'] = totalStars;
  v['user.followers'] = user.followers;
  v['user.repos'] = user.public_repos;

  const rel = releases
    .filter((r) => !r.draft)
    .map((r) => ({
      tag: r.tag_name,
      name: r.name || r.tag_name,
      date: (r.published_at || r.created_at).slice(0, 10),
      url: r.html_url,
      downloads: r.assets.reduce((a, x) => a + x.download_count, 0),
      apk: r.assets.find((x) => x.name === 'app-release.apk') || r.assets.find((x) => x.name.endsWith('.apk')),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  if (!rel.length) return { values: v, rows: [] };

  const peak = rel.reduce((a, r) => (r.downloads > a.downloads ? r : a), rel[0]);
  v['releases.count'] = rel.length;
  v['releases.total'] = rel.reduce((a, r) => a + r.downloads, 0);
  v['releases.peak'] = `${peak.tag} ${shortName(peak.name)}`;

  const latest = releases.find((r) => !r.draft && !r.prerelease) || releases[0];
  const latestRow = rel.find((r) => r.tag === latest.tag_name) || rel[0];
  v['latest.tag'] = latestRow.tag;
  v['latest.name'] = cleanName(latestRow.name);
  v['latest.date'] = fmtDate(latestRow.date);
  if (latestRow.apk) v['latest.size'] = `${(latestRow.apk.size / 1048576).toFixed(1)} MB`;

  const hrefs = { latest: latestRow.url };
  if (latestRow.apk) hrefs.apk = latestRow.apk.browser_download_url;

  return {
    values: v,
    hrefs,
    rows: rel.map(({ tag, name, date, downloads }) => ({ tag, name, date, downloads, peak: downloads === peak.downloads })),
    max: peak.downloads,
  };
}

async function load() {
  try {
    const hit = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (hit && Date.now() - hit.t < CACHE_MS) return hit;
  } catch { /* storage blocked or corrupt */ }
  const [repos, user, releases] = await Promise.all([
    getJSON(`/users/${USER}/repos?per_page=100`),
    getJSON(`/users/${USER}`),
    getJSON(`/repos/${USER}/Orion-Store/releases?per_page=100`),
  ]);
  const data = { t: Date.now(), ...summarise(repos, user, releases) };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* private mode */ }
  return data;
}

function rowHTML(r, max) {
  return `<li class="rel${r.peak ? ' is-peak' : ''}"><a href="${REPO}/releases/tag/${encodeURIComponent(r.tag)}">` +
    `<span class="rel-v">${esc(r.tag)}</span>` +
    `<span class="rel-name">${esc(cleanName(r.name))}</span>` +
    `<time class="rel-date" datetime="${esc(r.date)}">${fmtDate(r.date)}</time>` +
    `<span class="rel-bar" aria-hidden="true"><i style="--w:${(r.downloads / max).toFixed(3)}"></i></span>` +
    `<span class="rel-dl">${r.downloads.toLocaleString('en-US')}<span class="sr"> downloads</span></span>` +
    `</a></li>`;
}

function apply(data) {
  const root = document.documentElement;
  const motion = root.classList.contains('motion');
  const { values, hrefs = {}, rows = [], max } = data;

  for (const el of $$('[data-live]')) {
    const v = values[el.dataset.live];
    if (v == null) continue;
    if (typeof v !== 'number') { el.textContent = v; continue; }
    // A count-up that hasn't run yet will read the new target itself.
    if (el.hasAttribute('data-count')) {
      el.dataset.count = v;
      if (motion && !el.hasAttribute('data-counted')) continue;
    }
    el.textContent = formatFor(el, v);
  }
  for (const el of $$('[data-live-href]')) {
    const h = hrefs[el.dataset.liveHref];
    if (h && /^https:\/\/github\.com\//.test(h)) el.href = h;
  }

  const list = $('[data-rel-list]');
  if (list && rows.length && max) list.innerHTML = rows.map((r) => rowHTML(r, max)).join('');

  // Keep the constellation's download counts in step with the list.
  const byTag = new Map(rows.map((r) => [r.tag, r.downloads.toLocaleString('en-US')]));
  for (const star of $$('.star[data-version]')) {
    const dl = byTag.get(star.dataset.version);
    if (!dl) continue;
    star.dataset.dl = dl;
    if (star.classList.contains('is-on')) {
      const out = $('[data-sc-dl]');
      if (out) out.textContent = `${dl} downloads`;
    }
  }

  const status = $('[data-live-status]');
  if (status) {
    const when = new Date(data.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    status.textContent = `Live from the GitHub API, ${when}.`;
  }
  root.classList.add('live');
  window.ScrollTrigger?.refresh();
}

export async function run() {
  try {
    apply(await load());
  } catch (err) {
    // Offline, rate-limited or blocked: the baked snapshot stays.
    console.info('[orion] keeping the baked figures:', err.message);
  }
}
