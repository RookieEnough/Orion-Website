// Orion Store site. Content is complete without this file; everything here layers on top.
//
// Classes this adds to <html> (see the head script and site.css):
//   ui          main.js is running
//   motion      GSAP is present and reduced motion is off (enables the desktop pins)
//   motion-off  GSAP failed to load, so nothing waits for an entrance
//   menu-open   mobile menu is open
//   scene-ready (scene.js) the WebGL logo has rendered its first frame
//   gifts       the support section's 3D stages are reserved (WebGL is expected to work)
//   gifts-ready (gifts.js) the support objects are drawing

import { $, $$, REPO, formatFor, clamp } from './util.js';

const root = document.documentElement;
root.classList.add('ui');

const { gsap, ScrollTrigger, SplitText, Lenis } = window;
const reduced = root.classList.contains('reduced');
const hasGsap = !!(gsap && ScrollTrigger);
const motion = hasGsap && !reduced;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

if (!hasGsap) root.classList.add('motion-off');
if (hasGsap) gsap.registerPlugin(...[ScrollTrigger, SplitText].filter(Boolean));
if (motion) root.classList.add('motion');

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch { return false; }
}
const lowPower = navigator.connection?.saveData || (navigator.hardwareConcurrency || 8) <= 2;
const webgl = motion && !lowPower && webglOK();
// Reserve the 3D stages (the support objects, the phone band in How) now,
// before any trigger measures the page.
if (webgl) root.classList.add('gifts', 'webgl');

// Shared with scene.js. main.js writes, the scene reads and damps.
const stage = { hero: 0, howIn: 0, how: 0, get: 0 };
let scene = null;
let menuOpen = false;

/* ---------------------------------------------------------------- Lenis */

let lenis = null;
if (motion && Lenis) {
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, autoRaf: false });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

const navOffset = () => -($('[data-nav]')?.offsetHeight || 72) - 8;

function scrollToTarget(target) {
  if (lenis) lenis.scrollTo(target, { offset: navOffset(), duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

// In-page links go through Lenis so they glide, and land below the fixed nav.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const id = a.getAttribute('href').slice(1);
  const target = id === 'top' ? document.body : document.getElementById(id);
  if (!target) return;
  e.preventDefault();
  const wasOpen = menuOpen;
  if (wasOpen) closeMenu(false);
  const go = () => {
    if (id === 'top') lenis ? lenis.scrollTo(0, { duration: 1.4 }) : scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    else scrollToTarget(target);
    if (a.classList.contains('skip')) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }
  };
  // Let the menu release the scroll lock before moving.
  wasOpen ? requestAnimationFrame(go) : go();
  history.pushState(null, '', id === 'top' ? location.pathname + location.search : '#' + id);
});

/* ---------------------------------------------------------------- Nav */

const nav = $('[data-nav]');
let lastY = scrollY;
let navTicking = false;
function updateNav() {
  navTicking = false;
  const y = scrollY;
  nav.classList.toggle('is-scrolled', y > 24);
  const down = y > lastY + 4;
  const up = y < lastY - 4;
  if (down && y > innerHeight * 0.6 && !menuOpen) nav.classList.add('is-hidden');
  else if (up || y < 80) nav.classList.remove('is-hidden');
  if (down || up) lastY = y;
}
addEventListener('scroll', () => {
  if (!navTicking) { navTicking = true; requestAnimationFrame(updateNav); }
}, { passive: true });
nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
updateNav();

// Highlight the nav link for the section in the middle of the screen.
const navLinks = $$('.nav-links a');
const linkFor = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
const currentIO = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    navLinks.forEach((a) => a.classList.remove('is-current'));
    linkFor.get(en.target.id)?.classList.add('is-current');
  }
}, { rootMargin: '-45% 0px -54% 0px' });
linkFor.forEach((_, id) => { const s = document.getElementById(id); if (s) currentIO.observe(s); });

/* ---------------------------------------------------------------- Menu */

const menu = $('[data-menu]');
const menuBtn = $('[data-menu-btn]');
const inertables = [$('#main'), $('.foot')];
let menuTimer = 0;

