/* Minitaure 3D — pièces partagées : lumières, matières, créatures en fourrure, étincelles.
   La fourrure utilise la technique des « coquilles » : la même sphère est dessinée en
   N couches de plus en plus grandes, et chaque couche ne garde que la pointe des poils. */
import * as THREE from "../vendor/three.module.js";

export { THREE };

export const PALETTE = {
  minotaure: { racine: "#3F2A9E", base: "#8C6CF0", pointe: "#D3C6FF" },
  gribou: { racine: "#B23F2F", base: "#FF8F7E", pointe: "#FFD3C8" },
  bloop: { racine: "#3A76C2", base: "#8FC8FF", pointe: "#E0F1FF" },
  noki: { racine: "#C4851C", base: "#FFD46B", pointe: "#FFF4CC" },
  pipo: { racine: "#2B8D6D", base: "#8EDDBE", pointe: "#DAF8EC" },
};

export function webgl2Dispo() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch (_) {
    return false;
  }
}

/* Uniforms partagés par toutes les matières d'une scène (mêmes objets = une seule mise à jour). */
export function lumieres() {
  return {
    uTime: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.45, 0.8, -0.35).normalize() },
    uMoonColor: { value: new THREE.Color("#4C5596") },
    uAmbient: { value: new THREE.Color("#0B0B1E") },
    uLanternPos: { value: new THREE.Vector3(0, 0.5, 0) },
    uLanternColor: { value: new THREE.Color("#FFC27A") },
    uLantern: { value: 0 },
    uRim: { value: new THREE.Color("#2C2668") },
    uFogColor: { value: new THREE.Color("#0E0C2A") },
    uFogDensity: { value: 0 },
  };
}

const LUMIERE = /* glsl */ `
uniform float uTime;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform vec3 uAmbient;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLantern;
uniform vec3 uRim;
uniform vec3 uFogColor;
uniform float uFogDensity;

vec3 eclairer(vec3 base, vec3 N, vec3 W, float wrap) {
  vec3 V = normalize(cameraPosition - W);
  float m = clamp((dot(N, uMoonDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 col = base * (uAmbient + uMoonColor * m);
  vec3 Ld = uLanternPos - W;
  float d2 = dot(Ld, Ld);
  vec3 L = Ld * inversesqrt(max(d2, 1e-4));
  float l = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  col += base * uLanternColor * (l * uLantern / (1.0 + d2 * 1.8));
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uRim * rim * (0.55 + 0.45 * m);
  return col;
}

float brume(float profondeur) {
  float f = uFogDensity * profondeur;
  return exp(-f * f);
}
`;

