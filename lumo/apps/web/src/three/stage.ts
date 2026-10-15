import type { Rarity } from '@lumo/core';
import type * as T from 'three';
import { Creature, Etincelles, lumieres, ombre, solide, THREE, webgl2Dispo } from './creatures.js';
import { lookFor } from './looks';

/**
 * Lumo's 3D stage. One WebGL canvas covers the window; every element that shows a 3D creature
 * or egg gets its own little scene, drawn exactly inside that element's rectangle (the
 * "many elements, one canvas" technique from the Minitaure site). Nothing renders while
 * nothing moves, and it stops when the tab is hidden.
 */

export type Spec = { kind: 'creature'; species: string; rarity: Rarity; mood?: 'happy' | 'angry' } | { kind: 'egg'; rarity: Rarity; progress: number };

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
}

const FOV = 28;
const EGG_COLOR: Record<Rarity, string> = { common: '#FFF1D6', rare: '#9FD8FF', epic: '#D3A6FF', legendary: '#FFD54A' };

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
  private renderer: T.WebGLRenderer;
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
    const nav = document.querySelector<HTMLElement>('[data-bottom-nav]');
    const floor = nav ? nav.getBoundingClientRect().top : h;
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
  const sparks = new Etincelles(80, L.uTime as { value: number });
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
    // The boss glares (frown, red glint) under a red rim light.
    if (spec.mood === 'angry') L.uRim!.value.set('#FF5A3D').multiplyScalar(0.95);
    const c = new Creature(spec.species, L, {
      forme: look.forme,
      palette: look.palette,
      humeur: spec.mood === 'angry' ? 'colere' : 'joyeux',
      // Fewer, thicker strands read as plush on a small screen (thin ones turn to grain).
      couches: st.touch ? 26 : 32,
      poils: st.touch ? 7000 : 9000,
      segW: st.touch ? 44 : 64,
      segH: st.touch ? 30 : 40,
      glow: look.glow,
    });
    scene.add(c.groupe);
    camera.position.set(0, 0.64, 3.45);
    camera.lookAt(0, 0.56, 0);
    let ambient = spec.rarity === 'legendary' || spec.rarity === 'epic' ? 1.2 : 0;
    tick = (t, dt) => {
      if (view.pop < 1) view.pop = Math.min(1, view.pop + dt * 2.2);
      const s = view.pop >= 1 ? 1 : 1 - Math.pow(1 - view.pop, 3) * Math.cos(view.pop * 9);
      c.groupe.scale.setScalar(Math.max(0.001, s));
      L.uTime!.value = t;
      c.maj(t, dt);
      // rare pets give off a few sparkles now and then
      if (ambient && dt > 0) {
        ambient -= dt;
        if (ambient <= 0) {
          ambient = spec.rarity === 'legendary' ? 1.1 : 2.2;
          sparks.emettre(c.centre(new THREE.Vector3()), colors, spec.rarity === 'legendary' ? 6 : 3, 0.6, 0.05);
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
    colors = [EGG_COLOR[spec.rarity], '#FFE27A', '#FFFFFF'];
    const group = new THREE.Group();
    const shell = new THREE.Mesh(eggGeometry(), solide(EGG_COLOR[spec.rarity], L, { wrap: 0.75, pois: true, emissive: spec.rarity === 'legendary' ? 0.18 : 0.04 }));
    group.add(shell);
    const shadow = ombre();
    shadow.scale.set(0.34, 0.3, 1);
    scene.add(group, shadow);
    camera.position.set(0, 0.5, 2.5);
    camera.lookAt(0, 0.33, 0);
    let progress = spec.progress;
    let shake = 0;
    let cracked = 0;
    let vy = 0;
    let y = 0;
    tick = (t, dt) => {
      if (view.pop < 1) view.pop = Math.min(1, view.pop + dt * 2.2);
      L.uTime!.value = t;
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
      group.position.y = y + Math.sin(t * 1.8) * 0.012;
      const s0 = view.pop >= 1 ? 1 : 1 - Math.pow(1 - view.pop, 3) * Math.cos(view.pop * 9);
      if (cracked > 0) cracked = Math.min(1, cracked + dt * 4);
      group.scale.setScalar(Math.max(0.001, s0 * (1 - cracked)));
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