function openMenu() {
  menuOpen = true;
  clearTimeout(menuTimer);
  menu.hidden = false;
  requestAnimationFrame(() => menu.classList.add('is-open'));
  menuBtn.setAttribute('aria-expanded', 'true');
  root.classList.add('menu-open');
  inertables.forEach((el) => el && (el.inert = true));
  if (lenis) lenis.stop(); else root.style.overflow = 'hidden';
  setTimeout(() => menu.querySelector('a')?.focus({ preventScroll: true }), 60);
}
function closeMenu(returnFocus = true) {
  if (!menuOpen) return;
  menuOpen = false;
  menu.classList.remove('is-open');
  menuBtn.setAttribute('aria-expanded', 'false');
  root.classList.remove('menu-open');
  inertables.forEach((el) => el && (el.inert = false));
  if (lenis) lenis.start(); else root.style.overflow = '';
  menuTimer = setTimeout(() => { menu.hidden = true; }, 460);
  if (returnFocus) menuBtn.focus({ preventScroll: true });
}
menuBtn?.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); });
matchMedia('(min-width: 960px)').addEventListener('change', (e) => { if (e.matches) closeMenu(false); });

/* ---------------------------------------------------------------- Copy buttons */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
$$('[data-copy]').forEach((btn) => {
  const label = $('[data-copy-label]', btn);
  const original = label?.textContent;
  let t = 0;
  btn.addEventListener('click', async () => {
    const ok = await copyText(btn.dataset.copy);
    if (!label) return;
    label.textContent = ok ? 'Copied' : 'Press Ctrl+C';
    btn.classList.toggle('is-copied', ok);
    clearTimeout(t);
    t = setTimeout(() => { label.textContent = original; btn.classList.remove('is-copied'); }, 1800);
  });
});

// The QR's scan line only runs while the code is on screen.
const qr = $('.qr-code');
if (qr) new IntersectionObserver(([en]) => qr.classList.toggle('is-live', en.isIntersecting)).observe(qr);

/* ---------------------------------------------------------------- Film */