const HASH = /* glsl */ `
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
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float bruit(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * bruit(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

/* Répartition uniforme des poils sur la sphère (Fibonacci sphérique inverse, Keinert et al. / iq).
   fract(i * φ) est calculé en entiers pour rester précis même avec des dizaines de milliers de poils. */
const FIBONACCI = /* glsl */ `
const float PI_F = 3.14159265359;
const float PHI_F = 1.61803398875;
float fractPhi(float i) { return float(uint(i) * 2654435769u) * (1.0 / 4294967296.0); }
vec2 poilProche(vec3 p, float n) {
  float m = 1.0 - 1.0 / n;
  float phi = min(atan(p.y, p.x), PI_F);
  float cosT = p.z;
  float k = max(2.0, floor(log(n * PI_F * sqrt(5.0) * (1.0 - cosT * cosT)) / log(PHI_F * PHI_F)));
  float Fk = pow(PHI_F, k) / sqrt(5.0);
  vec2 F = vec2(round(Fk), round(Fk * PHI_F));
  vec2 ka = 2.0 * F / n;
  vec2 kb = 2.0 * PI_F * (vec2(fractPhi(F.x + 1.0), fractPhi(F.y + 1.0)) - (PHI_F - 1.0));
  mat2 iB = mat2(ka.y, -ka.x, kb.y, -kb.x) / (ka.y * kb.x - ka.x * kb.y);
  vec2 c = floor(iB * vec2(phi, cosT - m));
  float d = 8.0, j = 0.0;
  for (int s = 0; s < 4; s++) {
    vec2 uv = vec2(float(s - 2 * (s / 2)), float(s / 2));
    float i = dot(F, uv + c);
    if (i < 0.0 || i >= n) continue;
    float ph = 2.0 * PI_F * fractPhi(i);
    float ct = m - 2.0 * i / n;
    float st = sqrt(max(0.0, 1.0 - ct * ct));
    vec3 q = vec3(cos(ph) * st, sin(ph) * st, ct);
    float sd = dot(q - p, q - p);
    if (sd < d) { d = sd; j = i; }
  }
  return vec2(j, sqrt(d));
}
`;

export const GLSL = { LUMIERE, HASH };

/* ---------------- Fourrure ---------------- */
const FOURRURE_VS = /* glsl */ `
attribute float aShell;
uniform float uTime;
uniform float uFur;
uniform vec3 uGravity;
uniform float uWobble;
uniform float uSeed;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
varying float vS;
varying float vDepth;
void main() {
  vS = aShell;
  vec3 n = normalize(normal);
  vec3 p = position + n * uFur * aShell;
  float k2 = aShell * aShell;
  vec3 sway = vec3(sin(uTime * 1.7 + position.y * 9.0 + uSeed), 0.0, cos(uTime * 1.3 + position.x * 9.0 + uSeed)) * uWobble;
  p += (uGravity + sway) * uFur * k2;
  vO = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FOURRURE_FS = /* glsl */ `
${LUMIERE}
${HASH}
${FIBONACCI}
uniform float uStrands;
uniform vec3 uRoot;
uniform vec3 uBase;
uniform vec3 uTip;
uniform float uDensity;
uniform float uGlow;
uniform float uSeed;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
varying float vS;
varying float vDepth;
void main() {
  float a = 1.0;
  float h = 0.5;
  if (vS > 0.001) {
    vec3 dir = normalize(vO);
    // léger gauchissement pour casser la régularité des rangées de poils
    float esp = sqrt(12.566 / uStrands);
    dir = normalize(dir + esp * (0.7 * sin(dir.yzx * 41.0 + uSeed) + 0.45 * sin(dir.zxy * 97.0 - uSeed * 1.7)));
    // pôles de la spirale sur les côtés (vus de profil seulement)
    vec2 poil = poilProche(vec3(dir.y, dir.z, dir.x), uStrands);
    h = hash13(vec3(poil.x * 0.618, uSeed, 3.7));
    float h2 = hash13(vec3(uSeed, poil.x * 0.371, 9.1));
    float t = vS / (0.68 + 0.32 * h);
    if (t > 1.0) discard;
    float epais = mix(0.62, 0.18, t) * (0.8 + 0.4 * h2);
    float d = poil.y / esp;
    a = 1.0 - smoothstep(epais * 0.5, epais, d);
    if (a < 0.02) discard;
  }
  vec3 N = normalize(vN);
  vec3 base = mix(uRoot, uBase, smoothstep(0.0, 0.55, vS));
  base = mix(base, uTip, smoothstep(0.5, 1.0, vS) * 0.75);
  base *= 0.9 + 0.2 * h;
  vec3 col = eclairer(base, N, vW, 0.65);
  col *= mix(0.6, 1.0, vS);
  vec3 V = normalize(cameraPosition - vW);
  col += base * uGlow * (0.16 + 0.55 * pow(1.0 - abs(dot(N, V)), 2.0));
  col = mix(uFogColor, col, brume(vDepth));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

/* ---------------- Matière « solide » (accessoires, décor) ---------------- */
const SOLIDE_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vDepth;
varying float vId;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
    vId = float(gl_InstanceID);
  #else
    vId = 0.0;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vCol = instanceColor;
  #else
    vCol = vec3(1.0);
  #endif
  vec4 w = modelMatrix * p;
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * n);
  vec4 mv = viewMatrix * w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const SOLIDE_FS = /* glsl */ `
${LUMIERE}
uniform vec3 uColor;
uniform float uEmissive;
uniform float uGlow;
uniform float uOpacity;
uniform float uWrap;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying float vDepth;
varying float vId;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 base = uColor * vCol;
  vec3 col = eclairer(base, N, vW, uWrap);
  float pulse = 1.0;
  #ifdef PULSE
    pulse = 0.55 + 0.45 * sin(uTime * 1.4 + vId * 2.3);
  #endif
  col += base * (uEmissive * pulse + uGlow * 0.3);
  float fa = brume(vDepth);
  col = mix(uFogColor, col, fa);
  float alpha = uOpacity;
  #ifdef FONDU
    alpha *= fa;
  #endif
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function solide(couleur, L, o = {}) {
  const defines = {};
  if (o.pulse) defines.PULSE = "";
  if (o.fondu) defines.FONDU = "";
  const opacite = o.opacite ?? 1;
  const uniforms = {
    ...L,
    uColor: { value: new THREE.Color(couleur) },
    uEmissive: { value: o.emissive ?? 0 },
    uGlow: o.glow || { value: 0 },
    uOpacity: { value: opacite },
    uWrap: { value: o.wrap ?? 0.5 },
  };
  if (o.brume !== undefined) uniforms.uFogDensity = { value: o.brume };
  return new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: SOLIDE_VS,
    fragmentShader: SOLIDE_FS,
    transparent: opacite < 1 || !!o.fondu,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: o.depthWrite ?? true,
  });
}

