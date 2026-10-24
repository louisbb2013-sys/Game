import type { Rarity } from '@lumo/core';
import type * as T from 'three';
import { Creature, Etincelles, lumieres, matierePoints, nuageDePoints, ombre, solide, THREE, webgl2Dispo } from './creatures.js';
import { lookFor, tierSparkle } from './looks';

/**
 * Lumo's 3D stage. One WebGL canvas covers the window; every element that shows a 3D creature
 * or egg gets its own little scene, drawn exactly inside that element's rectangle (the
 * "many elements, one canvas" technique from the Minitaure site). Nothing renders while
 * nothing moves, and it stops when the tab is hidden.
 */

export type Mood = 'happy' | 'angry' | 'sad' | 'sleepy';
export type Spec = { kind: 'creature'; species: string; rarity: Rarity; mood?: Mood } | { kind: 'egg'; rarity: Rarity; progress: number };

export interface Handle {
  jump(force?: number): void;
  burst(count?: number): void;
  crack(): void;
  setProgress(p: number): void;
  dispose(): void;
}

interface View extends Handle {
  el: HTMLElement;
  scene: T.Scene;
  camera: T.PerspectiveCamera;
  L: ReturnType<typeof lumieres>;
  sparks: Etincelles;
  pop: number;
  busy(): boolean;
  tick(t: number, dt: number): void;
  /** Frame the scene for this width / height (wide creatures in a tall box: the camera steps back). */
  fit?(aspect: number): void;
}

const FOV = 28;
const EGG_COLOR: Record<Rarity, string> = {
  common: '#FFF1D6',
  rare: '#9FD8FF',
  epic: '#D3A6FF',
  legendary: '#FFD54A',
  mythical: '#FF92DA',
  exotic: '#2DD4BF',
  galaxial: '#4F46E5',
  lumo: '#FACC15',
};
/** Rare pets and eggs give off sparkles now and then: every `every` seconds, `count` of them (none below epic). */
const AURA: Record<Rarity, { every: number; count: number } | null> = {
  common: null,
  rare: null,
  epic: { every: 2.2, count: 3 },
  legendary: { every: 1.1, count: 6 },
  mythical: { every: 0.7, count: 8 },
  exotic: { every: 0.6, count: 8 },
  galaxial: { every: 0.5, count: 9 },
  lumo: { every: 0.4, count: 10 },
};
const RICH = (r: Rarity) => AURA[r] !== null;
const HUMEUR: Record<Mood, string> = { happy: 'joyeux', angry: 'colere', sad: 'triste', sleepy: 'endormi' };

/**
 * The top tiers wear their magic around them: a cloud of twinkling stars (galaxial) or drifting golden
 * fireflies (lumo). One small point cloud per view, animated on the GPU.
 */
function halo(rarity: Rarity, L: ReturnType<typeof lumieres>, px: { value: number }, echelle: { value: number }) {
  if (rarity !== 'galaxial' && rarity !== 'lumo') return null;
  const gold = rarity === 'lumo';
  const colors = gold ? ['#FFE08A', '#FACC15', '#FFF3C4', '#FFB21C'] : ['#FFFFFF', '#C7D2FE', '#A5F3FC', '#F0ABFC', '#FDE68A'];
  const n = gold ? 16 : 30;
  const list = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const r = 0.5 + Math.random() * 0.35;
    return {
      pos: [Math.cos(a) * r, 0.1 + Math.random() * 1.0, Math.sin(a) * r * 0.6 - 0.1],
      couleur: colors[i % colors.length]!,
      taille: gold ? 0.05 + Math.random() * 0.05 : 0.025 + Math.random() * 0.045,
      alpha: 0.9,
      seed: [Math.random(), Math.random(), Math.random()],
    };
  });
  return nuageDePoints(list, matierePoints({ temps: L.uTime, forme: gold ? 0 : 1, flotte: gold ? 0.18 : 0.08, px, echelle }));
}