const filmPlay = $('[data-film] [data-film-play]');
// The play button's link names the video: watch?v=, youtu.be/, shorts/ and embed/ links all work.
const yt = filmPlay?.href.match(/(?:[?&]v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/)?.[1];
if (yt) {
  const film = filmPlay.closest('[data-film]');
  // The video's own thumbnail. Only HD uploads have maxresdefault; otherwise YouTube
  // answers with a 120px grey placeholder (or a 404), so fall back to hqdefault.
  // The URL never changes when the thumbnail does, so a daily key stops a browser
  // holding on to an old one.
  const day = `?d=${Math.floor(Date.now() / 864e5)}`;
  const poster = Object.assign(new Image(), { className: 'film-poster', alt: '', loading: 'lazy', decoding: 'async' });
  const fallback = () => { poster.onerror = null; poster.src = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg${day}`; };
  poster.onload = () => (poster.naturalWidth > 120 ? film.classList.add('is-filled') : fallback());
  poster.onerror = fallback;
  poster.src = `https://i.ytimg.com/vi/${yt}/maxresdefault.jpg${day}`;
  filmPlay.before(poster);

  filmPlay.addEventListener('click', (e) => {
    e.preventDefault();
    if (film.classList.contains('is-playing')) return;
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;
    f.title = 'Orion Store walkthrough on YouTube';
    f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    f.allowFullscreen = true;
    f.referrerPolicy = 'strict-origin-when-cross-origin'; // YouTube refuses embeds that send no referrer
    f.setAttribute('data-lenis-prevent', '');
    film.append(f);
    film.classList.add('is-playing');
  });
}

/* ---------------------------------------------------------------- Releases list */

const relList = $('[data-rel-list]');
const relMore = $('[data-rel-more]');
relMore?.addEventListener('click', () => {
  const all = relList.classList.toggle('is-all');
  relMore.setAttribute('aria-expanded', String(all));
  relMore.innerHTML = all
    ? 'Show fewer'
    : `Show all <span data-live="releases.count">${relList.children.length}</span> releases`;
  if (!all) {
    const r = relList.getBoundingClientRect();
    if (r.bottom < 0) scrollToTarget(relList);
  }
  if (hasGsap) ScrollTrigger.refresh();
});

/* ---------------------------------------------------------------- Constellation */

const sky = $('[data-constellation]');
if (sky) {
  const NS = 'http://www.w3.org/2000/svg';
  // Deterministic background field so the sky looks the same on every visit.
  let seed = 20251128;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const field = $('[data-field]', sky);
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 150; i++) {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', (-270 + rnd() * 560).toFixed(1));
    c.setAttribute('cy', (-450 + rnd() * 900).toFixed(1));
    c.setAttribute('r', (0.35 + Math.pow(rnd(), 3) * 1.4).toFixed(2));
    c.setAttribute('opacity', (0.12 + rnd() * 0.5).toFixed(2));
    frag.append(c);
  }
  field.append(frag);

  // A soft halo behind each named star.
  $$('.sky-stars circle', sky).forEach((c) => {
    const h = document.createElementNS(NS, 'circle');
    h.setAttribute('class', 'halo');
    h.setAttribute('cx', c.getAttribute('cx'));
    h.setAttribute('cy', c.getAttribute('cy'));
    h.setAttribute('r', (parseFloat(c.getAttribute('r')) * 4.2).toFixed(1));
    c.before(h);
  });

  const card = $('[data-star-card]');
  const set = (k, v) => { const el = $(`[data-sc-${k}]`, card); if (el) el.textContent = v; };
  const stars = $$('.star', sky);
  stars.forEach((s) => s.setAttribute('aria-pressed', String(s.classList.contains('is-on'))));

  function showStar(btn) {
    if (btn.classList.contains('is-on')) return;
    stars.forEach((s) => { s.classList.toggle('is-on', s === btn); s.setAttribute('aria-pressed', String(s === btn)); });
    const d = btn.dataset;
    const fill = () => {
      set('star', d.star);
      set('desig', d.desig);
      set('version', d.version || '');
      set('name', d.version ? d.name : 'Unclaimed');
      set('date', d.date || '');
      set('dl', d.dl ? `${d.dl} downloads` : 'No release is named after it yet');
      const link = $('[data-sc-link]', card);
      if (d.version) link.href = `${REPO}/releases/tag/${d.version}`;
      card.classList.toggle('is-empty', !d.version);
    };
    if (motion) {
      const parts = $$(':scope > *', card);
      gsap.timeline()
        .to(parts, { autoAlpha: 0, y: -8, duration: 0.22, stagger: 0.03, ease: 'power2.in' })
        .add(fill)
        .fromTo(parts, { y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, stagger: 0.05, ease: 'power3.out' });
    } else {
      fill();
    }
  }
  stars.forEach((s) => {
    s.addEventListener('click', () => showStar(s));
    if (finePointer) s.addEventListener('pointerenter', () => showStar(s));
  });
}

/* ---------------------------------------------------------------- Morphe countdown */

const countdown = $('[data-countdown]');
if (countdown) {
  const pad = (n) => String(n).padStart(2, '0');
  // The ring beside it fills over the day, closing as the build starts.
  const ring = $('[data-countdown-ring]');
  const tick = () => {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 6));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const s = Math.floor((next - now) / 1000);
    countdown.textContent = `${pad(Math.floor(s / 3600))}h ${pad(Math.floor(s / 60) % 60)}m ${pad(s % 60)}s`;
    countdown.dateTime = next.toISOString();
    if (ring) ring.style.strokeDashoffset = ((s / 86400) * 100).toFixed(2);
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------------------------------------------------------------- Missing screenshots */

// A shot whose file isn't in media/ yet drops out of the page; ?slots shows it
// labelled instead. The inline onerror has already removed the <img> by now
// for anything that failed early, so an empty slot counts as missing too.
const shotSlots = '.g-item > .slot, .row-shot';
let slotRefresh = 0;
function markMissing(slot) {
  if (slot.classList.contains('is-missing')) return;
  slot.classList.add('is-missing');
  if (!hasGsap) return;
  clearTimeout(slotRefresh);
  slotRefresh = setTimeout(() => ScrollTrigger.refresh(), 150);
}
$$(shotSlots).forEach((s) => { if (!$('img', s)) markMissing(s); });
addEventListener('error', (e) => {
  const slot = e.target.tagName === 'IMG' && e.target.closest(shotSlots);
  if (slot) markMissing(slot);
}, true);
// Settle the gallery before its pin starts, not halfway through the scroll.
const galleryEl = $('[data-gallery]');
if (galleryEl) {
  new IntersectionObserver(([en], io) => {
    if (!en.isIntersecting) return;
    io.disconnect();
    $$('img[loading="lazy"]', galleryEl).forEach((img) => { img.loading = 'eager'; });
  }, { rootMargin: '1500px 0px' }).observe(galleryEl);
}

/* ---------------------------------------------------------------- Inside: rows drive the phone */

const phone = $('[data-phone]');
const rows = $$('[data-row]');
let activeRow = rows.find((r) => r.classList.contains('is-on')) || rows[0];
let rowsPinned = false; // set while a phone-sized pin drives the rows (setupPhone)

function showRow(row) {
  if (!row || row === activeRow) return;
  const dir = rows.indexOf(row) > rows.indexOf(activeRow) ? 1 : -1;
  activeRow = row;
  rows.forEach((r) => r.classList.toggle('is-on', r === row));
  if (!phone) return;
  const next = $(`.screen[data-screen="${row.dataset.row}"]`, phone);
  const prev = $('.screen.is-on', phone);
  if (next === prev) return;
  // A screen that hasn't been added yet: keep the last one rather than a blank.
  if (!next) return;
  if (!motion) {
    prev?.classList.remove('is-on');
    next.classList.add('is-on');
    return;
  }
  // Keep the outgoing screen visible underneath while the new one wipes in.
  $$('.screen', phone).forEach((s) => { if (s !== prev && s !== next) { gsap.killTweensOf(s); gsap.set(s, { clearProps: 'clipPath,opacity,zIndex' }); } });
  if (prev) { prev.classList.remove('is-on'); gsap.set(prev, { opacity: 1, zIndex: 1 }); }
  next.classList.add('is-on');
  gsap.fromTo(next,
    { clipPath: dir > 0 ? 'inset(100% 0% 0% 0% round 0px)' : 'inset(0% 0% 100% 0% round 0px)', scale: 1.06 },
    {
      clipPath: 'inset(0% 0% 0% 0% round 0px)', scale: 1, duration: 0.95, ease: 'expo.out', overwrite: true,
      onComplete: () => { gsap.set(next, { clearProps: 'clipPath,scale' }); if (prev) gsap.set(prev, { clearProps: 'opacity,zIndex' }); },
    });
}
if (rows.length) {
  const rowIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting && !rowsPinned) showRow(en.target); });
  }, { rootMargin: '-48% 0px -48% 0px' });
  rows.forEach((r) => rowIO.observe(r));
}

