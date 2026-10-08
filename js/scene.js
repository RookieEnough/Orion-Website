// The Orion mark in WebGL: a glass prism, an indigo orb and a brushed-metal cube.
// The hero and the final call-to-action each have a flat SVG poster of the mark;
// the 3D pieces lock onto those posters' screen boxes, so the layout stays in CSS.
// main.js drives `stage` from ScrollTrigger; everything here is damped toward it.

import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Group, Mesh, Points,
  MeshPhysicalMaterial, MeshBasicMaterial, ShaderMaterial,
  SphereGeometry, ExtrudeGeometry, Shape, PlaneGeometry, BufferGeometry,
  Float32BufferAttribute, DirectionalLight, PointLight,
  Vector2, Vector3, MathUtils, CanvasTexture, RepeatWrapping,
  NeutralToneMapping, AdditiveBlending, Timer,
  RoundedBoxGeometry,
} from '../vendor/three.subset.min.js';
import { studio } from './studio.js';

const FOV = 32;
const CAM_Z = 8;
// The mark is measured off the 1024px app icon; one logo unit is 280px of it.
const U = 280;
const logo = (x, y) => new Vector2((x - 475) / U, -(y - 529.75) / U); // from the mark's box centre
const MARK_H = 579.5 / U; // height of the mark's bounding box, in logo units
// On-screen extent of each piece at scale 1 while it turns (prism, orb, cube).
const PIECE = [1.2, 1.06, 1.35];
const INK = '#07070c';
const SPAN = (CAM_Z + 6) / CAM_Z; // the backdrop sits 6 units behind the mark, so screen offsets scale by this

// The icon's tilted triangle (sharp corners, before the 30px fillet) and its box centre.
const TRI = [logo(535, 213), logo(323, 507), logo(689, 521)];
const TRI_R = 30 / U;
// Where each piece sits inside the mark, in logo units from the box centre.
const OFFSETS = [logo(510, 379.5), logo(339.5, 679.5), logo(625, 675)];

const smooth = (t) => t * t * (3 - 2 * t);
const damp = (dt, k) => 1 - Math.exp(-dt * k);

/* ---------------------------------------------------------------- Textures */

function noiseTexture(size = 256) {
  const c = Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d');
  g.fillStyle = '#8a8a8a';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    const v = 90 + Math.random() * 110 | 0;
    g.fillStyle = `rgba(${v},${v},${v},.18)`;
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 1 + Math.random() * 7, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(2, 1);
  return t;
}

