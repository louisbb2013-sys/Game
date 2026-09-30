import { useMemo } from 'react';
import { useReducedMotion } from './useReducedMotion';

/**
 * Rendering quality tier.
 *  high   — desktop-class GPU: full shells, dense particles
 *  medium — phones / tablets / modest laptops: fewer shells, lower DPR
 *  static — no WebGL, a software renderer (no GPU), reduced motion, or a
 *           weak device: pre-rendered stills
 *
 * Override for testing with `?q=high|medium|static` (remembered per tab).
 */
export type Tier = 'high' | 'medium' | 'static';

export interface Quality {
  tier: Tier;
  webgl: boolean;
  reducedMotion: boolean;
  /** Canvas DPR range. */
  dpr: [number, number];
  shells: { hero: number; detail: number; small: number; thumb: number };
  geo: { hero: number; small: number; thumb: number };
  stars: number;
}

let webglSupport: boolean | null = null;
let softwareGL = false;
export function hasWebGL2() {
  if (webglSupport !== null) return webglSupport;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webglSupport = !!gl;
    if (gl) {
      // Software rasterisers (no GPU) would render the fur on the CPU.
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      softwareGL = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function override(): Tier | null {
  try {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q === 'high' || q === 'medium' || q === 'static') {
      sessionStorage.setItem('minitaure:q', q);
      return q;
    }
    const s = sessionStorage.getItem('minitaure:q');
    if (s === 'high' || s === 'medium' || s === 'static') return s;
  } catch {
    /* storage may be blocked */
  }
  return null;
}

let baseTier: Tier | null = null;
function detectTier(): Tier {
  if (baseTier) return baseTier;
  const forced = override();
  if (forced) return (baseTier = forced);
  if (!hasWebGL2() || softwareGL) return (baseTier = 'static');
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  if (cores <= 2 || mem <= 2 || nav.connection?.saveData) return (baseTier = 'static');
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.screen.width, window.screen.height) < 820;
  return (baseTier = coarse || small || cores <= 4 ? 'medium' : 'high');
}

export function getQuality(reducedMotion: boolean): Quality {
  const webgl = typeof window !== 'undefined' && hasWebGL2();
  const detected = typeof window === 'undefined' ? 'static' : detectTier();
  const tier: Tier = reducedMotion && detected !== 'static' && !override() ? 'static' : detected;
  if (tier === 'high') {
    return {
      tier, webgl, reducedMotion,
      dpr: [1, 1.75],
      shells: { hero: 36, detail: 40, small: 20, thumb: 16 },
      geo: { hero: 28, small: 14, thumb: 10 },
      stars: 900,
    };
  }
  return {
    tier, webgl, reducedMotion,
    dpr: [1, 1.5],
    shells: { hero: 22, detail: 26, small: 14, thumb: 12 },
    geo: { hero: 18, small: 10, thumb: 8 },
    stars: 420,
  };
}

export function useQuality(): Quality {
  const reduced = useReducedMotion();
  return useMemo(() => getQuality(reduced), [reduced]);
}