/* ---------------------------------------------------------------- Count-up */

function countUp(el) {
  const target = parseFloat(el.dataset.count);
  if (!motion || !isFinite(target)) return;
  const o = { v: 0 };
  el.textContent = formatFor(el, 0);
  gsap.to(o, {
    v: target, duration: 2, ease: 'expo.out',
    onUpdate: () => { el.textContent = formatFor(el, o.v); },
    // live.js may have updated data-count meanwhile; settle on the latest value.
    onComplete: () => { el.textContent = formatFor(el, parseFloat(el.dataset.count)); el.dataset.counted = ''; },
  });
}

/* ---------------------------------------------------------------- Motion */

// Masked words, or null when SplitText is missing (the element then simply fades).
function split(el) {
  gsap.set(el, { autoAlpha: 1 });
  return SplitText ? SplitText.create(el, { type: 'words', mask: 'words', wordsClass: 'w' }).words : null;
}

function revealSplit(el, start = 'top 84%') {
  const words = split(el);
  const scrollTrigger = { trigger: el, start, once: true };
  if (words) gsap.from(words, { yPercent: 108, duration: 1.05, ease: 'expo.out', stagger: 0.045, scrollTrigger });
  else gsap.from(el, { autoAlpha: 0, y: 24, duration: 1, ease: 'power3.out', scrollTrigger });
}

