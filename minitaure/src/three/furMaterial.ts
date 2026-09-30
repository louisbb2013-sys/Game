import * as THREE from 'three';
import type { Creature, DetailKind } from '../content/types';

/**
 * Shell-texturing fur.
 *
 * The body geometry is drawn N times in ONE draw call (InstancedMesh);
 * gl_InstanceID is the shell index. Each shell is pushed out along the
 * normal and only keeps fragments that fall inside a hair strand. Strands
 * come from two jittered 3D lattices (dense under-fur + guard hairs)
 * evaluated in the *rest* direction so they stay coherent across shells.
 *
 * Output is opaque with a dithered alpha test, so no transparency sorting is
 * needed and the transparent canvas composites cleanly over the page. Lighting is fully in-shader and deliberately soft:
 * wrapped diffuse, height occlusion, faint Kajiya-Kay sheen, fresnel rim and
 * back-light translucency for a subsurface-like glow.
 */

const DETAIL_INDEX: Record<DetailKind, number> = {
  plain: 0,
  tuft: 1,
  crown: 2,
  spots: 3,
  stripes: 4,
  band: 5,
  sheen: 6,
  speckle: 7,
  fringe: 8,
};

const vertexShader = /* glsl */ `
  uniform float uShells;
  uniform float uLength;
  uniform float uGrow;
  uniform float uTime;
  uniform float uRuffle;
  uniform float uDroop;
  uniform float uFlow;
  uniform float uWind;

  attribute vec3 aRest;
  attribute vec4 aPattern;

  varying vec3 vRest;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec4 vPattern;
  varying float vH;

  void main() {
    float h = float(gl_InstanceID) / max(uShells - 1.0, 1.0);
    float len = uLength * aPattern.y * uGrow;
    vec3 pos = position + normal * h * len;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vec3 nW = normalize(mat3(modelMatrix) * normal);
    float scale = length(modelMatrix[0].xyz);
    float bend = h * h * len * scale;

    // Gravity, stronger on the sides than on the crown.
    vec3 gravity = vec3(0.0, -1.0, 0.0) * uDroop * bend * (0.55 + 0.45 * (1.0 - abs(nW.y)));
    // Comb the strands downward along the surface.
    vec3 down = vec3(0.0, -1.0, 0.0) + nW * nW.y;
    vec3 flow = down * uFlow * bend * 0.9;
    // Slow breeze.
    float ph = dot(aRest, vec3(2.1, 1.3, 1.7));
    vec3 wind = vec3(sin(uTime * 1.3 + ph), 0.25 * sin(uTime * 1.7 + ph * 1.3), cos(uTime * 1.1 + ph * 0.7));
    wind *= uWind * bend;
    // Hover ruffle: quick tangential jitter.
    vec3 rf = vec3(
      sin(aRest.y * 11.0 + uTime * 7.0),
      sin(aRest.z * 13.0 + uTime * 6.3),
      sin(aRest.x * 12.0 + uTime * 7.7)
    );
    rf -= nW * dot(rf, nW);
    vec3 ruffle = rf * uRuffle * bend * 1.1;

    world.xyz += gravity + flow + wind + ruffle;

    vRest = aRest;
    vNormalW = nW;
    vWorldPos = world.xyz;
    vPattern = aPattern;
    vH = h;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uDetailColor;
  uniform int uDetail;
  uniform float uDetailAmount;
  uniform float uDensity;
  uniform float uThickness;
  uniform float uSeed;

  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform vec3 uSky;
  uniform vec3 uGround;
  uniform vec3 uRimColor;
  uniform float uRim;
  uniform float uExposure;
  uniform float uGlow;

  varying vec3 vRest;
  varying vec3 vNormalW;
  varying vec3 vWorldPos;
  varying vec4 vPattern;
  varying float vH;

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  // Coverage of one strand lattice at normalised height h.
  // Lattices are rotated off the object axes so cell boundaries never line up
  // with the view (which would show as a faint cross at zero parallax).
  const mat3 ROT_A = mat3(0.8660, 0.3536, -0.3536, -0.2500, 0.9186, 0.3062, 0.4330, -0.1768, 0.8839);
  const mat3 ROT_B = mat3(0.5403, -0.5950, 0.5950, 0.8415, 0.3821, -0.3821, 0.0, 0.7071, 0.7071);

  float strands(vec3 r, mat3 rot, float density, float thick, float h, float minLen, float seed, out float rnd) {
    vec3 p = rot * r * density + seed;
    r = rot * r;
    vec3 cell = floor(p);
    vec3 f = fract(p) - 0.5;
    vec3 d = f - (hash33(cell) - 0.5) * 0.35;
    d -= dot(d, r) * r;                 // distance to a line along the normal
    float dist = length(d);
    rnd = hash13(cell + 17.0);
    float L = mix(minLen, 1.0, rnd);    // each strand has its own length
    float t = clamp(h / L, 0.0, 1.0);
    float radius = thick * 0.5 * pow(1.0 - t, 0.55);
    float aa = fwidth(dist) * 0.8 + 1e-4;
    float c = 1.0 - smoothstep(radius - aa, radius + aa, dist);
    return h > L ? 0.0 : c;
  }

  void main() {
    vec3 r = normalize(vRest);
    float h = vH;
    float clump = vPattern.z;

    float rnd = 0.5;
    float cov = 1.0;
    // A dense undercoat: the lowest shells are opaque so deep gaps never
    // reveal the bare body.
    if (h > 0.14) {
      float dens = uDensity * mix(1.0, 0.45, clump);
      float thick = uThickness * mix(1.0, 1.35, clump);
      float rA; float rB;
      float a = strands(r, ROT_A, dens, thick, h, 0.55, uSeed, rA);
      float b = strands(r, ROT_B, dens * 1.6, thick * 0.75, h, 0.3, uSeed + 41.0, rB);
      cov = max(a, b);
      rnd = a >= b ? rA : rB;
      // Opaque output (the canvas is premultiplied: partial alpha would let the
      // page bleed through the fur). Strand edges are anti-aliased by the
      // smooth coverage falloff and MSAA on the shell geometry.
      if (cov < 0.5) discard;
    }

    // ---- Albedo --------------------------------------------------------
    float tipMix = smoothstep(0.08, 1.0, h);
    vec3 albedo = mix(uBase, uTip, tipMix * 0.55);
    // Per-strand tonal variation keeps the fur alive.
    albedo *= mix(0.9, 1.06, rnd);

    float m = vPattern.x;
    if (uDetail == 2 || uDetail == 3 || uDetail == 4 || uDetail == 5) {
      albedo = mix(albedo, uDetailColor * mix(0.9, 1.05, tipMix), m);
    } else if (uDetail == 8) {
      albedo = mix(albedo, uDetailColor, m * smoothstep(0.15, 0.9, h));
    } else if (uDetail == 7) {
      float s = step(1.0 - uDetailAmount * 0.09, rnd) * smoothstep(0.3, 0.85, h);
      albedo = mix(albedo, uDetailColor, s);
    } else if (uDetail == 6) {
      albedo = mix(albedo, uDetailColor, m * 0.38 * smoothstep(0.0, 0.6, h));
    }

    // ---- Lighting -------------------------------------------------------
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vWorldPos);
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    vec3 Nf = normalize(mix(N, V, 0.18 * h));   // fur scatters, normals are soft

    float kd = clamp((dot(Nf, uKeyDir) + 0.3) / 1.3, 0.0, 1.0);
    float fd = clamp((dot(Nf, uFillDir) + 0.7) / 1.7, 0.0, 1.0);
    vec3 amb = mix(uGround, uSky, Nf.y * 0.5 + 0.5);
    float occ = mix(0.54, 1.0, pow(h, 0.9));

    // Broad form shading: the underside sits in its own soft shadow.
    float form = mix(0.62, 1.0, smoothstep(-0.9, 0.6, N.y));
    vec3 col = albedo * (amb * 0.34 + uKeyColor * kd * 0.78 + uFillColor * fd * 0.14) * occ * form;

    // Very soft anisotropic sheen (strand tangent ~ normal).
    vec3 H = normalize(uKeyDir + V);
    float th = dot(N, H);
    float kk = pow(sqrt(max(0.0, 1.0 - th * th)), 40.0);
    col += uKeyColor * kk * 0.05 * h;

    // Silvery band (Minuit): view-dependent shimmer.
    float fres = pow(1.0 - ndv, 2.2);
    col += mix(uDetailColor, vec3(1.0), 0.3) * vPattern.w * (0.05 + 0.4 * fres + 0.25 * kk) * tipMix;

    // Rim light + back-light translucency (subsurface-like glow).
    col += mix(uRimColor, uTip, 0.35) * fres * uRim * (0.2 + 0.8 * h) * 0.45;
    float back = pow(clamp(dot(V, -uKeyDir) * 0.5 + 0.5, 0.0, 1.0), 2.0);
    col += mix(albedo, uTip, 0.3) * fres * back * h * uGlow;

    gl_FragColor = vec4(col * uExposure, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export type Mood = 'day' | 'night';

const LIGHTS: Record<Mood, { key: string; fill: string; sky: string; ground: string; rim: string; rimStrength: number; exposure: number; glow: number }> = {
  day: { key: '#FFF7EE', fill: '#E4DDFF', sky: '#F1ECFF', ground: '#F6E9DD', rim: '#B9A6F0', rimStrength: 0.4, exposure: 1.1, glow: 0.22 },
  night: { key: '#F4EEFF', fill: '#8FA2FF', sky: '#B9AEF0', ground: '#4A3F8F', rim: '#B7A4FF', rimStrength: 1.15, exposure: 1.02, glow: 0.4 },
};

export function createFurMaterial(creature: Creature, shells: number, mood: Mood = 'day') {
  const l = LIGHTS[mood];
  const fur = creature.fur;
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: false,
    uniforms: {
      uShells: { value: shells },
      uLength: { value: fur.length * 0.9 },
      uGrow: { value: 1 },
      uTime: { value: 0 },
      uRuffle: { value: 0 },
      uDroop: { value: fur.droop ?? 0.3 },
      uFlow: { value: fur.flow ?? 0.3 },
      uWind: { value: 0.12 },
      uBase: { value: new THREE.Color(fur.base) },
      uTip: { value: new THREE.Color(fur.tip) },
      uDetailColor: { value: new THREE.Color(creature.detail.color ?? fur.tip) },
      uDetail: { value: DETAIL_INDEX[creature.detail.kind] },
      uDetailAmount: { value: creature.detail.amount ?? 0.6 },
      // Fewer shells → slightly thicker strands so coverage stays similar.
      uDensity: { value: fur.density * 0.68 },
      uThickness: { value: (fur.thickness ?? 0.58) * (shells < 20 ? 1.12 : 1) },
      uSeed: { value: (creature.seed % 97) * 3.17 },
      uKeyDir: { value: new THREE.Vector3(-0.55, 0.75, 0.65).normalize() },
      uKeyColor: { value: new THREE.Color(l.key) },
      uFillDir: { value: new THREE.Vector3(0.85, 0.1, 0.45).normalize() },
      uFillColor: { value: new THREE.Color(l.fill) },
      uSky: { value: new THREE.Color(l.sky) },
      uGround: { value: new THREE.Color(l.ground) },
      uRimColor: { value: new THREE.Color(l.rim) },
      uRim: { value: l.rimStrength },
      uExposure: { value: l.exposure },
      uGlow: { value: l.glow },
    },
  });
  return mat;
}