let supported: boolean | null = null;
/** 3D only where WebGL2 works, not when saving data, and not in automated test browsers (unless ?3d=1). */
export function can3D(): boolean {
  if (supported !== null) return supported;
  try {
    const force = new URLSearchParams(location.search).get('3d') === '1';
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    supported = force || (!navigator.webdriver && !saveData && webgl2Dispo());
  } catch {
    supported = false;
  }
  return supported;
}

class Stage {
  private canvas = document.createElement('canvas');
  readonly renderer: T.WebGLRenderer;
  private views = new Set<View>();
  private raf = 0;
  private t = 0;
  private last = performance.now();
  private until = 0;
  private w = 0;
  private h = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly touch = matchMedia('(pointer: coarse)').matches;
  private dpr: number;

  constructor() {
    this.canvas.className = 'stage-3d';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.touch ? 1.75 : 2);
    this.renderer.setPixelRatio(this.dpr);
    addEventListener('scroll', () => this.wake(300), { passive: true });
    addEventListener('resize', () => this.wake(300));
    document.addEventListener('visibilitychange', () => !document.hidden && this.wake());
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      cancelAnimationFrame(this.raf);
      this.canvas.remove();
      for (const v of this.views) v.el.classList.remove('c3d-on');
      stage = null;
      supported = false;
    });
  }

  add(v: View) {
    this.views.add(v);
    this.wake();
  }
  remove(v: View) {
    this.views.delete(v);
    this.wake(50);
  }

  wake(ms = 1200) {
    this.until = Math.max(this.until, performance.now() + ms);
    if (!this.raf && !document.hidden) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private frame = (now: number) => {
    this.raf = 0;
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    if (!this.reduced) this.t += dt;
    const w = document.documentElement.clientWidth;
    const h = window.innerHeight;
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
      this.renderer.setSize(w, h, false);
      this.canvas.style.width = `${w}px`;
      this.canvas.style.height = `${h}px`;
    }
    const r = this.renderer;
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    // With a pop-up open, only what is inside it is drawn (nothing shows through it).
    const modal = document.querySelector<HTMLElement>('[aria-modal="true"]');
    // Never draw over the bottom tab bar.
    // (On wide screens the tab bar is hidden: its box is empty, and there is no floor.)
    // (A pop-up covers the tab bar, so then the whole height is free.)
    const nav = document.querySelector<HTMLElement>('[data-bottom-nav]');
    const navBox = nav && !(modal && !modal.contains(nav)) ? nav.getBoundingClientRect() : null;
    const floor = navBox && navBox.height > 0 ? navBox.top : h;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    let moving = false;
    for (const v of this.views) {
      if (modal && !modal.contains(v.el)) continue;
      const b = v.el.getBoundingClientRect();
      if (b.bottom < 0 || b.top > floor || b.right < 0 || b.left > w || b.width < 4 || b.height < 4) continue;
      if (!v.el.classList.contains('c3d-on')) v.el.classList.add('c3d-on');
      v.tick(this.t, this.reduced ? 0 : dt);
      if (v.busy() || !this.reduced) moving = true;
      v.camera.aspect = b.width / b.height;
      v.fit?.(v.camera.aspect);
      v.camera.updateProjectionMatrix();
      const scale = b.height / (2 * tan);
      v.sparks.mat.uniforms.uPx!.value = this.dpr;
      v.sparks.mat.uniforms.uEchelle!.value = scale;
      const top = Math.max(b.top, 0);
      const bottom = Math.min(b.bottom, floor);
      r.setViewport(b.left, h - b.bottom, b.width, b.height);
      r.setScissor(b.left, h - bottom, b.width, Math.max(0, bottom - top));
      r.render(v.scene, v.camera);
    }
    if (!document.hidden && (moving || performance.now() < this.until)) this.raf = requestAnimationFrame(this.frame);
  };
}

let stage: Stage | null = null;
const getStage = () => (stage ??= new Stage());