function revealGeneric(scope) {
  $$('[data-split]', scope).forEach((el) => { if (el.dataset.split !== 'hero') revealSplit(el); });
  $$('[data-reveal]', scope).forEach((el) => {
    gsap.fromTo(el, { autoAlpha: 0, y: 34 }, {
      autoAlpha: 1, y: 0, duration: 1.05, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true },
    });
  });
  $$('[data-reveal-group]', scope).forEach((g) => {
    const items = $$('[data-reveal-item]', g);
    gsap.fromTo(items, { autoAlpha: 0, y: 28 }, {
      autoAlpha: 1, y: 0, duration: 0.95, ease: 'power3.out', stagger: 0.08,
      scrollTrigger: { trigger: g, start: 'top 86%', once: true },
    });
  });
  $$('[data-count]', scope).forEach((el) => {
    ScrollTrigger.create({ trigger: el, start: 'top 90%', once: true, onEnter: () => countUp(el) });
  });
}

let introPlayed = false;
function heroIntro(hero) {
  const title = $('[data-split="hero"]', hero);
  const words = split(title);
  const intro = $$('[data-intro]', hero);
  if (introPlayed) { gsap.set(intro, { autoAlpha: 1 }); return; }
  introPlayed = true;
  gsap.timeline({ delay: 0.15, defaults: { ease: 'expo.out' } })
    .from(nav, { yPercent: -100, autoAlpha: 0, duration: 1.1, clearProps: 'transform,opacity,visibility' })
    .from(words || title, words ? { yPercent: 112, duration: 1.35, stagger: 0.07 } : { autoAlpha: 0, duration: 1 }, 0.1)
    .fromTo(intro, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1.1, stagger: 0.1, ease: 'power3.out' }, 0.55);
}

function setupSubtraction(sec) {
  const panel = $('[data-panel]', sec);
  gsap.fromTo(panel,
    { clipPath: 'inset(7% 5% 7% 5% round 56px)' },
    { clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none',
      scrollTrigger: { trigger: sec, start: 'top bottom', end: 'top 20%', scrub: 1 } });
  // While the panel fills the screen there's nothing of the scene to see but the side gutters.
  ScrollTrigger.create({
    trigger: panel, start: 'top top', end: 'bottom bottom',
    onToggle: (st) => { hold.covered = st.isActive && panel.offsetHeight >= innerHeight; syncScene(); },
  });
  $$('.cut', sec).forEach((cut) => {
    const s = $('.cut-word s', cut);
    gsap.fromTo(s, { '--k': 0, color: '#0b0b12' }, {
      '--k': 1, color: '#8e8ea2', ease: 'power2.inOut',
      scrollTrigger: { trigger: cut, start: 'top 82%', end: 'top 46%', scrub: 0.9 },
    });
    gsap.from($('.cut-with', cut), {
      autoAlpha: 0, x: 24, duration: 1, ease: 'power3.out',
      scrollTrigger: { trigger: cut, start: 'top 72%', once: true },
    });
  });
}

