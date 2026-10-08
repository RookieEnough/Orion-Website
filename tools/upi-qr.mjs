// Writes media/brand/upi-qr.svg: the UPI payment code, drawn in the site's own
// hand instead of as plain squares. Modules flow into one another, the three
// finder eyes are rounded with the corner facing the centre kept tight, the ink
// is a deep indigo, and the Orion mark sits in a cleared centre. Error correction
// is level H, so the cleared centre costs a fraction of what the code can lose.
//
// Needs the `qrcode` package, which the site itself doesn't ship. Point
// QRCODE_FROM at any folder whose node_modules has it:
//   QRCODE_FROM=/path/to/tools/ node tools/upi-qr.mjs
// Always scan the result with a phone before publishing a new one.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(process.env.QRCODE_FROM ? new URL('file:///' + process.env.QRCODE_FROM.replace(/\\/g, '/').replace(/\/?$/, '/')) : import.meta.url);
const QRCode = require('qrcode');

const DATA = 'upi://pay?pa=rookiez@ptyes&pn=RookieZ&cu=INR';
const qr = QRCode.create(DATA, { errorCorrectionLevel: 'H' });
const N = qr.modules.size;
const bits = qr.modules.data;
const M = 1; // quiet zone in modules; the plate's padding in site.css adds the rest

// The finder eyes are drawn on their own, and the centre is cleared for the mark.
const eyes = [[0, 0], [N - 7, 0], [0, N - 7]];
const inEye = (x, y) => eyes.some(([ex, ey]) => x >= ex && x < ex + 7 && y >= ey && y < ey + 7);
const HOLE = Math.round(N * 0.25) | 1; // odd, so it centres on a module
const h0 = (N - HOLE) / 2;
const inHole = (x, y) => x >= h0 && x < h0 + HOLE && y >= h0 && y < h0 + HOLE;
const on = (x, y) => x >= 0 && y >= 0 && x < N && y < N && bits[y * N + x] === 1 && !inEye(x, y) && !inHole(x, y);

const f = (n) => +n.toFixed(3);
const R = 0.5; // outer corners: a lone module becomes a dot
const F = 0.3; // inner corners: a small fillet where a run turns
const E = 0.02; // overlap between touching modules, so no hairline seams show

// A rect with its own radius at each corner (tl, tr, br, bl), clockwise.
function rrect(x, y, w, h, [tl, tr, br, bl]) {
  const p = [`M${f(x + tl)} ${f(y)}`, `H${f(x + w - tr)}`];
  if (tr) p.push(`A${tr} ${tr} 0 0 1 ${f(x + w)} ${f(y + tr)}`);
  p.push(`V${f(y + h - br)}`);
  if (br) p.push(`A${br} ${br} 0 0 1 ${f(x + w - br)} ${f(y + h)}`);
  p.push(`H${f(x + bl)}`);
  if (bl) p.push(`A${bl} ${bl} 0 0 1 ${f(x)} ${f(y + h - bl)}`);
  p.push(`V${f(y + tl)}`);
  if (tl) p.push(`A${tl} ${tl} 0 0 1 ${f(x + tl)} ${f(y)}`);
  return p.join('') + 'Z';
}

let body = '';
for (let y = 0; y < N; y++) {
  for (let x = 0; x < N; x++) {
    if (on(x, y)) {
      const l = on(x - 1, y), r = on(x + 1, y), t = on(x, y - 1), b = on(x, y + 1);
      body += rrect(x, y, 1 + (r ? E : 0), 1 + (b ? E : 0), [
        !l && !t ? R : 0, !r && !t ? R : 0, !r && !b ? R : 0, !l && !b ? R : 0,
      ]);
    } else if (!inEye(x, y) && !inHole(x, y)) {
      // A light module boxed in on two sides by a turning run gets a fillet in that corner.
      const fillet = (cx, cy, dx, dy) => {
        if (!(on(x + dx, y) && on(x, y + dy) && on(x + dx, y + dy))) return '';
        const sx = dx < 0 ? 1 : -1, sy = dy < 0 ? 1 : -1;
        const sweep = dx * dy > 0 ? 0 : 1;
        return `M${cx} ${cy}H${f(cx + sx * F)}A${F} ${F} 0 0 ${sweep} ${cx} ${f(cy + sy * F)}Z`;
      };
      body += fillet(x, y, -1, -1) + fillet(x + 1, y, 1, -1) + fillet(x + 1, y + 1, 1, 1) + fillet(x, y + 1, -1, 1);
    }
  }
}

// Eyes: a rounded ring and a rounded pupil, each with the corner that points at
// the centre of the code drawn tight.
let rings = '', pupils = '';
for (const [ex, ey] of eyes) {
  const toward = ex === 0 && ey === 0 ? 2 : ex === 0 ? 1 : 3; // index of the corner facing the centre
  const radii = (big, small) => [0, 1, 2, 3].map((i) => (i === toward ? small : big));
  rings += rrect(ex, ey, 7, 7, radii(2.4, 0.7)) + rrect(ex + 1, ey + 1, 5, 5, radii(1.5, 0.3));
  pupils += rrect(ex + 2, ey + 2, 3, 3, radii(1.15, 0.3));
}

// The Orion mark (media/brand/orion-logo.svg), on a white tile in the cleared centre.
const tile = HOLE - 0.6, mark = HOLE - 2;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${N + M * 2} ${N + M * 2}" width="${(N + M * 2) * 8}" height="${(N + M * 2) * 8}">
<title>UPI: rookiez@ptyes</title>
<defs>
<linearGradient id="ink" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${N}" y2="${N}"><stop offset="0" stop-color="#121338"/><stop offset=".55" stop-color="#22246a"/><stop offset="1" stop-color="#3337a6"/></linearGradient>
<linearGradient id="eye" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a4ed6"/><stop offset="1" stop-color="#2d309a"/></linearGradient>
<linearGradient id="mark" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b7fe8"/><stop offset="1" stop-color="#5b5fde"/></linearGradient>
</defs>
<path fill="url(#ink)" d="${body}"/>
<path fill="#101132" fill-rule="evenodd" d="${rings}"/>
<path fill="url(#eye)" d="${pupils}"/>
<rect x="${f(h0 + 0.3)}" y="${f(h0 + 0.3)}" width="${f(tile)}" height="${f(tile)}" rx="${f(tile * 0.26)}" fill="#fff"/>
<g transform="translate(${f(h0 + 1)} ${f(h0 + 1)}) scale(${f(mark / 1024)})">
<rect width="1024" height="1024" rx="226" fill="url(#mark)"/>
<g fill="#fff"><path d="M506 253.2A30 30 0 0 1 557.2 257.3L666.3 475.7A30 30 0 0 1 638.4 519.1L378.9 509.1A30 30 0 0 1 355.7 461.6Z"/><circle cx="339.5" cy="679.5" r="140"/><rect x="500" y="550" width="250" height="250" rx="30"/></g>
</g>
</svg>
`;

const out = new URL('../media/brand/upi-qr.svg', import.meta.url);
writeFileSync(out, svg);
console.log(`upi-qr.svg: version ${qr.version}, ${N} modules, level H, centre ${HOLE}x${HOLE} cleared, ${(svg.length / 1024).toFixed(1)} KB`);