function lights(egg: boolean) {
  const L = lumieres();
  L.uSunDir!.value.set(-0.5, 0.7, 0.55).normalize();
  L.uSunColor!.value.set('#FFE7C7').multiplyScalar(0.9);
  L.uSky!.value.set('#9AA6F0').multiplyScalar(0.45);
  L.uGround!.value.set('#8A7FB8').multiplyScalar(0.3);
  L.uLanternPos!.value.set(1.1, 1.3, 1.6);
  L.uLanternColor!.value.set('#FFF1DC');
  L.uLantern!.value = egg ? 1.4 : 1.8;
  // A champagne-gold rim light outlines the fur against the midnight background.
  L.uRim!.value.set('#FFD98A').multiplyScalar(0.8);
  return L;
}

function eggGeometry() {
  const pts: T.Vector2[] = [];
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    // an egg: rounder at the bottom, a little pointed at the top
    const r = 0.25 * Math.pow(Math.sin(Math.PI * u), 0.92) * (1 - 0.2 * u);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), 0.66 * (1 - Math.cos(Math.PI * u)) * 0.5));
  }
  return new THREE.LatheGeometry(pts, 48);
}

/** A point on the egg's shell: `u` from bottom (0) to top (1), `phi` around it (0 = facing the camera). */
function eggPoint(u: number, phi: number) {
  const r = 0.25 * Math.pow(Math.sin(Math.PI * u), 0.92) * (1 - 0.2 * u) * 1.012;
  return new THREE.Vector3(Math.sin(phi) * r, 0.66 * (1 - Math.cos(Math.PI * u)) * 0.5, Math.cos(phi) * r);
}

const portraits = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();
let queue: Promise<unknown> = Promise.resolve();

export const cachedPortrait = (species: string, rarity: Rarity) => portraits.get(`${species}:${rarity}`) ?? null;

/**
 * A still picture of a 3D creature (PNG data URL), made once per species and rarity and kept for the
 * session: long lists show pictures instead of dozens of live 3D scenes. Null where 3D isn't available.
 */
export function portrait(species: string, rarity: Rarity, px = 256): Promise<string | null> {
  const key = `${species}:${rarity}`;
  const have = portraits.get(key);
  if (have) return Promise.resolve(have);
  if (!can3D()) return Promise.resolve(null);
  let p = pending.get(key);
  if (!p) {
    // One at a time, with a pause between them, so the page stays smooth while a list fills in.
    p = (queue = queue.then(() => new Promise((r) => setTimeout(r, 30))).then(() => {
      try {
        const url = snapshot({ kind: 'creature', species, rarity }, px);
        if (url) portraits.set(key, url);
        return url;
      } catch (e) {
        console.warn('portrait failed', e);
        return null;
      }
    })) as Promise<string | null>;
    pending.set(key, p);
  }
  return p;
}