function setupHow(sec, desktop, pinned) {
  ScrollTrigger.create({
    trigger: sec, start: 'top bottom', end: 'top top',
    onUpdate: (st) => { stage.howIn = st.progress; },
  });
  const steps = $$('[data-step]', sec);
  const bars = $$('.how-progress li', sec);
  const setStep = (i) => {
    steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
    bars.forEach((b, k) => b.classList.toggle('is-on', k === i));
  };
  if (pinned) {
    let cur = 0;
    const pin = $('[data-how]', sec), lede = $('.lede', sec), cell = $('.how-steps', sec);
    // A phone has no room for the heading too: it scrolls away and the pin starts with the lede
    // at the top, or later still if the tallest step would run off the bottom.
    const lead = () => {
      if (desktop) return 0;
      const top = pin.getBoundingClientRect().top;
      return Math.max(0, lede.getBoundingClientRect().top - top - 12, cell.getBoundingClientRect().bottom - top - innerHeight + 16);
    };
    ScrollTrigger.create({
      trigger: pin, pin: true, start: () => `top+=${lead()} top`, end: '+=260%', anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: (st) => {
        stage.how = st.progress * 3;
        const i = Math.min(2, Math.floor(st.progress * 3));
        if (i !== cur) { cur = i; setStep(i); }
      },
      onLeave: () => { stage.how = 3; },
    });
    return () => setStep(0);
  }
  steps.forEach((s, i) => {
    gsap.from(s, { autoAlpha: 0, y: 30, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: s, start: 'top 85%', once: true } });
    ScrollTrigger.create({
      trigger: s, start: 'top 60%', end: 'bottom 60%',
      onToggle: (st) => st.isActive && (stage.how = i + 0.5),
      // A jump straight past the steps (a deep link, a fast fling) still ends on the last one.
      onLeave: () => i === steps.length - 1 && (stage.how = i + 0.5),
    });
  });
}

function setupPhone(sec, desktop, pinned) {
  if (!phone || !pinned) return;
  // A phone gets the phone too: the grid pins and scroll steps through the rows in place.
  if (!desktop) {
    rowsPinned = true;
    ScrollTrigger.create({
      trigger: $('.inside-grid', sec), pin: true, start: 'top top', end: () => '+=' + rows.length * innerHeight * 0.55,
      anticipatePin: 1, invalidateOnRefresh: true,
      onUpdate: (st) => showRow(rows[Math.min(rows.length - 1, Math.floor(st.progress * rows.length))]),
    });
  }
  // Scroll adds a slow sway, the pointer adds a direct tilt. Both damped.
  const cur = { rx: 0, ry: 0 }, ptr = { x: 0, y: 0 };
  let sway = 0, last = '';
  const onMove = (e) => { ptr.x = e.clientX / innerWidth - 0.5; ptr.y = e.clientY / innerHeight - 0.5; };
  if (finePointer) addEventListener('pointermove', onMove, { passive: true });
  const tick = (_, dt) => {
    const k = 1 - Math.exp(-(dt / 1000) * 5);
    cur.rx += (-ptr.y * 10 - cur.rx) * k;
    cur.ry += (ptr.x * 14 + sway - cur.ry) * k;
    const rx = cur.rx.toFixed(2), ry = cur.ry.toFixed(2);
    if (rx + ry === last) return; // settled: no style work until something moves
    last = rx + ry;
    phone.style.setProperty('--rx', rx + 'deg');
    phone.style.setProperty('--ry', ry + 'deg');
    phone.style.setProperty('--gx', (60 - cur.ry * 3).toFixed(1) + '%');
  };
  // The tilt only runs while the section is on screen.
  ScrollTrigger.create({
    trigger: sec, start: 'top bottom', end: 'bottom top',
    onUpdate: (st) => { sway = Math.sin(st.progress * Math.PI * 4) * 5; },
    onToggle: (st) => (st.isActive ? gsap.ticker.add(tick) : gsap.ticker.remove(tick)),
  });
  gsap.from(phone, {
    y: 80, rotateX: 18, autoAlpha: 0, duration: 1.4, ease: 'expo.out',
    scrollTrigger: { trigger: sec, start: 'top 70%', once: true },
  });
  return () => { rowsPinned = false; gsap.ticker.remove(tick); removeEventListener('pointermove', onMove); };
}

function setupFilm(sec) {
  const frame = $('[data-film]', sec);
  gsap.fromTo(frame, { scale: 0.86, y: 40 }, {
    scale: 1, y: 0, ease: 'none',
    scrollTrigger: { trigger: frame, start: 'top bottom', end: 'top 25%', scrub: 1.1 },
  });
}

