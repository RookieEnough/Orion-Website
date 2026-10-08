// The support section's objects: a fluted cutting-chai glass for UPI, a
// dip-glazed mug for Ko-fi, a proof-finish coin for PayPal and a star for the
// free ways to help. They stand on the support section's counter, the lit edge
// site.css draws under each `.stage`. One transparent canvas sits over the page
// and each object is drawn into its own viewport around its `.gift`, so the
// layout stays in CSS and an object can leave its box (dropping in, the coin
// toss).
//
// When a bay fades up, its object is dropped onto the counter.
//
// Everything is premultiplied: glass and steam write only their highlights, so
// the counter's light shows through them.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Group, Mesh, Points,
  MeshPhysicalMaterial, ShaderMaterial,
  ExtrudeGeometry, Shape, PlaneGeometry, BufferGeometry,
  LatheGeometry, CylinderGeometry, TorusGeometry, CircleGeometry,
  Float32BufferAttribute, DirectionalLight, PointLight,
  Vector2, MathUtils, CanvasTexture, RepeatWrapping,
  SRGBColorSpace, NeutralToneMapping, DoubleSide,
} from '../vendor/three.subset.min.js';
import { studio } from './studio.js';

const FOV = 24;
const TAU = Math.PI * 2;
const VIEW_H = 2.35; // a stage's height, in world units
const ELEV = 0.2; // camera pitch, radians: a product shot from just above the table
const FLOOR = -0.82; // where every object stands; 15.1% up its stage, as site.css assumes

const damp = (dt, k) => 1 - Math.exp(-dt * k);
const smooth = (t) => t * t * (3 - 2 * t);
const ease3 = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A damped spring. Low damping overshoots a little, which is the point.
class Spring {
  constructor(x = 0, k = 90, c = 12) { this.x = x; this.t = x; this.v = 0; this.k = k; this.c = c; }
  step(dt) {
    for (let n = Math.ceil(dt / (1 / 120)), h = dt / n; n > 0; n--) {
      this.v += ((this.t - this.x) * this.k - this.v * this.c) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

// Height above its resting spot, under gravity, bouncing until it settles.
// step() returns the impact speed on the frame it touches down, else 0.
class Drop {
  constructor(y = 0, g = 26, bounce = 0.32) { this.y = y; this.v = 0; this.g = g; this.b = bounce; this.done = y <= 0; }
  hop(v) { this.v = v; this.done = false; }
  step(dt) {
    if (this.done) return 0;
    this.v -= this.g * dt;
    this.y += this.v * dt;
    if (this.y > 0) return 0;
    const hit = -this.v;
    this.y = 0;
    this.v = hit * this.b;
    if (this.v < 0.6) { this.v = 0; this.done = true; }
    return hit;
  }
}

/* ---------------------------------------------------------------- Materials */

// Glass: write highlights only. Alpha follows brightness, with a faint floor so
// clear glass still darkens what's behind it a touch. Reflections go neutral, or
// the studio's blue strip reads as a blue tint over the whole body.
function screenLike(mat, floor = 0.04) {
  Object.assign(mat, { transparent: true, premultipliedAlpha: true, depthWrite: false });
  mat.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>
      gl_FragColor.rgb = vec3(dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114)));
      gl_FragColor.a = clamp(max(max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b) * 1.08, ${floor.toFixed(3)}), 0.0, 1.0);`);
  };
  mat.customProgramCacheKey = () => 'screen' + floor;
  return mat;
}

const VS_UV = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function shadowMesh(w, d) {
  const m = new Mesh(new PlaneGeometry(1, 1), new ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    uniforms: { uA: { value: 0.5 } },
    vertexShader: VS_UV,
    fragmentShader: /* glsl */`
      uniform float uA;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        // Lighter and softer-edged than a real contact shadow so it melts into the page.
        float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.4) * uA * 0.5;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
  }));
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.renderOrder = -1;
  return m;
}