function snapshot(spec: Spec, px: number): string | null {
  const st = getStage();
  const view = build(document.createElement('div'), spec) as View;
  st.remove(view);
  for (let i = 0; i < 14; i++) view.tick(i * 0.05, 0.05); // let it pop in and settle
  const r = st.renderer;
  const target = new THREE.WebGLRenderTarget(px, px, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace; // same colours as on screen
  view.camera.aspect = 1;
  view.camera.updateProjectionMatrix();
  view.sparks.mat.uniforms.uPx!.value = 1;
  view.sparks.mat.uniforms.uEchelle!.value = px / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
  const scissor = r.getScissorTest();
  r.setRenderTarget(target);
  r.setScissorTest(false);
  r.clear();
  r.render(view.scene, view.camera);
  const buf = new Uint8Array(px * px * 4);
  r.readRenderTargetPixels(target, 0, 0, px, px, buf);
  r.setRenderTarget(null);
  r.setScissorTest(scissor);
  target.dispose();
  view.dispose();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(px, px);
  // WebGL rows run bottom to top.
  for (let y = 0; y < px; y++) img.data.set(buf.subarray((px - 1 - y) * px * 4, (px - y) * px * 4), y * px * 4);
  // The canvas blends like the screen does (colours premultiplied by alpha); a picture wants them plain.
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3]!;
    if (a > 0 && a < 255) for (let k = 0; k < 3; k++) d[i + k] = Math.min(255, Math.round((d[i + k]! * 255) / a));
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** Put a 3D creature or egg in `el` (which keeps its 2D picture as a fallback underneath). */
export function mount(el: HTMLElement, spec: Spec): Handle | null {
  if (!can3D()) return null;
  try {
    return build(el, spec);
  } catch (e) {
    console.warn('3D unavailable', e);
    supported = false;
    return null;
  }
}

function build(el: HTMLElement, spec: Spec): Handle {
  const st = getStage();
  const scene = new THREE.Scene();
  const L = lights(spec.kind === 'egg');
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30);
  const sparks = new Etincelles(120, L.uTime as { value: number });
  scene.add(sparks.points);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let colors: string[];
  let tick: (t: number, dt: number) => void;
  let busy: () => boolean;
  let jump: (f?: number) => void;
  let center: () => T.Vector3;
  let crack = () => {};
  let setProgress = (_p: number) => {};
  const view = { pop: reduced ? 1 : 0 } as View;

  if (spec.kind === 'creature') {
    const look = lookFor(spec.species, spec.rarity);
    colors = look.sparkle;
    const pointsU = { uPx: sparks.mat.uniforms.uPx!, uEchelle: sparks.mat.uniforms.uEchelle! };
    // The top tiers light their pets differently: a starry blue-violet rim, a warm golden one.
    if (spec.rarity === 'galaxial') L.uRim!.value.set('#A5B4FC').multiplyScalar(0.95);
    if (spec.rarity === 'lumo') {
      L.uRim!.value.set('#FFD45A').multiplyScalar(1.1);
      L.uLanternColor!.value.set('#FFE2A0');
    }
    // The boss glares (frown, red glint) under a red rim light.
    if (spec.mood === 'angry') L.uRim!.value.set('#FF5A3D').multiplyScalar(0.95);
    const c = new Creature(spec.species, L, {
      forme: look.forme,
      palette: look.palette,
      etoiles: look.etoiles,
      iris: look.iris,
      nebuleuse: look.nebuleuse,
      points: pointsU,
      humeur: HUMEUR[spec.mood ?? 'happy'],
      // Fewer, thicker strands read as plush on a small screen (thin ones turn to grain).
      couches: st.touch ? 26 : 32,
      poils: st.touch ? 7000 : 9000,
      segW: st.touch ? 44 : 64,
      segH: st.touch ? 30 : 40,
      glow: look.glow,
    });
    // Each species has its own little effects (embers, bubbles, a water spout…), drawn with the view's sparks.
    c.emettre = (o: T.Vector3, cols: string | string[], n?: number, v?: number, s?: number, d?: T.Vector3 | null) => sparks.emettre(o, cols, n, v, s, d);
    scene.add(c.groupe);
    const aura = halo(spec.rarity, L, pointsU.uPx, pointsU.uEchelle);
    if (aura) c.groupe.add(aura);
    const eye = new THREE.Vector3(0, 0.64, 3.45);
    const target = new THREE.Vector3(0, 0.56, 0);
    camera.position.copy(eye);
    camera.lookAt(target);
    const half = Math.tan(THREE.MathUtils.degToRad(FOV) / 2) * eye.z;
    let framed = 1;
    view.fit = (aspect) => {
      // a long dragon or a peacock's fan in a tall, narrow box: step back until it fits
      const k = Math.max(1, (c.largeur * 1.06) / (half * aspect));
      if (Math.abs(k - framed) < 0.002) return;
      framed = k;
      camera.position.copy(eye).sub(target).multiplyScalar(k).add(target);
      camera.lookAt(target);
    };
    const sparkle = AURA[spec.rarity];
    let ambient = sparkle ? 1.2 : 0;
    const at = new THREE.Vector3();
    tick = (t, dt) => {
      if (view.pop < 1) view.pop = Math.min(1, view.pop + dt * 2.2);
      const s = view.pop >= 1 ? 1 : 1 - Math.pow(1 - view.pop, 3) * Math.cos(view.pop * 9);
      c.groupe.scale.setScalar(Math.max(0.001, s));
      L.uTime!.value = t;
      // exotic pets shimmer: their rim light slowly runs through the rainbow
      if (spec.rarity === 'exotic' && spec.mood !== 'angry') L.uRim!.value.setHSL((t * 0.07) % 1, 0.75, 0.62);
      c.maj(t, dt);
      // rare pets give off a few sparkles now and then
      if (sparkle && dt > 0) {
        ambient -= dt;
        if (ambient <= 0) {
          ambient = sparkle.every;
          sparks.emettre(c.centre(at), colors, sparkle.count, 0.6, 0.05);
        }
      }
      sparks.maj(dt);
    };
    busy = () => view.pop < 1 || sparks.actives > 0 || c.y > 0 || Math.abs(c.yaw - c.cibleYaw) > 0.002;
    jump = (f = 0.8) => {
      if (!reduced) c.sauter(f);
    };
    center = () => c.centre(new THREE.Vector3());
    const host = el;
    host.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      c.regardLibre = false;
      c.cibleYaw = THREE.MathUtils.clamp((e.clientX - (r.left + r.width / 2)) / Math.max(r.width / 2, 1), -1.6, 1.6) * 0.55;
      c.ciblePitch = THREE.MathUtils.clamp((e.clientY - (r.top + r.height / 2)) / Math.max(r.height / 2, 1), -1.2, 1.2) * 0.22;
      st.wake();
    });
    host.addEventListener('pointerleave', () => {
      c.regardLibre = true;
      c.cibleYaw = c.ciblePitch = 0;
      st.wake();
    });
  } else {
    colors = tierSparkle(spec.rarity) ?? [EGG_COLOR[spec.rarity], '#FFE27A', '#FFFFFF'];
    const eggTop = new THREE.Vector3(0, 0.33, 0);
    const group = new THREE.Group();
    const glowing = spec.rarity === 'lumo' ? 0.45 : spec.rarity === 'galaxial' || spec.rarity === 'exotic' ? 0.28 : RICH(spec.rarity) ? 0.18 : 0.04;
    const shell = new THREE.Mesh(eggGeometry(), solide(EGG_COLOR[spec.rarity], L, { wrap: 0.75, pois: true, emissive: glowing, iris: spec.rarity === 'exotic' ? 0.35 : 0 }));
    group.add(shell);
    // Cracks appear on the front of the shell as it gets close to hatching.
    const crackMat = new THREE.MeshBasicMaterial({ color: '#5A4026', transparent: true, opacity: 0.85 });
    const cracks = [
      [[0.66, -0.32], [0.6, -0.18], [0.63, -0.05], [0.56, 0.08], [0.59, 0.22]],
      [[0.5, 0.05], [0.44, 0.16], [0.48, 0.28], [0.41, 0.4], [0.44, 0.52]],
    ].map((pts) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([u, phi]) => eggPoint(u!, phi!)), false, 'catmullrom', 0);
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0065, 5, false), crackMat);
      m.visible = false;
      group.add(m);
      return m;
    });
    const showCracks = (p: number) => {
      cracks[0]!.visible = p >= 0.5;
      cracks[1]!.visible = p >= 0.8;
    };
    const shadow = ombre();
    shadow.scale.set(0.34, 0.3, 1);
    scene.add(group, shadow);
    const eggAura = halo(spec.rarity, L, sparks.mat.uniforms.uPx!, sparks.mat.uniforms.uEchelle!);
    if (eggAura) {
      eggAura.scale.setScalar(0.75);
      scene.add(eggAura);
    }
    camera.position.set(0, 0.5, 2.5);
    camera.lookAt(0, 0.33, 0);
    let progress = spec.progress;
    showCracks(progress);
    let shake = 0;
    let cracked = 0;
    let vy = 0;
    let y = 0;
    // Every few seconds it hops and wiggles (more often, and harder, the closer it is to hatching).
    let nextHop = 1.5 + Math.random() * 2;
    let squash = 0;
    tick = (t, dt) => {
      if (view.pop < 1) view.pop = Math.min(1, view.pop + dt * 2.2);
      L.uTime!.value = t;
      if (!reduced && dt > 0 && cracked === 0) {
        nextHop -= dt;
        if (nextHop <= 0) {
          nextHop = Math.max(1.2, 4 - progress * 2.5) + Math.random() * 1.5;
          vy = 0.9 + progress * 0.8;
          shake = 0.45 + progress * 0.35;
          squash = 1;
          if (RICH(spec.rarity) || progress >= 0.8) sparks.emettre(eggTop, colors, (AURA[spec.rarity]?.count ?? 4) + 2, 0.7, 0.05);
        }
      }
      squash = Math.max(0, squash - dt * 3);
      // the closer it is to hatching, the more it wobbles
      const amp = 0.025 + 0.16 * Math.max(0, progress - 0.5) * 2;
      const wob = Math.sin(t * (2 + progress * 6)) * amp * (0.6 + 0.4 * Math.sin(t * 0.7));
      shake = Math.max(0, shake - dt);
      const sh = shake > 0 ? Math.sin(t * 46) * 0.22 * Math.min(1, shake * 2) : 0;
      if (vy !== 0 || y > 0) {
        vy -= 9 * dt;
        y += vy * dt;
        if (y <= 0) {
          y = 0;
          vy = 0;
        }
      }
      group.rotation.z = wob + sh;
      group.rotation.y = Math.sin(t * 0.6) * 0.25;
      group.position.y = y + Math.sin(t * 1.8) * 0.012;
      const s0 = view.pop >= 1 ? 1 : 1 - Math.pow(1 - view.pop, 3) * Math.cos(view.pop * 9);
      if (cracked > 0) cracked = Math.min(1, cracked + dt * 4);
      const sq = Math.sin(squash * Math.PI) * 0.08;
      group.scale.set(Math.max(0.001, s0 * (1 - cracked) * (1 + sq)), Math.max(0.001, s0 * (1 - cracked) * (1 - sq)), Math.max(0.001, s0 * (1 - cracked) * (1 + sq)));
      shadow.scale.set(0.34 * (1 - cracked * 0.8), 0.3 * (1 - cracked * 0.8), 1);
      sparks.maj(dt);
    };
    busy = () => view.pop < 1 || sparks.actives > 0 || shake > 0 || y > 0 || (cracked > 0 && cracked < 1);
    jump = () => {
      shake = 0.8;
      if (!reduced) vy = 1.4;
    };
    center = () => new THREE.Vector3(0, 0.33, 0);
    crack = () => {
      cracked = 0.001;
      sparks.emettre(new THREE.Vector3(0, 0.33, 0), colors, 60, 1.6, 0.09);
      st.wake(2500);
    };
    setProgress = (p) => {
      progress = Math.max(0, Math.min(1, p));
      showCracks(progress);
      st.wake();
    };
  }

  Object.assign(view, {
    el,
    scene,
    camera,
    L,
    sparks,
    tick,
    busy,
    jump: (f?: number) => {
      jump(f);
      st.wake();
    },
    burst: (n = 24) => {
      sparks.emettre(center(), colors, n, 1.3, 0.08);
      st.wake(1500);
    },
    crack,
    setProgress,
    dispose: () => {
      st.remove(view);
      el.classList.remove('c3d-on');
      scene.traverse((o) => {
        const m = o as T.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as T.Material | T.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
    },
  });
  st.add(view);
  return view;
}