function setupGallery(sec, desktop) {
  const items = $$('.g-item', sec);
  if (!desktop) {
    gsap.from(items, { autoAlpha: 0, x: 60, duration: 1.1, stagger: 0.08, ease: 'power3.out', scrollTrigger: { trigger: sec, start: 'top 75%', once: true } });
    return;
  }
  const track = $('[data-track]', sec);
  const viewport = $('.gallery-viewport', sec);
  const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth + parseFloat(getComputedStyle(viewport).paddingLeft) * 2);
  const tween = gsap.to(track, {
    x: () => -dist(), ease: 'none',
    scrollTrigger: {
      trigger: $('.gallery-pin', sec), pin: true, start: 'top top',
      // A longer runway than the travel itself, so the row drifts rather than flicks past.
      end: () => '+=' + Math.max(dist() * 1.6, innerHeight * 0.9), scrub: 1, anticipatePin: 1, invalidateOnRefresh: true,
    },
  });
  // Each frame eases in from a slight tilt as it crosses the screen.
  items.forEach((it) => {
    gsap.fromTo($('figure', it), { rotateY: -14, z: -80, transformPerspective: 1200 }, {
      rotateY: 0, z: 0, ease: 'none',
      scrollTrigger: { trigger: it, containerAnimation: tween, start: 'left 100%', end: 'left 55%', scrub: true },
    });
  });
}

function setupReleases(sec) {
  const lines = $$('.sky-lines line', sec);
  const svg = $('.sky-svg', sec);
  ScrollTrigger.create({
    trigger: $('[data-constellation]', sec), start: 'top 75%', once: true,
    onEnter: () => {
      // Lines use non-scaling strokes, so dash lengths are in screen pixels.
      const scale = svg.getBoundingClientRect().width / 560;
      lines.forEach((l) => {
        const len = Math.hypot(l.x2.baseVal.value - l.x1.baseVal.value, l.y2.baseVal.value - l.y1.baseVal.value) * scale;
        gsap.set(l, { strokeDasharray: len, strokeDashoffset: len });
      });
      gsap.timeline()
        .from($$('.sky-field circle', sec), { autoAlpha: 0, duration: 1.4, stagger: { amount: 1.2, from: 'random' } }, 0)
        .from($$('.sky-stars circle:not(.halo)', sec), { scale: 0, transformOrigin: '50% 50%', duration: 1, stagger: 0.07, ease: 'back.out(3)' }, 0.2)
        .to(lines, { strokeDashoffset: 0, duration: 1.1, stagger: 0.09, ease: 'power2.inOut', onComplete() { gsap.set(this.targets(), { clearProps: 'strokeDasharray,strokeDashoffset' }); } }, 0.5)
        .from($$('.sky-neb, .sky-sword', sec), { autoAlpha: 0, duration: 1.4 }, 1.1);
    },
  });
  // Halos breathe at their own pace, while the sky is on screen.
  const halos = $$('.sky-stars .halo', sec).map((h) => gsap.to(h, {
    opacity: 0.2 + Math.random() * 0.2, duration: 1.6 + Math.random() * 2.2, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: Math.random() * 2, paused: true,
  }));
  ScrollTrigger.create({
    trigger: $('[data-constellation]', sec), start: 'top bottom', end: 'bottom top',
    onToggle: (st) => halos.forEach((t) => (st.isActive ? t.play() : t.pause())),
  });
  ScrollTrigger.create({
    trigger: relList, start: 'top 82%', once: true,
    onEnter: () => gsap.from($$('.rel-bar i', relList), { scaleX: 0, duration: 1.2, ease: 'expo.out', stagger: 0.035 }),
  });
}

function setupGet(sec) {
  ScrollTrigger.create({
    trigger: sec, start: 'top bottom', end: 'top 15%',
    onUpdate: (st) => { stage.get = st.progress; },
  });
}

function setupHover() {
  if (!finePointer) return;
  $$('[data-magnetic]').forEach((el) => {
    const x = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'power3.out' });
    const y = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      x((e.clientX - r.left - r.width / 2) * 0.22);
      y((e.clientY - r.top - r.height / 2) * 0.32);
    });
    el.addEventListener('pointerleave', () => { x(0); y(0); });
  });
  $$('[data-tilt]').forEach((el) => {
    gsap.set(el, { transformPerspective: 900 });
    const rx = gsap.quickTo(el, 'rotateX', { duration: 0.8, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotateY', { duration: 0.8, ease: 'power3.out' });
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      rx(-((e.clientY - r.top) / r.height - 0.5) * 9);
      ry(((e.clientX - r.left) / r.width - 0.5) * 9);
    });
    el.addEventListener('pointerleave', () => { rx(0); ry(0); });
  });
}