function brushedTexture(w = 512, h = 512) {
  const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const g = c.getContext('2d');
  g.fillStyle = '#6a6a6a';
  g.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    const v = 70 + Math.random() * 90 | 0;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + Math.random() * 0.4})`;
    g.fillRect(0, y, w, 1);
  }
  // A few longer, brighter scratches.
  for (let i = 0; i < 90; i++) {
    g.fillStyle = 'rgba(200,200,200,.18)';
    g.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 260, 1);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/* ---------------------------------------------------------------- Pieces */

function makePrism(mobile) {
  // The bevel pushes the outline out by `bevel`, so draw every edge that much
  // further in and shrink the fillets to match: the finished silhouette is the icon's.
  const bevel = 0.05, r = TRI_R - bevel;
  const n = TRI.map((a, i) => {
    const b = TRI[(i + 1) % 3];
    return new Vector2(b.y - a.y, a.x - b.x).normalize(); // outward, the corners run anticlockwise
  });
  // Each fillet centre sits TRI_R in from both edges that meet at its corner.
  const la = TRI[1].distanceTo(TRI[2]), lb = TRI[2].distanceTo(TRI[0]), lc = TRI[0].distanceTo(TRI[1]);
  const inc = new Vector2()
    .addScaledVector(TRI[0], la).addScaledVector(TRI[1], lb).addScaledVector(TRI[2], lc)
    .divideScalar(la + lb + lc);
  const rho = Math.abs(n[0].dot(new Vector2().subVectors(TRI[0], inc)));
  const s = new Shape();
  TRI.forEach((v, i) => {
    const c = new Vector2().subVectors(v, inc).multiplyScalar((rho - TRI_R) / rho).add(inc);
    const a0 = Math.atan2(n[(i + 2) % 3].y, n[(i + 2) % 3].x);
    let a1 = Math.atan2(n[i].y, n[i].x);
    if (a1 < a0) a1 += Math.PI * 2;
    s.absarc(c.x, c.y, r, a0, a1, false);
  });
  s.closePath();
  const geo = new ExtrudeGeometry(s, {
    depth: 0.34, curveSegments: mobile ? 8 : 16,
    bevelEnabled: true, bevelThickness: 0.1, bevelSize: bevel, bevelSegments: mobile ? 4 : 8,
  });
  geo.center();
  geo.computeVertexNormals();
  const mat = new MeshPhysicalMaterial({
    color: '#ffffff',
    metalness: 0,
    roughness: 0.04,
    transmission: 1,
    thickness: 1.2,
    ior: 1.5,
    dispersion: mobile ? 1.5 : 3.2,
    attenuationColor: new Color('#c9cbff'),
    attenuationDistance: 1.6,
    specularIntensity: 1,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.4,
  });
  return new Mesh(geo, mat);
}

function makeOrb(noise, mobile) {
  const geo = new SphereGeometry(140 / U, mobile ? 64 : 96, mobile ? 40 : 64);
  const mat = new MeshPhysicalMaterial({
    color: '#5b5fde',
    metalness: 0.15,
    roughness: 0.32,
    roughnessMap: noise,
    bumpMap: noise,
    bumpScale: 0.6,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.55,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    sheen: 1,
    sheenColor: new Color('#b4b6ff'),
    sheenRoughness: 0.35,
    envMapIntensity: 1.2,
  });
  return new Mesh(geo, mat);
}

function makeCube(brushed, mobile) {
  const geo = new RoundedBoxGeometry(250 / U, 250 / U, 250 / U, mobile ? 4 : 7, 30 / U);
  const mat = new MeshPhysicalMaterial({
    color: '#dcdcf2',
    metalness: 1,
    roughness: 0.34,
    roughnessMap: brushed,
    anisotropy: 0.85,
    clearcoat: 0.35,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.3,
  });
  return new Mesh(geo, mat);
}

/* ---------------------------------------------------------------- Backdrop and stars */

// Full-screen glow that follows the mark. Opaque so the glass prism has something
// to refract; it writes final sRGB values directly, so its edge matches the page ink.
function makeBackdrop() {
  const mat = new ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uC: { value: new Vector2() },
      uR: { value: 3 },
      uI: { value: 1 },
    },
    vertexShader: /* glsl */`
      varying vec2 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xy;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec2 uC;
      uniform float uR;
      uniform float uI;
      varying vec2 vW;
      void main() {
        float d = length((vW - uC) / uR);
        float g = exp(-d * d * 1.5) * uI;
        vec3 ink = vec3(7.0, 7.0, 12.0) / 255.0;
        vec3 col = ink + vec3(0.357, 0.373, 0.871) * g * 0.22 + vec3(0.706, 0.714, 1.0) * pow(g, 4.0) * 0.07;
        float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
        gl_FragColor = vec4(col + (n - 0.5) / 255.0, 1.0);
      }`,
  });
  const m = new Mesh(new PlaneGeometry(1, 1), mat);
  m.position.z = -6;
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

function makeStars(count) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // A shell around the camera, so rotating it reads as drifting sky with no edges.
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const r = 16 + Math.random() * 26;
    const q = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * q * r, u * r, Math.sin(a) * q * r], i * 3);
    size[i] = 0.4 + Math.pow(Math.random(), 4) * 2.4;
    phase[i] = Math.random();
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new Float32BufferAttribute(size, 1));
  geo.setAttribute('aPhase', new Float32BufferAttribute(phase, 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uA: { value: 1 } },
    vertexShader: /* glsl */`
      uniform float uTime;
      uniform float uPx;
      attribute float aSize;
      attribute float aPhase;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vA = 0.45 + 0.55 * sin(uTime * (0.5 + aPhase * 1.1) + aPhase * 6.2831);
        gl_PointSize = max(1.0, aSize * uPx * (26.0 / -mv.z));
      }`,
    fragmentShader: /* glsl */`
      uniform float uA;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vec3(0.86, 0.87, 1.0), a * a * vA * 0.8 * uA);
      }`,
  });
  const p = new Points(geo, mat);
  p.frustumCulled = false;
  p.position.z = CAM_Z;
  return p;
}

/* ---------------------------------------------------------------- Init */

export async function init(canvas, stage) {
  const root = document.documentElement;
  const mobile = matchMedia('(max-width: 959px)').matches || matchMedia('(pointer: coarse)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(INK, 1);
  // The prism refracts a soft glow; a smaller transmission pass reads the same and costs far less.
  renderer.transmissionResolutionScale = mobile ? 0.5 : 0.75;

  const scene = new Scene();
  scene.background = new Color(INK);
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.z = CAM_Z;

  const envRT = studio(renderer);
  scene.environment = envRT.texture;

  const key = new DirectionalLight('#ffffff', 1.4);
  key.position.set(3, 5, 6);
  const rim = new PointLight('#b4b6ff', 14, 12, 2);
  rim.position.set(-3, 1.5, 2.5);
  scene.add(key, rim);

  const noise = noiseTexture();
  const brushed = brushedTexture();

  const backdrop = makeBackdrop();
  const stars = makeStars(mobile ? 700 : 1400);
  scene.add(backdrop, stars);

  const world = new Group();
  scene.add(world);
  const meshes = [makePrism(mobile), makeOrb(noise, mobile), makeCube(brushed, mobile)];
  const pieces = meshes.map((mesh, i) => {
    const rig = new Group();
    const float = new Group();
    float.add(mesh);
    rig.add(float);
    world.add(rig);
    return {
      i, mesh, rig, float,
      dir: OFFSETS[i].clone().normalize(),
      phase: i * 2.1,
      spin: 0,
      target: { pos: new Vector3(), scale: 1, rx: 0, ry: 0, rz: 0 },
    };
  });

  // Frame math. hh/hw are half the visible height/width at z = 0.
  let hh = 1, hw = 1, wpp = 1, cap = mobile ? 1.5 : 1.75;
  function resize() {
    const w = innerWidth, h = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, cap, Math.sqrt(3.2e6 / (w * h)));
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    hh = Math.tan(MathUtils.degToRad(FOV / 2)) * CAM_Z;
    hw = hh * camera.aspect;
    wpp = (2 * hh) / h;
    backdrop.scale.set(hw * 2 * SPAN * 1.6, hh * 2 * SPAN * 1.6, 1);
    stars.material.uniforms.uPx.value = dpr;
  }
  resize();
  addEventListener('resize', resize);

  // Screen box of a poster element -> mark centre and scale in world units.
  const posterOf = (sel) => {
    const el = document.querySelector(sel);
    return () => {
      const r = el.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - innerWidth / 2) * wpp,
        y: -(r.top + r.height / 2 - innerHeight / 2) * wpp,
        s: (r.height * wpp) / MARK_H,
      };
    };
  };
  const heroPoster = posterOf('.hero-poster');
  const getPoster = posterOf('.get-poster');

  // How it works: the focused piece sits in the space under the heading, the
  // other two wait in a short row beneath it. Sizes come from the layout, so
  // the shapes never run into the copy whatever the viewport.
  const howHead = document.querySelector('.how-head');
  const howSlot = { fx: 0, fy: 0, fs: 1, px: 0, py: 0, ps: 0.34, gap: 0.62 };
  const toX = (x) => (x - innerWidth / 2) * wpp;
  const toY = (y) => -(y - innerHeight / 2) * wpp;
  const stacked = matchMedia('(max-width: 959px)'); // the layout split main.js and the CSS use
  function measureHow() {
    if (!howHead) return;
    if (stacked.matches) {
      // Phones: the band the CSS leaves at the foot of the head (its bottom padding),
      // the focused piece on the left and the other two parked low beside it.
      const r = howHead.getBoundingClientRect();
      const band = parseFloat(getComputedStyle(howHead).paddingBottom);
      const top = r.bottom - band + 16, focusPx = band - 32, parkPx = 38;
      Object.assign(howSlot, {
        fx: toX(r.left + focusPx * 0.62), fy: toY(top + focusPx / 2), fs: focusPx * wpp,
        px: toX(r.left + focusPx + 32 + parkPx * 0.6), py: toY(top + focusPx - parkPx / 2),
        ps: parkPx * wpp, gap: parkPx * 1.5 * wpp,
      });
      return;
    }
    // The head is a stretched grid item, so measure its last child for the bottom.
    const r = howHead.getBoundingClientRect();
    const top = howHead.lastElementChild.getBoundingClientRect().bottom + 36;
    const bottom = innerHeight * 0.94;
    const parkPx = 46;
    const focusPx = MathUtils.clamp(bottom - top - parkPx - 40, 120, Math.min(r.width * 0.42, 340));
    howSlot.fx = toX(r.left + focusPx * 0.62);
    howSlot.fy = toY(top + focusPx / 2);
    howSlot.fs = focusPx * wpp;
    howSlot.px = toX(r.left + parkPx * 0.6);
    howSlot.py = toY(Math.min(bottom, top + focusPx + 40 + parkPx / 2));
    howSlot.ps = parkPx * wpp;
    howSlot.gap = parkPx * 1.6 * wpp;
  }

  const ptr = new Vector2();
  const ptrDamped = new Vector2();
  if (finePointer) {
    addEventListener('pointermove', (e) => {
      ptr.set(e.clientX / innerWidth - 0.5, e.clientY / innerHeight - 0.5);
    }, { passive: true });
  }

  const tmp = { a: new Vector3(), b: new Vector3(), c: new Vector3(), v: new Vector2() };
  const glowC = new Vector2();
  let glowR = 3, glowI = 1;

  function pose(t, dt) {
    const H = heroPoster();
    const G = getPoster();
    const e = smooth(MathUtils.clamp(stage.hero, 0, 1));
    const mixHow = smooth(MathUtils.clamp(stage.howIn, 0, 1));
    if (mixHow > 0) measureHow();
    const mixGet = smooth(MathUtils.clamp(stage.get, 0, 1));
    const f = MathUtils.clamp(stage.how - 0.5, 0, 2);
    const inHow = mixHow * (1 - mixGet);

    for (const p of pieces) {
      const o = OFFSETS[p.i];
      // Hero: on the poster, coming apart as the hero scrolls away.
      const hero = tmp.a.set(H.x + o.x * H.s, H.y + o.y * H.s, 0)
        .add(tmp.c.set(p.dir.x * e * H.s * 1.6, p.dir.y * e * H.s * 1.2, e * 2.2));
      let heroScale = H.s * (1 + e * 0.15);

      // How it works: one piece in focus beside the copy, the others parked low.
      const w = Math.max(0, 1 - Math.abs(f - p.i));
      const S = howSlot;
      const how = tmp.b.set(S.fx, S.fy, 0.4).multiplyScalar(w)
        .add(tmp.c.set(S.px + p.i * S.gap, S.py, 0).multiplyScalar(1 - w));
      const howScale = MathUtils.lerp(S.ps, S.fs, w) / PIECE[p.i];

      // Get: back together on the final poster.
      const pos = p.target.pos.copy(hero).lerp(how, mixHow);
      let scale = MathUtils.lerp(heroScale, howScale, mixHow);
      pos.lerp(tmp.c.set(G.x + o.x * G.s, G.y + o.y * G.s, 0), mixGet);
      scale = MathUtils.lerp(scale, G.s, mixGet);
      p.target.scale = scale;

      // Spin freely while in focus; otherwise settle on the nearest face-on angle.
      const period = p.i === 2 ? Math.PI / 2 : Math.PI * 2;
      if (inHow > 0.5) p.spin += dt * (0.25 + w * 0.55);
      else p.spin += (Math.round(p.spin / period) * period - p.spin) * damp(dt, 2.2);

      // The explode tumble belongs to the hero only; later poses start square.
      const sway = 1 - inHow;
      const tumble = e * (1 - mixHow);
      p.target.ry = p.spin + Math.sin(t * 0.45 + p.phase) * 0.32 * sway + tumble * (p.i - 1) * 1.1;
      p.target.rx = Math.sin(t * 0.37 + p.phase * 1.3) * 0.16 + tumble * 0.6 * p.dir.y + inHow * (p.i === 2 ? 0.5 : 0.15);
      p.target.rz = Math.sin(t * 0.29 + p.phase) * 0.06 + tumble * p.dir.x * 0.7;
    }

    // The glow follows whichever mark is on screen.
    glowC.set(H.x, H.y).lerp(tmp.v.set(howSlot.fx, howSlot.fy), mixHow).lerp(tmp.v.set(G.x, G.y), mixGet);
    glowR = MathUtils.lerp(MathUtils.lerp(H.s * 2.6, howSlot.fs * 1.6, mixHow), G.s * 2.8, mixGet);
    glowI = MathUtils.lerp(MathUtils.lerp(1 - e * 0.6, 0.7, mixHow), 1, mixGet);
  }

  const timer = new Timer();
  timer.connect?.(document);
  let running = false, active = true, ready = false, alive = true;
  let seen = 0, slow = 0;

  function frame(ts) {
    timer.update(ts);
    const raw = timer.getDelta();
    const dt = Math.min(raw, 1 / 20);
    // A device that can't hold ~40fps for most of 1.5s trades resolution for frames, a
    // quarter step at a time, down to 1x. The first two seconds are skipped (warm-up, page load).
    // ponytail: one-way; a display held at 30Hz (battery saver) steps down too.
    if (cap > 1 && ++seen > 120) {
      slow += raw > 0.025;
      if (seen === 210) {
        if (slow > 60) { cap = Math.max(1, cap - 0.25); resize(); }
        seen = 120; slow = 0;
      }
    }
    const t = timer.getElapsed();
    pose(t, dt);

    const kp = damp(dt, 6), kr = damp(dt, 4);
    for (const p of pieces) {
      p.rig.position.lerp(p.target.pos, kp);
      const s = MathUtils.lerp(p.rig.scale.x, p.target.scale, kp);
      p.rig.scale.setScalar(s);
      p.mesh.rotation.x += (p.target.rx - p.mesh.rotation.x) * kr;
      p.mesh.rotation.y += (p.target.ry - p.mesh.rotation.y) * kr;
      p.mesh.rotation.z += (p.target.rz - p.mesh.rotation.z) * kr;
      p.float.position.y = Math.sin(t * 0.8 + p.phase) * 0.035;
    }

    ptrDamped.lerp(ptr, damp(dt, 3));
    const auto = finePointer ? 0 : Math.sin(t * 0.3) * 0.08;
    world.rotation.y = ptrDamped.x * 0.22 + auto;
    world.rotation.x = ptrDamped.y * 0.14;
    world.position.x = ptrDamped.x * 0.08;

    const u = backdrop.material.uniforms;
    u.uC.value.lerp(tmp.v.copy(glowC).multiplyScalar(SPAN), kp);
    u.uR.value += (glowR * SPAN - u.uR.value) * kp;
    u.uI.value += (glowI - u.uI.value) * kp;

    stars.rotation.x = scrollY * 0.00012 + t * 0.004;
    stars.rotation.y = t * 0.006 + ptrDamped.x * 0.03;
    stars.material.uniforms.uTime.value = t;

    renderer.render(scene, camera);
    if (!ready) {
      ready = true;
      requestAnimationFrame(() => root.classList.add('scene-ready'));
    }
  }

  function sync() {
    const should = alive && active && !document.hidden;
    if (should === running) return;
    running = should;
    if (should) timer.reset?.();
    renderer.setAnimationLoop(should ? frame : null);
  }
  document.addEventListener('visibilitychange', sync);

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    alive = false;
    sync();
    root.classList.remove('scene-ready');
  });

  // Place everything on its first pose before compiling, so there's no fly-in from 0,0.
  pose(0, 0);
  for (const p of pieces) {
    p.rig.position.copy(p.target.pos);
    p.rig.scale.setScalar(p.target.scale);
  }
  backdrop.material.uniforms.uC.value.copy(glowC).multiplyScalar(SPAN);
  backdrop.material.uniforms.uR.value = glowR * SPAN;

  try {
    await renderer.compileAsync(scene, camera);
  } catch {
    // Older drivers without parallel compile: the first render compiles instead.
  }
  sync();

  return {
    setActive(on) { active = !!on; sync(); },
    dispose() {
      alive = false;
      sync();
      removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', sync);
      scene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
      noise.dispose(); brushed.dispose(); envRT.dispose();
      renderer.dispose();
      root.classList.remove('scene-ready');
    },
  };
}