// Rising steam: a few wavering ribbons of noise.
function steam(count, spread, height) {
  const g = new Group();
  const mats = [];
  for (let i = 0; i < count; i++) {
    const mat = new ShaderMaterial({
      transparent: true, premultipliedAlpha: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSeed: { value: i * 7.31 + 1.7 } },
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uSeed;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          float y = uv.y;
          p.x += (sin(y * 4.6 - uTime * 1.25 + uSeed) * 0.13 + sin(y * 9.0 - uTime * 2.2 + uSeed * 1.7) * 0.04) * y;
          p.z += cos(y * 3.4 - uTime + uSeed) * 0.06 * y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime;
        uniform float uAmt;
        uniform float uSeed;
        varying vec2 vUv;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          vec2 q = vec2(vUv.x * 2.2, vUv.y * 2.6 - uTime * 0.42) + uSeed;
          float f = n(q) * 0.6 + n(q * 2.1 + 3.1) * 0.3 + n(q * 4.3 - 1.3) * 0.1;
          float edge = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
          float fade = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.4, vUv.y);
          float a = smoothstep(0.38, 0.85, f) * edge * fade * uAmt * 0.42;
          gl_FragColor = vec4(vec3(0.95, 0.94, 1.0) * a, a);
        }`,
    });
    const m = new Mesh(new PlaneGeometry(0.36, height, 1, 28), mat);
    m.geometry.translate(0, height / 2, 0);
    m.position.set((i - (count - 1) / 2) * spread, 0, (i % 2) * 0.06 - 0.03);
    m.renderOrder = 4;
    g.add(m);
    mats.push(mat);
  }
  g.userData.mats = mats;
  return g;
}

/* ---------------------------------------------------------------- Textures */

function canvas(w, h = w) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  return [c, c.getContext('2d')];
}

function tex(c, srgb = true) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function frothTexture() {
  const [c, g] = canvas(256);
  const r = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  r.addColorStop(0, '#e2b27a');
  r.addColorStop(0.7, '#cf9a61');
  r.addColorStop(1, '#a8703f');
  g.fillStyle = r;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * 118;
    g.fillStyle = `rgba(255, 236, 205, ${0.08 + Math.random() * 0.22})`;
    g.beginPath();
    g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0.6 + Math.random() * 2.4, 0, TAU);
    g.fill();
  }
  return tex(c);
}

function latteTexture() {
  const [c, g] = canvas(512);
  const r = g.createRadialGradient(256, 256, 20, 256, 256, 256);
  r.addColorStop(0, '#a7693a');
  r.addColorStop(0.62, '#7d4a26');
  r.addColorStop(0.9, '#5a321a');
  r.addColorStop(1, '#3e2210');
  g.fillStyle = r;
  g.fillRect(0, 0, 512, 512);
  // The heart, poured: soft edges and a pull-through tail.
  g.save();
  g.filter = 'blur(3px)';
  g.translate(256, 262);
  g.scale(300, 300);
  g.fillStyle = '#f6eadb';
  g.beginPath();
  g.moveTo(0, 0.34);
  g.bezierCurveTo(-0.62, -0.02, -0.4, -0.62, 0, -0.27);
  g.bezierCurveTo(0.4, -0.62, 0.62, -0.02, 0, 0.34);
  g.fill();
  g.restore();
  g.save();
  g.filter = 'blur(1.5px)';
  g.strokeStyle = '#f6eadb';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(256, 340);
  g.quadraticCurveTo(254, 380, 256, 420);
  g.stroke();
  g.restore();
  return tex(c);
}

// The mug's glaze: dipped rim-first in indigo, so it covers the lip and runs down
// the outside in a few drips, pooling darker where it stops. The inside stays cream.
function glazeTexture(vEdge, vInner) {
  const W = 512, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = '#f3f1f8';
  g.fillRect(0, 0, W, H);
  // Each run is a narrow column with a rounded, slightly swollen tip, flaring
  // where it leaves the glaze line.
  const drips = Array.from({ length: 9 }, (_, i) => [((i + Math.random() * 0.6) / 9) * W, 5 + Math.random() * 6, 10 + Math.random() * 34]);
  for (let x = 0; x < W; x++) {
    let v0 = vEdge + Math.sin(x / W * TAU * 3 + 0.6) * 0.008 + Math.sin(x / W * TAU * 7) * 0.004;
    let run = 0;
    for (const [dx, w, len] of drips) {
      let d = Math.abs(x - dx);
      d = Math.min(d, W - d);
      const col = d < w ? len * Math.sqrt(1 - (d / w) ** 2) ** 0.35 : 0;
      const flare = d < w * 3 ? 4 * smooth(1 - d / (w * 3)) : 0;
      run = Math.max(run, col + flare);
    }
    v0 -= run / H;
    const v1 = vInner + Math.sin(x / W * TAU * 2) * 0.006;
    const y0 = (1 - v0) * H, y1 = (1 - v1) * H;
    const grd = g.createLinearGradient(0, y1, 0, y0);
    grd.addColorStop(0, '#5357db');
    grd.addColorStop(0.55, '#4448c9');
    grd.addColorStop(0.92, '#3a3db4');
    grd.addColorStop(1, '#25278a');
    g.fillStyle = grd;
    g.fillRect(x, y1, 1, y0 - y1);
  }
  return tex(c);
}

// A proof coin: mirror field, frosted relief. One canvas each for colour, bump and roughness.
function coinTextures() {
  const S = 512, R = S / 2;
  const mk = () => canvas(S);
  const [cc, cg] = mk(), [bc, bg] = mk(), [rc, rg] = mk();
  const markPaths = [
    new Path2D('M506 253.2A30 30 0 0 1 557.2 257.3L666.3 475.7A30 30 0 0 1 638.4 519.1L378.9 509.1A30 30 0 0 1 355.7 461.6Z'),
  ];
  const draw = (g, field, relief, blur) => {
    g.fillStyle = field;
    g.fillRect(0, 0, S, S);
    g.save();
    g.filter = blur ? `blur(${blur}px)` : 'none';
    g.fillStyle = relief;
    g.strokeStyle = relief;
    // Rim.
    g.lineWidth = R * 0.085;
    g.beginPath(); g.arc(R, R, R * 0.955, 0, TAU); g.stroke();
    // Beads.
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      g.beginPath(); g.arc(R + Math.cos(a) * R * 0.85, R + Math.sin(a) * R * 0.85, R * 0.012, 0, TAU); g.fill();
    }
    // Legend around the inside of the rim.
    const text = 'ORION STORE · FREE AND OPEN SOURCE · ';
    g.font = `600 ${R * 0.085}px "Space Grotesk", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const step = TAU / text.length;
    for (let i = 0; i < text.length; i++) {
      const a = -Math.PI / 2 + i * step;
      g.save();
      g.translate(R + Math.cos(a) * R * 0.72, R + Math.sin(a) * R * 0.72);
      g.rotate(a + Math.PI / 2);
      g.fillText(text[i], 0, 0);
      g.restore();
    }
    // The mark.
    g.save();
    g.translate(R, R * 1.0);
    const s = (R * 0.86) / 580;
    g.scale(s, s);
    g.translate(-475, -530);
    markPaths.forEach((p) => g.fill(p));
    g.beginPath(); g.arc(339.5, 679.5, 140, 0, TAU); g.fill();
    g.beginPath(); g.roundRect(500, 550, 250, 250, 30); g.fill();
    g.restore();
    g.restore();
  };
  draw(cg, '#dcb062', '#fbe4a6', 0);
  draw(bg, '#3a3a3a', '#ffffff', 2.2);
  draw(rg, '#626262', '#c4c4c4', 0.6);
  const map = tex(cc), bump = tex(bc, false), rough = tex(rc, false);
  // Reeded edge.
  const [ec, eg] = canvas(1024, 8);
  for (let x = 0; x < 1024; x++) {
    const v = 0.5 + 0.5 * Math.cos((x / 1024) * TAU * 84);
    const k = 60 + v * 190 | 0;
    eg.fillStyle = `rgb(${k},${k},${k})`;
    eg.fillRect(x, 0, 1, 8);
  }
  const edge = tex(ec, false);
  edge.wrapS = RepeatWrapping;
  return { map, bump, rough, edge };
}