// The canvas fades out while the long middle of the page scrolls by, and stops drawing
// once the fade is done or while the light panel covers it.
const hold = { dim: false, covered: false };
let holdTimer = 0;
function syncScene() {
  $('#scene').classList.toggle('is-dim', hold.dim);
  clearTimeout(holdTimer);
  if (hold.dim || hold.covered) holdTimer = setTimeout(() => scene?.setActive(false), 800);
  else scene?.setActive(true);
}

function setupStage() {
  ScrollTrigger.create({
    trigger: '.hero', start: 'top top', end: 'bottom top',
    onUpdate: (st) => { stage.hero = st.progress; },
  });
  ScrollTrigger.create({
    trigger: '#inside', start: 'top 55%',
    endTrigger: '#get', end: 'top 75%',
    onToggle: (st) => { hold.dim = st.isActive; syncScene(); },
  });
}

if (motion) {
  const mm = gsap.matchMedia();
  // Phones pin too when they're tall enough to hold a pinned step; short ones keep the stacked layout.
  mm.add({ desktop: '(min-width: 960px)', mobile: '(max-width: 959px)', tall: '(min-height: 600px)' }, (ctx) => {
    const { desktop, tall } = ctx.conditions;
    const pinned = desktop || tall;
    const cleanups = [];
    // Built in page order so every trigger sees the pin spacing above it.
    for (const sec of $$('#main > section')) {
      if (sec.classList.contains('hero')) heroIntro(sec);
      else revealGeneric(sec);
      if (sec.id === 'subtraction') setupSubtraction(sec);
      if (sec.id === 'how') cleanups.push(setupHow(sec, desktop, pinned));
      if (sec.id === 'inside') cleanups.push(setupPhone(sec, desktop, pinned));
      if (sec.id === 'film') setupFilm(sec);
      if (sec.id === 'gallery') setupGallery(sec, desktop);
      if (sec.id === 'releases') setupReleases(sec);
      if (sec.id === 'get') setupGet(sec);
    }
    setupStage();
    return () => {
      cleanups.forEach((fn) => fn && fn());
      // The new layout's triggers set these again if they still apply.
      hold.dim = hold.covered = false;
      syncScene();
    };
  });
  setupHover();

  const refresh = () => ScrollTrigger.refresh();
  document.fonts?.ready.then(refresh);
  addEventListener('load', refresh, { once: true });
  // Images that load late change heights (rows, gallery).
  $$('main img[loading="lazy"]').forEach((img) => img.addEventListener('load', () => {
    clearTimeout(refresh.t); refresh.t = setTimeout(refresh, 200);
  }, { once: true }));
}

/* ---------------------------------------------------------------- WebGL scene and live data */

if (webgl) {
  const start = () => import('./scene.js')
    .then((m) => m.init($('#scene'), stage))
    .then((s) => { scene = s; if (hold.dim || hold.covered) s.setActive(false); })
    .catch((err) => {
      console.warn('[orion] scene unavailable:', err);
      root.classList.remove('webgl');
      ScrollTrigger.refresh();
    });
  // Let the hero text paint first; the poster logo covers until the scene is ready.
  requestAnimationFrame(() => setTimeout(start, 120));

  // The support objects load when the section is a couple of screens away.
  const support = $('#support');
  if (support) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      import('./gifts.js')
        .then((m) => m.init(support))
        .catch((err) => {
          console.warn('[orion] support objects unavailable:', err);
          root.classList.remove('gifts');
          ScrollTrigger.refresh();
        });
    }, { rootMargin: '150% 0px' });
    io.observe(support);
  }
}

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
idle(() => import('./live.js').then((m) => m.run()).catch((err) => console.warn('[orion] live data unavailable:', err)), { timeout: 3000 });

// Exposed for debugging in the console.
window.__orion = { stage, get scene() { return scene; }, lenis, clamp };