/* ---------------- Points lumineux (lucioles, étincelles, éclats) ---------------- */
const POINTS_VS = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
attribute vec3 aSeed;
uniform float uTime;
uniform float uPx;
uniform float uEchelle;
uniform float uFlotte;
uniform float uEclat;
varying vec3 vColor;
varying float vA;
void main() {
  vec3 p = position;
  float b = 1.0;
  if (uFlotte > 0.0) {
    float t = uTime;
    p.x += (sin(t * 0.31 + aSeed.x * 6.283) * 0.7 + sin(t * 0.73 + aSeed.y * 12.0) * 0.2) * uFlotte;
    p.y += sin(t * 0.43 + aSeed.y * 6.283) * 0.35 * uFlotte;
    p.z += cos(t * 0.27 + aSeed.z * 6.283) * 0.7 * uFlotte;
    b = 0.5 + 0.5 * sin(t * (1.1 + aSeed.x * 1.8) + aSeed.z * 30.0);
    b = mix(1.0, smoothstep(0.1, 1.0, b), step(0.001, aSeed.x + aSeed.y));
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = aAlpha * b * uEclat;
  vColor = aColor;
  gl_PointSize = aSize * uPx * uEchelle / max(-mv.z, 0.05) * (0.65 + 0.35 * b);
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FS = /* glsl */ `
uniform float uForme;
varying vec3 vColor;
varying float vA;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float halo = exp(-d * d * 5.0) * 0.55 + exp(-d * d * 38.0);
  float eclat = max(0.0, 1.0 - abs(p.x * p.y) * 18.0) * max(0.0, 1.0 - d) * 1.4;
  float a = mix(halo, max(halo * 0.6, eclat), uForme) * smoothstep(1.0, 0.7, d) * vA;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export function matierePoints(o = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: o.temps || { value: 0 },
      uPx: { value: 1 },
      uEchelle: { value: 500 },
      uFlotte: { value: o.flotte ?? 0 },
      uEclat: { value: o.eclat ?? 1 },
      uForme: { value: o.forme ?? 0 },
    },
    vertexShader: POINTS_VS,
    fragmentShader: POINTS_FS,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    premultipliedAlpha: true,
  });
}

export function nuageDePoints(liste, mat) {
  const n = liste.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), alpha = new Float32Array(n), taille = new Float32Array(n), seed = new Float32Array(n * 3);
  const c = new THREE.Color();
  liste.forEach((p, i) => {
    pos.set(p.pos, i * 3);
    c.set(p.couleur);
    col.set([c.r, c.g, c.b], i * 3);
    alpha[i] = p.alpha ?? 1;
    taille[i] = p.taille;
    seed.set(p.seed || [0, 0, 0], i * 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(taille, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/* Étincelles : petit système de particules sur le processeur (pool circulaire). */
export class Etincelles {
  constructor(n, temps) {
    this.n = n;
    this.i = 0;
    this.vel = new Float32Array(n * 3);
    this.vie = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.taille0 = new Float32Array(n);
    this.mat = matierePoints({ temps, forme: 1 });
    this.points = nuageDePoints(Array.from({ length: n }, () => ({ pos: [0, -99, 0], couleur: "#ffffff", alpha: 0, taille: 0 })), this.mat);
    const g = this.points.geometry;
    this.pos = g.attributes.position;
    this.alpha = g.attributes.aAlpha;
    this.taille = g.attributes.aSize;
    this.col = g.attributes.aColor;
    [this.pos, this.alpha, this.taille, this.col].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.actives = 0;
  }
  emettre(origine, couleur, nombre = 24, vitesse = 1.2, taille = 0.07) {
    const c = new THREE.Color(couleur), blanc = new THREE.Color("#fff");
    for (let k = 0; k < nombre; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.n;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const v = vitesse * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * v * 0.9 + 0.3;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
      this.pos.setXYZ(i, origine.x, origine.y, origine.z);
      const m = Math.random() < 0.35 ? blanc : c;
      this.col.setXYZ(i, m.r, m.g, m.b);
      this.max[i] = this.vie[i] = 0.9 + Math.random() * 0.9;
      this.taille0[i] = taille * (0.5 + Math.random());
    }
    this.actives = this.n;
    [this.col].forEach((a) => (a.needsUpdate = true));
  }
  maj(dt) {
    if (!this.actives) return;
    let vivantes = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.vie[i] <= 0) continue;
      this.vie[i] -= dt;
      const t = Math.max(this.vie[i] / this.max[i], 0);
      vivantes++;
      const j = i * 3;
      this.vel[j] *= 0.97;
      this.vel[j + 2] *= 0.97;
      this.vel[j + 1] = this.vel[j + 1] * 0.97 + 0.15 * dt;
      this.pos.setXYZ(i, this.pos.getX(i) + this.vel[j] * dt, this.pos.getY(i) + this.vel[j + 1] * dt, this.pos.getZ(i) + this.vel[j + 2] * dt);
      this.alpha.setX(i, t > 0 ? Math.min(1, t * 1.6) : 0);
      this.taille.setX(i, this.taille0[i] * (0.4 + 0.6 * t));
    }
    this.actives = vivantes;
    this.pos.needsUpdate = this.alpha.needsUpdate = this.taille.needsUpdate = true;
  }
}

/* ---------------- Géométries utilitaires ---------------- */
function tubeEffile(points, r0, r1, seg = 28, rad = 10) {
  const courbe = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(courbe, seg, 1, rad, false);
  const pos = geo.attributes.position, nor = geo.attributes.normal, P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const r = r0 + (r1 - r0) * t;
    courbe.getPointAt(t, P);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      pos.setXYZ(k, P.x + nor.getX(k) * r, P.y + nor.getY(k) * r, P.z + nor.getZ(k) * r);
    }
  }
  pos.needsUpdate = true;
  return geo;
}

function goutte() {
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    pts.push(new THREE.Vector2(0.085 * Math.pow(Math.sin(Math.PI * u), 0.85) * (0.3 + 0.7 * u), 0.22 * (1 - u)));
  }
  return new THREE.LatheGeometry(pts, 28);
}

const FLAQUE_FS = /* glsl */ `
${LUMIERE}
varying vec2 vUv;
varying vec3 vW;
uniform float uGlow;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  if (d > 1.0) discard;
  float bord = smoothstep(1.0, 0.75, d);
  float rides = 0.5 + 0.5 * sin(d * 26.0 - uTime * 2.2);
  vec3 eau = mix(vec3(0.02, 0.06, 0.22), vec3(0.2, 0.45, 1.0), 0.25 + 0.25 * rides * (1.0 - d));
  // reflet de lune : un rond lumineux et son croissant
  vec2 c = p - vec2(0.18, -0.12);
  float lune = smoothstep(0.32, 0.26, length(c)) - smoothstep(0.30, 0.24, length(c - vec2(0.09, 0.05))) * 0.85;
  vec3 col = eau * (0.3 + min(uMoonColor, vec3(0.5)) * 0.9) + vec3(1.0, 0.95, 0.78) * max(lune, 0.0) * (0.35 + uGlow * 0.6);
  vec3 Ld = uLanternPos - vW;
  col += uLanternColor * uLantern * 0.35 / (1.0 + dot(Ld, Ld) * 2.0);
  gl_FragColor = vec4(col, bord * 0.75);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function flaque(L, glow) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.ShaderMaterial({
      uniforms: { ...L, uGlow: glow },
      vertexShader: "varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: FLAQUE_FS,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.set(0.62, 0.42, 1);
  m.position.y = 0.006;
  m.renderOrder = 3;
  return m;
}

/* ---------------- Créature ---------------- */
let graine = 1;
export class Creature {
  constructor(id, L, o = {}) {
    const q = { couches: 28, densite: 64, poils: 14000, fourrure: 0.095, segW: 64, segH: 40, ...o };
    const P = PALETTE[id];
    this.id = id;
    this.L = L;
    this.R = 0.42;
    this.graine = (graine++ * 1.618) % 10;
    this.glow = { value: o.glow ?? 0 };
    this.cibleGlow = this.glow.value;
    this.groupe = new THREE.Group();
    this.pivot = new THREE.Group();
    this.corps = new THREE.Group();
    this.groupe.add(this.pivot);
    this.pivot.add(this.corps);
    this.corps.position.y = this.R * 0.92;
    // saut et ressort d'écrasement
    this.y = 0;
    this.vy = 0;
    this.s = 0;
    this.sv = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.cibleYaw = 0;
    this.ciblePitch = 0;

    const sphere = new THREE.SphereGeometry(this.R, q.segW, q.segH);
    const g = new THREE.InstancedBufferGeometry();
    g.index = sphere.index;
    g.setAttribute("position", sphere.attributes.position);
    g.setAttribute("normal", sphere.attributes.normal);
    const couches = new Float32Array(q.couches);
    for (let i = 0; i < q.couches; i++) couches[i] = i / (q.couches - 1);
    g.setAttribute("aShell", new THREE.InstancedBufferAttribute(couches, 1));
    g.instanceCount = q.couches;
    this.matFourrure = new THREE.ShaderMaterial({
      uniforms: {
        ...L,
        uRoot: { value: new THREE.Color(P.racine) },
        uBase: { value: new THREE.Color(P.base) },
        uTip: { value: new THREE.Color(P.pointe) },
        uFur: { value: q.fourrure },
        uDensity: { value: q.densite },
        uStrands: { value: q.poils },
        uGlow: this.glow,
        uGravity: { value: new THREE.Vector3(0, -0.16, 0.0) },
        uWobble: { value: 0.12 },
        uSeed: { value: this.graine },
      },
      vertexShader: FOURRURE_VS,
      fragmentShader: FOURRURE_FS,
      alphaToCoverage: true,
    });
    const fourrure = new THREE.Mesh(g, this.matFourrure);
    fourrure.frustumCulled = false;
    this.corps.add(fourrure);

    const pied = solide(P.racine, L, { glow: this.glow, wrap: 0.8 });
    const geoPied = new THREE.SphereGeometry(0.1, 16, 12);
    [-1, 1].forEach((sx) => {
      const m = new THREE.Mesh(geoPied, pied);
      m.scale.set(1, 0.55, 1.25);
      m.position.set(0.17 * sx, -0.35, 0.07);
      this.corps.add(m);
    });

    this.eclats = null;
    this.accessoires(id, L);
  }

  accessoires(id, L) {
    const R = this.R, c = this.corps, glow = this.glow;
    const vert = solide("#6FCB9F", L, { glow, wrap: 0.7, emissive: 0.05 });
    const feuille = (x, y, z, rz, ry = 0, s = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), vert);
      m.scale.set(0.085 * s, 0.022 * s, 0.045 * s);
      m.position.set(x, y, z);
      m.rotation.set(0, ry, rz);
      c.add(m);
    };
    if (id === "minotaure") {
      const corne = solide("#F6E7C8", L, { glow, wrap: 0.6, emissive: 0.04 });
      [-1, 1].forEach((sx) => {
        const geo = tubeEffile([[0.2 * sx, 0.3, 0.02], [0.31 * sx, 0.44, 0.03], [0.35 * sx, 0.57, 0.0], [0.29 * sx, 0.67, -0.04]], 0.048, 0.012);
        c.add(new THREE.Mesh(geo, corne));
      });
      feuille(0.03, R + 0.06, 0.06, 0.5, 0.4);
      feuille(-0.06, R + 0.05, 0.02, -0.4, -0.5, 0.8);
    } else if (id === "gribou") {
      const tige = solide("#5FAF7F", L, { glow, wrap: 0.6, emissive: 0.04 });
      const geo = tubeEffile([[0, 0.36, 0], [0.01, 0.5, 0.0], [0.05, 0.62, 0.01], [0.12, 0.67, 0.02], [0.17, 0.63, 0.02], [0.15, 0.58, 0.02], [0.11, 0.6, 0.02]], 0.02, 0.009, 40);
      c.add(new THREE.Mesh(geo, tige));
      feuille(-0.07, 0.5, 0.0, -0.65, 0.2);
    } else if (id === "bloop") {
      const eau = solide("#A9D8FF", L, { glow, wrap: 1, emissive: 0.5, opacite: 0.82 });
      const m = new THREE.Mesh(goutte(), eau);
      m.position.set(0, R + 0.02, 0.03);
      c.add(m);
      this.flaque = flaque(L, glow);
      this.groupe.add(this.flaque);
    } else if (id === "noki") {
      this.eclats = nuageDePoints(
        [
          { pos: [0, R + 0.2, 0], couleur: "#FFF6D8", taille: 0.34 },
          { pos: [0.5, 0.2, 0], couleur: "#FFFFFF", taille: 0.2 },
          { pos: [-0.5, 0.0, 0], couleur: "#FFF2C0", taille: 0.16 },
          { pos: [0.2, -0.1, 0.5], couleur: "#FFFFFF", taille: 0.12 },
        ],
        matierePoints({ temps: L.uTime, forme: 1 })
      );
      c.add(this.eclats);
    } else if (id === "pipo") {
      const tige = solide("#4FB18D", L, { glow, wrap: 0.6 });
      c.add(new THREE.Mesh(tubeEffile([[0, 0.36, 0], [0.015, 0.5, 0], [0, 0.6, 0]], 0.018, 0.012, 16), tige));
      feuille(0.06, 0.5, 0.0, 0.6, 0.3);
      const petale = solide("#FF8F7E", L, { glow, wrap: 0.8, emissive: 0.08 });
      const coeur = solide("#FFD46B", L, { glow, wrap: 0.8, emissive: 0.2 });
      const fleur = new THREE.Group();
      fleur.position.set(0, 0.62, 0);
      fleur.rotation.x = 0.35;
      const geo = new THREE.SphereGeometry(1, 16, 10);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = new THREE.Mesh(geo, petale);
        m.scale.set(0.055, 0.02, 0.036);
        m.position.set(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05);
        m.rotation.y = -a;
        m.rotation.z = 0.25;
        fleur.add(m);
      }
      const centre = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), coeur);
      centre.position.y = 0.012;
      fleur.add(centre);
      c.add(fleur);
      this.fleur = fleur;
    }
  }

  sauter(force = 1) {
    if (this.y > 0.02) return;
    this.vy = 2.2 * force;
    this.sv += 3.2 * force;
  }

  maj(t, dt) {
    if (this.vy !== 0 || this.y > 0) {
      this.vy -= 9 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.sv -= Math.min(5, Math.abs(this.vy) * 1.6);
        this.vy = 0;
      }
    }
    this.sv += (-140 * this.s - 9 * this.sv) * dt;
    this.s += this.sv * dt;
    const souffle = Math.sin(t * 2.1 + this.graine) * 0.018;
    const sy = 1 + this.s * 0.22 + souffle, sxz = 1 - this.s * 0.11 - souffle * 0.5;
    this.corps.scale.set(sxz, sy, sxz);
    this.corps.position.y = this.R * 0.92 * sy + this.y;
    this.matFourrure.uniforms.uGravity.value.y = -0.16 - this.vy * 0.1;
    this.matFourrure.uniforms.uWobble.value = 0.1 + Math.min(Math.abs(this.sv) * 0.04, 0.4);
    this.yaw += (this.cibleYaw - this.yaw) * Math.min(1, dt * 5);
    this.pitch += (this.ciblePitch - this.pitch) * Math.min(1, dt * 5);
    this.pivot.rotation.set(this.pitch, this.yaw, 0);
    this.glow.value += (this.cibleGlow - this.glow.value) * Math.min(1, dt * 2.5);
    if (this.eclats) {
      const p = this.eclats.geometry.attributes.position;
      p.setXYZ(1, Math.cos(t * 1.1) * 0.55, 0.15 + Math.sin(t * 1.7) * 0.1, Math.sin(t * 1.1) * 0.55);
      p.setXYZ(2, Math.cos(t * 0.8 + 2.4) * 0.6, -0.05 + Math.sin(t * 1.3) * 0.12, Math.sin(t * 0.8 + 2.4) * 0.6);
      p.setXYZ(3, Math.cos(-t * 1.4 + 4) * 0.5, 0.3 + Math.sin(t * 2) * 0.08, Math.sin(-t * 1.4 + 4) * 0.5);
      p.needsUpdate = true;
    }
    if (this.fleur) this.fleur.rotation.y = Math.sin(t * 0.9 + this.graine) * 0.35;
  }

  // centre du corps, en coordonnées monde
  centre(v) {
    return this.corps.getWorldPosition(v);
  }
}