/* ---------------------------------------------------------------- Objects */

// Recompute normals, then make the lathe seam (first and last column) agree.
function smoothLathe(geo, segments, points) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal;
  for (let j = 0; j < points; j++) {
    const a = j, b = segments * points + j;
    const x = (n.getX(a) + n.getX(b)) / 2, y = (n.getY(a) + n.getY(b)) / 2, z = (n.getZ(a) + n.getZ(b)) / 2;
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l);
    n.setXYZ(b, x / l, y / l, z / l);
  }
}

function makeChai(mobile) {
  const root = new Group();
  const body = new Group();
  root.add(body);
  body.position.y = FLOOR;

  // Outer wall, rim, inner wall, a thick base. Inner radius is linear in height.
  const ro = (y) => 0.505 + (y - 0.1) * (0.12 / 1.46);
  const ri = (y) => 0.455 + (y - 0.12) * (0.115 / 1.44);
  const P = [
    [0, 0], [0.4, 0], [0.47, 0.008], [0.5, 0.04], [ro(0.1), 0.1],
    ...[0.3, 0.6, 0.9, 1.2, 1.45].map((y) => [ro(y), y]),
    [0.628, 1.56], [0.623, 1.588], [0.608, 1.6], [0.593, 1.59], [0.585, 1.56],
    ...[1.4, 1.1, 0.8, 0.5, 0.25, 0.15].map((y) => [ri(y), y]),
    [0.43, 0.12], [0, 0.12],
  ].map(([x, y]) => new Vector2(x, y));
  const SEG = mobile ? 90 : 150, RIBS = 15;
  const glassGeo = new LatheGeometry(P, SEG);
  // Flutes up most of the height, fading out under a plain band at the lip.
  const pos = glassGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const w = smooth(MathUtils.clamp((y - 0.02) / 0.08, 0, 1)) * (1 - smooth(MathUtils.clamp((y - 1.05) / 0.2, 0, 1)));
    const k = 1 + 0.032 * Math.cos(Math.atan2(z, x) * RIBS) * w;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  smoothLathe(glassGeo, SEG, P.length);
  const glass = new Mesh(glassGeo, screenLike(new MeshPhysicalMaterial({
    color: '#000000', roughness: 0.04, metalness: 0,
    specularIntensity: 1, specularColor: new Color('#eafff6'),
    clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 2.6, side: DoubleSide,
  }), 0.05));
  glass.renderOrder = 3;

  // The chai: an open cylinder whose top ring follows the fill, plus a frothy top.
  const liquidGeo = new CylinderGeometry(1, 1, 1, 64, 1, true);
  liquidGeo.translate(0, 0.5, 0);
  const lp = liquidGeo.attributes.position;
  const ring = [];
  for (let i = 0; i < lp.count; i++) ring.push([lp.getX(i), lp.getY(i) > 0.5, lp.getZ(i)]);
  const liquid = new Mesh(liquidGeo, new MeshPhysicalMaterial({
    color: '#c4894f', roughness: 0.3, sheen: 0.6, sheenColor: new Color('#ffcf9a'), sheenRoughness: 0.5, envMapIntensity: 0.9,
  }));
  liquid.frustumCulled = false;
  const top = new Mesh(new CircleGeometry(1, 64), new MeshPhysicalMaterial({
    map: frothTexture(), roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.9,
  }));
  top.rotation.x = -Math.PI / 2;
  const BASE = 0.125, FULL = 1.32;
  function setFill(f) {
    const y = BASE + (FULL - BASE) * f;
    const r1 = ri(y) - 0.022, r0 = ri(BASE) - 0.022;
    for (let i = 0; i < lp.count; i++) {
      const [x, isTop, z] = ring[i];
      const r = isTop ? r1 : r0;
      lp.setXYZ(i, x * r, isTop ? y : BASE, z * r);
    }
    lp.needsUpdate = true;
    top.position.y = y;
    top.scale.setScalar(r1);
    liquid.visible = top.visible = f > 0.01;
  }
  setFill(0);

  const vapour = steam(3, 0.17, 1.5);
  vapour.position.y = 1.4;
  body.add(liquid, top, glass, vapour);
  const shadow = shadowMesh(1.7, 1.15);
  shadow.position.y = FLOOR - 0.01;
  root.add(shadow);

  // Dropped in empty, it lands, and is then poured. Hovered, it hops and turns.
  const pop = new Spring(0, 170, 15);
  const drop = new Drop(1.3);
  const squash = new Spring(0, 420, 18);
  const fill = new Spring(0, 9, 5.2);
  const wobble = new Spring(0, 160, 7);
  const twirl = new Spring(0, 40, 8.5);
  let spin = 0, landedAt = -1, wants = false;

  return {
    root,
    update(t, dt, s) {
      root.visible = s.since >= 0;
      if (!root.visible) return 0;
      pop.t = 1;
      const k = Math.max(0.001, pop.step(dt));
      const hit = drop.step(dt);
      if (hit) {
        squash.v -= hit * 0.16;
        wobble.v += hit * 0.3;
        if (landedAt < 0) landedAt = s.since;
      }
      if (landedAt >= 0 && s.since - landedAt > 0.2) fill.t = 1;
      if (s.hoverIn) { wants = true; wobble.v += 1.6; }
      if (wants && drop.done && landedAt >= 0 && s.since - landedAt > 0.8) {
        wants = false;
        drop.hop(3.4);
        twirl.t += TAU;
      }
      const f = MathUtils.clamp(fill.step(dt), 0, 1.04);
      setFill(Math.min(f, 1));
      const q = squash.step(dt), w = wobble.step(dt);
      body.scale.set(k * (1 - q * 0.6), k * (1 + q), k * (1 - q * 0.6));
      body.position.y = FLOOR + drop.y;
      spin += dt * (0.18 + s.h * 0.5);
      body.rotation.y = spin * 0.35 + twirl.step(dt) + s.py * 0.9 - (1 - Math.min(k, 1)) * 1.2;
      body.rotation.z = w * 0.09 + s.tilt * 0.06;
      body.rotation.x = s.px * 0.18;
      top.rotation.z = spin * 1.2;
      for (const m of vapour.userData.mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uAmt.value += ((0.7 + s.h * 0.6) * smooth(MathUtils.clamp((f - 0.6) / 0.4, 0, 1)) - m.uniforms.uAmt.value) * damp(dt, 2);
      }
      vapour.rotation.y = -body.rotation.y;
      vapour.position.y = 0.125 + (FULL - 0.125) * Math.min(f, 1) + 0.02;
      // The shadow is there before the glass lands, tightening as it falls.
      const air = drop.y;
      shadow.material.uniforms.uA.value = 0.62 * Math.min(k, 1) / (1 + air * 2);
      shadow.scale.set(1.7 * (1 + air * 0.35), 1.15 * (1 + air * 0.35), 1);
      return hit;
    },
  };
}

