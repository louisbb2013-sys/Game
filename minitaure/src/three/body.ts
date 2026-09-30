import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Creature } from '../content/types';
import { createNoise3, rng } from './noise';

/**
 * Builds the creature body: a seeded, slightly irregular icosphere plus
 * per-vertex pattern data used by the fur shader.
 *
 *  aRest    vec3  undisplaced unit direction (stable strand lookup space)
 *  aPattern vec4  x: detail colour mask, y: fur length multiplier,
 *                 z: clump (tufts use thicker, sparser locks), w: sheen mask
 *
 * Patterns are computed once on the CPU so the per-fragment cost of each
 * shell stays tiny.
 */

const cache = new Map<string, THREE.BufferGeometry>();

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function getBodyGeometry(creature: Creature, detail: number) {
  const key = `${creature.slug}:${detail}:${creature.seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const geo = buildBody(creature, detail);
  cache.set(key, geo);
  return geo;
}

function buildBody(creature: Creature, detail: number) {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const seed = creature.seed;
  const noise = createNoise3(seed);
  const noise2 = createNoise3(seed * 7 + 3);
  const spotPoints = makeSpotPoints(seed, creature.detail.amount ?? 0.5);

  const squash = creature.shape?.squash ?? 0.95;
  const lump = creature.shape?.lumpiness ?? 0.05;
  const amount = creature.detail.amount ?? 0.6;
  const kind = creature.detail.kind;
  // Random rotation of the pattern around the vertical axis so two creatures
  // with the same detail never look identical.
  const phase = rng(seed)() * Math.PI * 2;

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const rest = new Float32Array(n * 3);
  const pattern = new Float32Array(n * 4);
  const v = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const { x, y, z } = v;
    rest.set([x, y, z], i * 3);

    // Low-frequency lumps: two octaves, deterministic per seed.
    const d =
      noise(x * 1.3 + seed, y * 1.3, z * 1.3) * 0.75 +
      noise(x * 2.7, y * 2.7 + seed, z * 2.7) * 0.25;
    const r = 1 + d * lump * 1.6;
    // Squash vertically and sit a little heavier at the bottom.
    const yy = y * squash * (y < 0 ? 0.97 : 1);
    pos.setXYZ(i, x * r, yy * r, z * r);

    const angle = Math.atan2(z, x) + phase;
    // Band-like patterns run on a tilted axis, like a planet's rings: a level
    // band across the middle could read as a visor or a mouth.
    const ty = y * Math.cos(0.38) + (x * Math.cos(phase) + z * Math.sin(phase)) * Math.sin(0.38);
    const wob = noise2(x * 2, y * 2, z * 2);
    let mask = 0;
    // Natural unevenness: broad variation plus small clumps.
    let len = 1 + noise2(x * 3.1, y * 3.1, z * 3.1) * 0.16 + noise(x * 9 + 5, y * 9, z * 9) * 0.22;
    let clump = 0;
    let sheen = 0;

    switch (kind) {
      case 'tuft': {
        // A lock slightly off the pole, leaning like a flame.
        const top = smoothstep(0.8, 0.97, y + x * 0.12);
        len += top * 1.25 * amount;
        clump = top;
        break;
      }
      case 'crown': {
        // A ring of many small locks (never two "ear-like" bumps).
        const ring = smoothstep(0.62, 0.74, y) * (1 - smoothstep(0.86, 0.95, y));
        const peaks = Math.pow(0.5 + 0.5 * Math.cos(angle * 17), 3);
        len += ring * (0.35 + peaks * 0.4) * amount;
        clump = ring * peaks * 0.8;
        mask = ring * peaks * 0.7;
        break;
      }
      case 'fringe': {
        const f = smoothstep(0.15, -0.2, y + wob * 0.12) * (1 - smoothstep(-0.55, -0.85, y));
        len += f * 0.85 * amount;
        mask = smoothstep(0.2, -0.25, y + wob * 0.12);
        break;
      }
      case 'spots': {
        let best = 9;
        for (const p of spotPoints) {
          const dd = Math.hypot(x - p[0], y - p[1], z - p[2]) / p[3];
          if (dd < best) best = dd;
        }
        mask = 1 - smoothstep(0.7, 1.0, best + wob * 0.15);
        break;
      }
      case 'stripes': {
        const s = Math.sin((ty + wob * 0.12) * Math.PI * 4.2 + phase);
        mask = smoothstep(0.25, 0.75, s) * amount * 1.4;
        break;
      }
      case 'band': {
        const b = Math.abs(ty + wob * 0.06);
        mask = 1 - smoothstep(0.12 * (0.6 + amount), 0.26 * (0.6 + amount), b);
        break;
      }
      case 'sheen': {
        const b = Math.abs(ty + wob * 0.05);
        sheen = (1 - smoothstep(0.06, 0.2, b)) * amount;
        mask = sheen;
        break;
      }
      default:
        break;
    }
    pattern.set([Math.min(1, mask), len, clump, sheen], i * 4);
  }

  geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
  geo.setAttribute('aPattern', new THREE.BufferAttribute(pattern, 4));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius *= 1.5; // account for fur + sway
  return geo;
}

/** Evenly-ish distributed spot centres on the unit sphere (x, y, z, radius). */
function makeSpotPoints(seed: number, amount: number) {
  const rand = rng(seed * 13 + 5);
  // Many small spots: a few large ones can line up like eyes and a mouth.
  const count = Math.round(18 + amount * 10);
  const pts: [number, number, number, number][] = [];
  for (let i = 0; i < count; i++) {
    // Fibonacci sphere + jitter.
    const k = (i + 0.5) / count;
    const phi = Math.acos(1 - 2 * k);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i + rand() * 0.8;
    const jitter = 0.18;
    const x = Math.cos(theta) * Math.sin(phi) + (rand() - 0.5) * jitter;
    const y = Math.cos(phi) + (rand() - 0.5) * jitter;
    const z = Math.sin(theta) * Math.sin(phi) + (rand() - 0.5) * jitter;
    const l = Math.hypot(x, y, z);
    pts.push([x / l, y / l, z / l, 0.1 + rand() * 0.11 + amount * 0.05]);
  }
  return pts;
}