function makeMug(mobile) {
  const root = new Group();
  const body = new Group();
  root.add(body);
  body.position.y = FLOOR;

  const P = [
    [0, 0], [0.5, 0], [0.56, 0.025], [0.6, 0.09], [0.615, 0.2],
    ...[0.4, 0.6, 0.8, 1.0, 1.18].map((y) => [0.62 + (y - 0.2) * 0.012, y]),
    [0.636, 1.26], [0.625, 1.3], [0.6, 1.305], [0.578, 1.285], [0.572, 1.24],
    ...[1.05, 0.8, 0.55, 0.3].map((y) => [0.56 + (y - 0.2) * 0.012, y]),
    [0.54, 0.16], [0.47, 0.13], [0, 0.13],
  ].map(([x, y]) => new Vector2(x, y));
  const SEG = mobile ? 64 : 96;
  const geo = new LatheGeometry(P, SEG);
  // The lathe's v runs along the profile by point index: the glaze stops about
  // halfway down the outside (point 6.4) and just inside the lip (point 14.6).
  const vEdge = 6.4 / (P.length - 1), vInner = 14.6 / (P.length - 1);
  smoothLathe(geo, SEG, P.length);
  const ceramic = new MeshPhysicalMaterial({
    map: glazeTexture(vEdge, vInner), roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06,
    sheen: 0.4, sheenColor: new Color('#c9cbff'), envMapIntensity: 1.4,
  });
  const cup = new Mesh(geo, ceramic);

  const ARC = Math.PI * 1.2;
  const handle = new Mesh(new TorusGeometry(0.31, 0.072, mobile ? 14 : 20, mobile ? 36 : 56, ARC), new MeshPhysicalMaterial({
    color: '#f3f1f8', roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.06, sheen: 0.4, sheenColor: new Color('#c9cbff'), envMapIntensity: 1.15,
  }));
  handle.rotation.z = -ARC / 2;
  handle.position.set(0.66, 0.7, 0);

  const coffee = new Mesh(new CircleGeometry(0.566, 64), new MeshPhysicalMaterial({
    map: latteTexture(), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.8,
  }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = 1.16;

  const vapour = steam(3, 0.16, 1.45);
  vapour.position.y = 1.2;
  body.add(cup, handle, coffee, vapour);
  const shadow = shadowMesh(2, 1.2);
  shadow.position.y = FLOOR - 0.01;
  root.add(shadow);

  const pop = new Spring(0, 170, 15);
  const drop = new Drop(1.2);
  const squash = new Spring(0, 420, 18);
  const rock = new Spring(0, 150, 8);
  const turn = new Spring(0, 70, 10);
  let landed = 0;
  return {
    root,
    update(t, dt, s) {
      root.visible = s.since >= 0;
      if (!root.visible) return 0;
      pop.t = 1;
      const k = Math.max(0.001, pop.step(dt));
      const hit = drop.step(dt);
      if (hit) { squash.v -= hit * 0.14; rock.v += hit * 0.25; landed = 1; }
      turn.t = landed * s.h;
      const h = turn.step(dt);
      const q = squash.step(dt), r = rock.step(dt);
      // At rest the handle points back over the shoulder; on hover it swings round
      // and the mug lifts as if raised for a toast.
      body.scale.set(k * (1 - q * 0.6), k * (1 + q), k * (1 - q * 0.6));
      body.rotation.y = -0.95 + h * 1.2 + s.py * 0.8 + Math.sin(t * 0.5) * 0.08 - (1 - Math.min(k, 1)) * 1.4;
      body.rotation.z = -h * 0.12 + s.tilt * 0.05 + r * 0.08;
      body.rotation.x = s.px * 0.16 + h * 0.08;
      const lift = drop.y + h * (0.2 + Math.sin(t * 1.1) * 0.015);
      body.position.y = FLOOR + lift;
      coffee.rotation.z = -body.rotation.y + 0.95; // keep the heart facing out
      for (const m of vapour.userData.mats) {
        m.uniforms.uTime.value = t;
        m.uniforms.uAmt.value += ((0.75 + h * 0.5) * landed - m.uniforms.uAmt.value) * damp(dt, 2);
      }
      vapour.rotation.y = -body.rotation.y;
      shadow.material.uniforms.uA.value = 0.6 * Math.min(k, 1) / (1 + lift * 2);
      shadow.scale.set(2 * (1 + lift * 0.3), 1.2 * (1 + lift * 0.3), 1);
      return hit;
    },
  };
}

function makeCoins(mobile) {
  const root = new Group();
  const T = coinTextures();
  const gold = { color: '#ffffff', metalness: 1, clearcoat: 0.25, clearcoatRoughness: 0.1, envMapIntensity: 1.5 };
  const face = new MeshPhysicalMaterial({ ...gold, map: T.map, roughness: 1, roughnessMap: T.rough, bumpMap: T.bump, bumpScale: 3 });
  const edge = new MeshPhysicalMaterial({ ...gold, color: '#e7c27a', roughness: 0.28, bumpMap: T.edge, bumpScale: 0.8 });
  const geo = new CylinderGeometry(1, 1, 0.13, mobile ? 96 : 160, 1);
  const coin = () => new Mesh(geo, [edge, face, face]);

  // A short stack on the table, slightly out of true. The coins are dropped onto
  // it one at a time, each spinning flat as it falls.
  const stack = new Group();
  const pile = [];
  for (let i = 0; i < 5; i++) {
    const c = coin();
    c.position.set(Math.sin(i * 2.4) * 0.04, i * 0.078, Math.cos(i * 1.7) * 0.04);
    c.rotation.set(Math.sin(i * 3.1) * 0.03, i * 0.9, Math.cos(i * 2.2) * 0.03);
    stack.add(c);
    pile.push({ c, y: c.position.y, ry: c.rotation.y, b: new Spring(0, 220, 9), d: new Drop(1.05 + i * 0.1, 26, 0.22), at: i * 0.12 });
  }
  stack.position.set(-0.54, FLOOR, 0.05);

  // The hero coin stands up and floats; it tosses on hover.
  const toss = new Group(), turn = new Group(), hero = coin();
  hero.rotation.x = Math.PI / 2;
  hero.scale.setScalar(0.6);
  turn.add(hero);
  toss.add(turn);
  toss.position.set(0.5, 0.06, 0);
  root.add(stack, toss);

  const shStack = shadowMesh(1.6, 1.0);
  shStack.position.set(-0.54, FLOOR - 0.01, 0.05);
  const shHero = shadowMesh(1.3, 0.55);
  shHero.position.set(0.5, FLOOR - 0.01, 0);
  root.add(shStack, shHero);

  // Once the stack is down the hero coin appears and is flipped straight away.
  const HERO_AT = 0.75;
  const heroPop = new Spring(0, 150, 13);
  const wob = new Spring(0, 150, 6);
  let tossAt = -10, dir = 1, now = 0, landed = true, flipped = false;
  const DUR = 1.15;
  const play = () => { if (now - tossAt > DUR + 0.25) { tossAt = now; dir = -dir; landed = false; } };
  return {
    root,
    update(t, dt, s) {
      now = t;
      root.visible = s.since >= 0;
      if (!root.visible) return 0;
      let hit = 0, down = 0;
      pile.forEach((p, i) => {
        const on = s.since >= p.at;
        p.c.visible = on;
        if (!on) return;
        const hh = p.d.step(dt);
        if (hh) {
          // Each coin lands on the stack and knocks the ones under it.
          hit = Math.max(hit, hh * 0.3);
          for (let j = 0; j <= i; j++) pile[j].b.v += hh * (j === i ? 0.12 : 0.06);
        }
        if (p.d.done) down++;
        p.c.scale.setScalar(0.58 * Math.min(1, 0.4 + (s.since - p.at) * 6));
        p.c.position.y = p.y + p.d.y + Math.max(-0.02, p.b.step(dt) * 0.03);
        p.c.rotation.y = p.ry + p.d.y * 2.6;
      });

      if (s.since >= HERO_AT) heroPop.t = 1;
      const hk = Math.max(0.001, heroPop.step(dt));
      toss.visible = s.since >= HERO_AT;
      hero.scale.setScalar(0.6 * hk);
      if (!flipped && s.since >= HERO_AT + 0.35) { flipped = true; play(); }
      if (s.hoverIn && flipped) play();
      const u = MathUtils.clamp((t - tossAt) / DUR, 0, 1);
      const air = u > 0 && u < 1;
      const lift = air ? 4 * u * (1 - u) : 0;
      toss.position.y = 0.06 + lift * 1.05 + (air ? 0 : Math.sin(t * 1.3) * 0.04);
      toss.rotation.x = ease3(u) * TAU * 2 * dir;
      if (u >= 1 && !landed) {
        // Caught: a wobble for the coin, a knock through the stack.
        landed = true;
        wob.v += 5;
        pile.forEach((p, i) => { p.b.v += 0.9 - i * 0.1; });
      }
      turn.rotation.y = Math.sin(t * 0.55) * 0.55 + s.py * 1.1 + wob.step(dt) * 0.25 + (1 - Math.min(hk, 1)) * 2;
      turn.rotation.z = s.tilt * 0.08;
      toss.rotation.z = Math.sin(t * 0.8) * 0.05;
      stack.rotation.y = s.py * 0.5;
      root.rotation.x = s.px * 0.12;
      shStack.material.uniforms.uA.value = 0.62 * Math.min(1, (down + 0.5) / pile.length);
      shHero.material.uniforms.uA.value = (0.32 - lift * 0.22) * Math.min(hk, 1);
      shHero.scale.set(1.3 + lift * 0.6, 0.55 + lift * 0.25, 1);
      return hit;
    },
  };
}

function starShape(R = 1, r = 0.47) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const d = i % 2 ? r : R;
    pts.push(new Vector2(Math.cos(a) * d, Math.sin(a) * d));
  }
  const s = new Shape();
  pts.forEach((p, i) => {
    const prev = pts[(i + 9) % 10], next = pts[(i + 1) % 10];
    const k = i % 2 ? 0.14 : 0.2; // softer points than inner corners
    const a = p.clone().lerp(prev, k), b = p.clone().lerp(next, k);
    if (i === 0) s.moveTo(a.x, a.y); else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  s.closePath();
  return s;
}

function sparkles(n) {
  const dir = new Float32Array(n * 3), seed = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u);
    dir.set([Math.cos(a) * q, u * 0.8, Math.sin(a) * q * 0.6], i * 3);
    seed[i] = Math.random();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(dir, 3));
  geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
  const mat = new ShaderMaterial({
    transparent: true, premultipliedAlpha: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uBurst: { value: 1 }, uPx: { value: 1 }, uE: { value: 0 } },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uBurst;
      uniform float uPx;
      attribute float aSeed;
      varying float vA;
      void main() {
        // Idle: a slow orbit close to the star. Burst: thrown outward, then gone.
        float b = 1.0 - pow(1.0 - uBurst, 3.0);
        float a = uTime * (0.25 + aSeed * 0.3) + aSeed * 6.2831;
        vec3 orbit = vec3(cos(a), sin(a * 1.3) * 0.7, sin(a) * 0.5) * (1.05 + aSeed * 0.35);
        vec3 p = mix(orbit, position * (1.2 + aSeed * 1.3), b * step(uBurst, 0.999));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.5 + 0.5 * sin(uTime * (1.4 + aSeed * 2.0) + aSeed * 30.0);
        float burst = uBurst < 0.999 ? (1.0 - uBurst) * 1.4 : 0.0;
        vA = max(tw * tw * 0.55 * step(0.62, aSeed), burst);
        gl_PointSize = uPx * (10.0 + aSeed * 12.0) * (6.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */`
      uniform float uE;
      varying float vA;
      void main() {
        vec2 p = gl_PointCoord - 0.5;
        float cross = max(exp(-abs(p.x) * 34.0) * exp(-abs(p.y) * 5.0), exp(-abs(p.y) * 34.0) * exp(-abs(p.x) * 5.0));
        float core = exp(-dot(p, p) * 60.0);
        float a = clamp((cross + core) * vA * uE, 0.0, 1.0);
        gl_FragColor = vec4(vec3(0.86, 0.87, 1.0) * a, a);
      }`,
  });
  const pts = new Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 5;
  return pts;
}

function makeStar(mobile) {
  const root = new Group();
  const geo = new ExtrudeGeometry(starShape(), {
    depth: 0.24, curveSegments: mobile ? 8 : 14,
    bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.085, bevelSegments: mobile ? 5 : 9,
  });
  geo.center();
  geo.computeVertexNormals();
  const star = new Mesh(geo, new MeshPhysicalMaterial({
    color: '#a3a6ff', metalness: 0.42, roughness: 0.2,
    emissive: '#272a7a', emissiveIntensity: 0.3,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 720],
    clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.3,
  }));
  star.scale.setScalar(0.74);
  const spinG = new Group();
  spinG.add(star);
  root.add(spinG);
  const sp = sparkles(mobile ? 26 : 40);
  root.add(sp);
  const shadow = shadowMesh(1.5, 0.7);
  shadow.position.y = FLOOR - 0.01;
  root.add(shadow);

  // It arrives like a shooting star, from high behind on the right, turning as it
  // comes, and bursts its sparkles when it stops.
  const enter = new Spring(0, 30, 7.5);
  const spin = new Spring(0, 40, 8.5);
  const pop = new Spring(0, 200, 10);
  let burstAt = -10, now = 0, arrived = false;
  const play = () => {
    if (now - burstAt < 0.6) return;
    burstAt = now;
    spin.t += TAU;
    pop.v += 5;
  };
  return {
    root,
    update(t, dt, s) {
      now = t;
      root.visible = s.since >= 0;
      if (!root.visible) return 0;
      enter.t = 1;
      const e = enter.step(dt), away = 1 - e;
      let hit = 0;
      if (!arrived && e > 0.92) { arrived = true; burstAt = t; pop.v += 4; hit = 3; }
      if (s.hoverIn && arrived) play();
      const k = spin.step(dt);
      spinG.rotation.y = k + Math.sin(t * 0.6) * 0.35 + s.py * 1.1 + away * TAU * 1.25;
      spinG.rotation.x = s.px * 0.4 + Math.sin(t * 0.45) * 0.08;
      spinG.rotation.z = Math.sin(t * 0.7) * 0.06 + s.tilt * 0.06 + away * 0.6;
      const p = pop.step(dt);
      spinG.scale.setScalar(MathUtils.clamp(e * 1.3, 0.001, 1) * (1 + p * 0.08));
      spinG.position.set(away * 1.5, 0.15 + Math.sin(t * 1.2) * 0.05 + p * 0.04 + away * 1.4, away * -0.6);
      sp.position.copy(spinG.position);
      const u = sp.material.uniforms;
      u.uTime.value = t;
      u.uBurst.value = MathUtils.clamp((t - burstAt) / 1.1, 0, 1);
      u.uE.value = MathUtils.clamp(e, 0, 1);
      u.uPx.value = s.px2;
      shadow.material.uniforms.uA.value = 0.4 * MathUtils.clamp(e, 0, 1) / (1 + Math.max(0, away) * 3);
      return hit;
    },
  };
}

const MAKERS = { chai: makeChai, kofi: makeMug, paypal: makeCoins, star: makeStar };

/* ---------------------------------------------------------------- Init */

export async function init(section) {
  const root = document.documentElement;
  const mobile = matchMedia('(max-width: 959px)').matches || matchMedia('(pointer: coarse)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const { gsap } = window;

  const canvasEl = Object.assign(document.createElement('canvas'), { className: 'gifts-layer' });
  canvasEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvasEl);

  const renderer = new WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const envRT = studio(renderer);

  const gifts = [...section.querySelectorAll('[data-gift]')].map((el, i) => {
    const make = MAKERS[el.dataset.gift];
    if (!make) return null;
    const obj = make(mobile);
    const scene = new Scene();
    scene.environment = envRT.texture;
    const key = new DirectionalLight('#ffffff', 1.5);
    key.position.set(2.5, 5, 4);
    const rim = new PointLight('#b4b6ff', 10, 10, 2);
    rim.position.set(-2.6, 1.6, -1.2);
    scene.add(key, rim, obj.root);
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
    // The bay is what you reach for (a link, the UPI row); the reveal is the part
    // of it that fades up, which the object waits for.
    const bay = el.closest('[data-bay]') || el;
    const g = {
      el, bay, reveal: el.closest('[data-reveal]') || bay, obj, scene, camera, i,
      s: { since: -1, h: 0, px: 0, py: 0, tilt: 0, hoverIn: false, px2: 1 },
      ready: false, startAt: -1,
      hover: false, hoverPulse: false,
      ptr: new Vector2(),
    };
    if (finePointer) {
      bay.addEventListener('pointerenter', () => { g.hover = true; g.hoverPulse = true; });
      bay.addEventListener('pointerleave', () => { g.hover = false; });
    }
    bay.addEventListener('focusin', () => { g.hover = true; g.hoverPulse = true; });
    bay.addEventListener('focusout', () => { g.hover = false; });
    return g;
  }).filter(Boolean);

  // Touch: each object does its trick once as its bay crosses the middle of the screen.
  if (!finePointer && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const g = gifts.find((x) => x.bay === e.target);
        if (!g) continue;
        g.hover = e.isIntersecting;
        if (e.isIntersecting) g.hoverPulse = true;
      }
    }, { rootMargin: '-38% 0px -38% 0px' });
    new Set(gifts.map((g) => g.bay)).forEach((c) => io.observe(c));
  }

  // The canvas is the layout viewport, which excludes a classic scrollbar.
  let vw = root.clientWidth, vh = innerHeight;
  const ptr = { x: vw / 2, y: vh / 2 };
  if (finePointer) addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; }, { passive: true });

  let dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, mobile ? 1.6 : 1.75); // the scene's desktop cap
    vw = root.clientWidth;
    vh = innerHeight;
    renderer.setPixelRatio(dpr);
    renderer.setSize(vw, vh, false);
  }
  resize();
  addEventListener('resize', resize);

  // Place a gift's camera so its stage maps to VIEW_H world units, with room above
  // for the toss and a little on each side, clipped to the screen.
  function frameGift(g) {
    const r = g.el.getBoundingClientRect();
    if (r.height < 4 || r.bottom < -r.height || r.top > vh + r.height) return null;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const L = Math.max(0, r.left - r.height * 0.16), R = Math.min(vw, r.right + r.height * 0.16);
    const T = Math.max(0, r.top - r.height * 0.62), B = Math.min(vh, r.bottom + r.height * 0.1);
    if (R - L < 2 || B - T < 2) return null;
    const halfW = Math.max(cx - L, R - cx), halfH = Math.max(cy - T, B - cy);
    const fullW = halfW * 2, fullH = halfH * 2;
    const wpp = VIEW_H / r.height;
    const dist = (fullH * wpp) / 2 / Math.tan(MathUtils.degToRad(FOV / 2));
    const cam = g.camera;
    cam.aspect = fullW / fullH;
    cam.position.set(0, Math.sin(ELEV) * dist, Math.cos(ELEV) * dist);
    cam.lookAt(0, 0, 0);
    cam.setViewOffset(fullW, fullH, L - (cx - halfW), T - (cy - halfH), R - L, B - T);
    return { L, T, W: R - L, H: B - T, cx, cy, h: r.height };
  }

  let last = performance.now(), t = 0, running = false, inView = false, shown = false, alive = true;
  let lastStart = -1;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 1 / 20);
    last = now;
    t += dt;
    renderer.setScissorTest(false);
    renderer.clear();
    let drew = false;
    for (const g of gifts) {
      if (!g.ready) continue;
      const f = frameGift(g);
      const s = g.s;
      // Drop it in once its bay has faded up and its stage is well on screen, a
      // beat apart from any other object arriving at the same time.
      if (g.startAt < 0 && f && f.cy > vh * 0.06 && f.cy < vh * 0.8) {
        const cs = getComputedStyle(g.reveal);
        if (cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.35) {
          g.startAt = lastStart = Math.max(t + 0.2, lastStart + 0.22);
        }
      }
      s.since = g.startAt < 0 || t < g.startAt ? -1 : t - g.startAt;
      s.h += ((g.hover ? 1 : 0) - s.h) * damp(dt, 5);
      s.hoverIn = s.since >= 0 && g.hoverPulse; // a hover before it arrives waits for it
      if (s.hoverIn) g.hoverPulse = false;
      if (f) {
        // Turn toward the pointer (or drift with scroll on touch), damped.
        const nx = finePointer ? MathUtils.clamp((ptr.x - f.cx) / vw, -0.6, 0.6) : 0;
        const ny = finePointer ? MathUtils.clamp((ptr.y - f.cy) / vh, -0.6, 0.6) : (f.cy / vh - 0.5) * 0.6;
        g.ptr.x += (ny - g.ptr.x) * damp(dt, 3.5);
        g.ptr.y += (nx - g.ptr.y) * damp(dt, 3.5);
        s.px = g.ptr.x;
        s.py = g.ptr.y;
        s.tilt = (f.cy / vh - 0.5);
        s.px2 = dpr * (f.h / 170);
      }
      g.obj.update(t, dt, s);
      if (!f || s.since < 0) continue;
      renderer.setViewport(f.L, vh - f.T - f.H, f.W, f.H);
      renderer.setScissor(f.L, vh - f.T - f.H, f.W, f.H);
      renderer.setScissorTest(true);
      renderer.clearDepth();
      renderer.render(g.scene, g.camera);
      drew = true;
    }
    if (drew && !shown) {
      shown = true;
      root.classList.add('gifts-ready');
      canvasEl.classList.add('is-on');
    }
  }

  // Draw after Lenis has scrolled this frame, so the objects never trail the page.
  const tick = () => frame();
  function sync() {
    const should = alive && inView && !document.hidden;
    if (should === running) return;
    running = should;
    last = performance.now();
    if (gsap) should ? gsap.ticker.add(tick) : gsap.ticker.remove(tick);
    else renderer.setAnimationLoop(should ? tick : null);
    canvasEl.classList.toggle('is-on', should && shown);
  }
  const io = new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; sync(); }, { rootMargin: '20% 0px' });
  io.observe(section);
  document.addEventListener('visibilitychange', sync);

  canvasEl.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    sync();
    canvasEl.remove();
    root.classList.remove('gifts-ready');
  });

  // Compile one object at a time and let each start as soon as it's ready, so
  // the first object down the page isn't waiting on the last one's shaders.
  sync();
  for (const g of gifts) {
    frameGift(g);
    try { await renderer.compileAsync(g.scene, g.camera); } catch { /* first render compiles */ }
    if (!alive) return;
    g.ready = true;
  }
}
