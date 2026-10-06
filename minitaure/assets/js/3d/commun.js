/* Minitaure 3D — pièces partagées : lumières, matières, créatures-animaux en fourrure, particules.
   La fourrure utilise la technique des « coquilles » : la même forme est dessinée en
   N couches de plus en plus grandes, et chaque couche ne garde que la pointe des poils. */
import * as THREE from "../vendor/three.module.js";

export { THREE };

/* Couleurs vives de chaque créature (racine → pointe des poils, ventre plus clair, pattes, détails). */
export const PALETTE = {
  minotaure: { racine: "#3A1C94", base: "#8A5CFF", pointe: "#B9A0FF", ventre: "#CDB8FF", patte: "#3B2463", oreille: "#FF9FC8", oreille2: "#7448E6", corne: "#FFF0D2", touffe: "#5A33D6" },
  gribou: { racine: "#A92A16", base: "#FF6A45", pointe: "#FF9E7E", ventre: "#FFD2BC", patte: "#7A2112", oreille: "#FFE6D8", touffe: "#FFF4EA" },
  bloop: { racine: "#0B66B0", base: "#33B4FF", pointe: "#80D3FF", ventre: "#B5E6FF", patte: "#1673B6", oreille: "#C2EAFF", oreille2: "#2399E6" },
  noki: { racine: "#C27A00", base: "#FFC21F", pointe: "#FFDD6E", ventre: "#FFEBA6", patte: "#FF8A1F", plume: "#FF9F1C" },
  pipo: { racine: "#0F8656", base: "#35DA93", pointe: "#7EEDB9", ventre: "#B6F5D5", patte: "#26B377", oreille: "#FFB0C6", oreille2: "#2ECB86", touffe: "#FFFFFF" },
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
    uSunDir: { value: new THREE.Vector3(-0.5, 0.6, 0.62).normalize() },
    uSunColor: { value: new THREE.Color("#FFD2A1") },
    uSky: { value: new THREE.Color("#7F78D0") },
    uGround: { value: new THREE.Color("#3D6B2E") },
    uLanternPos: { value: new THREE.Vector3(0, 0.5, 0) },
    uLanternColor: { value: new THREE.Color("#FFE2A0") },
    uLantern: { value: 0 },
    uRim: { value: new THREE.Color("#FF9E7A") },
    uFogColor: { value: new THREE.Color("#E9A08E") },
    uFogDensity: { value: 0 },
  };
}

const LUMIERE = /* glsl */ `
uniform float uTime;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLantern;
uniform vec3 uRim;
uniform vec3 uFogColor;
uniform float uFogDensity;

vec3 eclairer(vec3 base, vec3 N, vec3 W, float wrap) {
  vec3 V = normalize(cameraPosition - W);
  float s = clamp((dot(N, uSunDir) + wrap) / (1.0 + wrap), 0.0, 1.0);
  vec3 ambiance = mix(uGround, uSky, N.y * 0.5 + 0.5);
  vec3 col = base * (ambiance + uSunColor * s);
  vec3 Ld = uLanternPos - W;
  float d2 = dot(Ld, Ld);
  vec3 L = Ld * inversesqrt(max(d2, 1e-4));
  float l = clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
  col += base * uLanternColor * (l * uLantern / (1.0 + d2 * 1.8));
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += (base * 0.9 + 0.12) * uRim * rim;
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
uniform float uGlow;
uniform float uSeed;
uniform vec3 uZoneDir;
uniform vec3 uZoneCol;
uniform vec3 uZone;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
varying float vS;
varying float vDepth;
void main() {
  vec3 dir = normalize(vO);
  float a = 1.0;
  float h = 0.5;
  if (vS > 0.001) {
    // léger gauchissement pour casser la régularité des rangées de poils
    float esp = sqrt(12.566 / uStrands);
    vec3 d2 = normalize(dir + esp * (0.7 * sin(dir.yzx * 41.0 + uSeed) + 0.45 * sin(dir.zxy * 97.0 - uSeed * 1.7)));
    // pôles de la spirale sur les côtés (vus de profil seulement)
    vec2 poil = poilProche(vec3(d2.y, d2.z, d2.x), uStrands);
    h = hash13(vec3(poil.x * 0.618, uSeed, 3.7));
    float h2 = hash13(vec3(uSeed, poil.x * 0.371, 9.1));
    float t = vS / (0.7 + 0.3 * h);
    if (t > 1.0) discard;
    float epais = mix(0.72, 0.26, t) * (0.82 + 0.36 * h2);
    a = 1.0 - smoothstep(epais * 0.5, epais, poil.y / esp);
    if (a < 0.02) discard;
  }
  vec3 N = normalize(vN);
  // zone plus claire : ventre des animaux, bout de la queue du renard…
  float zone = smoothstep(uZone.x, uZone.y, dot(dir, uZoneDir)) * uZone.z;
  vec3 root = mix(uRoot, uZoneCol * 0.8, zone * 0.7);
  vec3 base = mix(uBase, uZoneCol, zone);
  vec3 tip = mix(uTip, mix(uZoneCol, vec3(1.0), 0.4), zone);
  vec3 c = mix(root, base, smoothstep(0.0, 0.55, vS));
  c = mix(c, tip, smoothstep(0.5, 1.0, vS) * 0.7);
  c *= 0.92 + 0.16 * h;
  vec3 col = eclairer(c, N, vW, 0.7);
  col *= mix(0.6, 1.0, vS);
  // couleurs bien vives
  float lumi = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lumi), col, 1.2), 0.0);
  col += c * uGlow * 0.18;
  col = mix(uFogColor, col, brume(vDepth));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

function pelage(geo, P, L, q, glow, zone = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  g.setAttribute("position", geo.attributes.position);
  g.setAttribute("normal", geo.attributes.normal);
  const couches = new Float32Array(q.couches);
  for (let i = 0; i < q.couches; i++) couches[i] = i / (q.couches - 1);
  g.setAttribute("aShell", new THREE.InstancedBufferAttribute(couches, 1));
  g.instanceCount = q.couches;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...L,
      uRoot: { value: new THREE.Color(P.racine) },
      uBase: { value: new THREE.Color(P.base) },
      uTip: { value: new THREE.Color(P.pointe) },
      uFur: { value: q.fourrure },
      uStrands: { value: q.poils },
      uGlow: glow,
      uGravity: { value: new THREE.Vector3(0, -0.3, 0.0) },
      uWobble: { value: 0.1 },
      uSeed: { value: Math.random() * 10 },
      uZoneDir: { value: new THREE.Vector3(...(zone.dir || [0, -0.35, 1])).normalize() },
      uZoneCol: { value: new THREE.Color(zone.couleur || P.ventre || P.pointe) },
      uZone: { value: new THREE.Vector3(zone.debut ?? 0.35, zone.fin ?? 0.85, zone.force ?? 0) },
    },
    vertexShader: FOURRURE_VS,
    fragmentShader: FOURRURE_FS,
    alphaToCoverage: true,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/* ---------------- Matière « solide » (oreilles, pattes, décor) ---------------- */
const SOLIDE_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying vec3 vObj;
varying float vDepth;
varying float vId;
void main() {
  vec4 p = vec4(position, 1.0);
  vec3 n = normal;
  vObj = position;
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
${HASH}
uniform vec3 uColor;
uniform float uEmissive;
uniform float uGlow;
uniform float uOpacity;
uniform float uWrap;
varying vec3 vN;
varying vec3 vW;
varying vec3 vCol;
varying vec3 vObj;
varying float vDepth;
varying float vId;
void main() {
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 base = uColor * vCol;
  #ifdef POIS
    // pois blancs des champignons
    vec3 o = normalize(vObj);
    vec2 g = vec2(atan(o.z, o.x) * 1.9, o.y * 4.2);
    vec2 f = fract(g) - 0.5;
    float hp = hash12(floor(g) + vId * 7.0);
    float tache = (1.0 - smoothstep(0.17, 0.24, length(f + (hp - 0.5) * 0.25))) * step(0.3, hp) * step(0.12, o.y);
    base = mix(base, vec3(1.0, 0.97, 0.9), tache);
  #endif
  vec3 col = eclairer(base, N, vW, uWrap);
  float pulse = 1.0;
  #ifdef PULSE
    pulse = 0.55 + 0.45 * sin(uTime * 1.4 + vId * 2.3);
  #endif
  col += base * (uEmissive * pulse + uGlow * 0.15);
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
  if (o.pois) defines.POIS = "";
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

/* ---------------- Points (lucioles, étincelles, feuilles qui volent) ---------------- */
const POINTS_VS = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
attribute vec3 aSeed;
attribute float aRot;
uniform float uTime;
uniform float uPx;
uniform float uEchelle;
uniform float uFlotte;
uniform float uEclat;
varying vec3 vColor;
varying float vA;
varying float vRot;
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
  vRot = aRot;
  gl_PointSize = aSize * uPx * uEchelle / max(-mv.z, 0.05) * (0.65 + 0.35 * b);
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FS = /* glsl */ `
uniform float uForme;
varying vec3 vColor;
varying float vA;
varying float vRot;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (uForme > 1.5) {
    // petite feuille qui tournoie
    float c = cos(vRot), s = sin(vRot);
    p = mat2(c, -s, s, c) * p;
    float d = length(vec2(p.x * 1.9, p.y - 0.18 * p.x * p.x));
    float a = (1.0 - smoothstep(0.78, 0.94, d)) * vA;
    if (a < 0.02) discard;
    float nervure = (1.0 - smoothstep(0.0, 0.07, abs(p.x))) * 0.18;
    gl_FragColor = vec4((vColor * (0.82 + 0.3 * (p.y * 0.5 + 0.5)) + nervure) * a, a);
    return;
  }
  float d = length(p);
  if (d > 1.0) discard;
  float halo = exp(-d * d * 5.0) * 0.55 + exp(-d * d * 38.0);
  float eclat = max(0.0, 1.0 - abs(p.x * p.y) * 18.0) * max(0.0, 1.0 - d) * 1.4;
  float a = mix(halo, max(halo * 0.6, eclat), uForme) * smoothstep(1.0, 0.7, d) * vA;
  gl_FragColor = vec4(vColor * a, a);
}
`;

export function matierePoints(o = {}) {
  const feuilles = (o.forme ?? 0) > 1.5;
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
    blending: feuilles ? THREE.NormalBlending : THREE.AdditiveBlending,
    premultipliedAlpha: true,
  });
}

export function nuageDePoints(liste, mat) {
  const n = liste.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), alpha = new Float32Array(n), taille = new Float32Array(n), seed = new Float32Array(n * 3), rot = new Float32Array(n);
  const c = new THREE.Color();
  liste.forEach((p, i) => {
    pos.set(p.pos, i * 3);
    c.set(p.couleur);
    col.set([c.r, c.g, c.b], i * 3);
    alpha[i] = p.alpha ?? 1;
    taille[i] = p.taille;
    seed.set(p.seed || [0, 0, 0], i * 3);
    rot[i] = p.rot ?? 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aAlpha", new THREE.BufferAttribute(alpha, 1));
  g.setAttribute("aSize", new THREE.BufferAttribute(taille, 1));
  g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 3));
  g.setAttribute("aRot", new THREE.BufferAttribute(rot, 1));
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

/* Particules sur le processeur (pool circulaire) : étincelles qui montent ou feuilles qui retombent. */
export class Etincelles {
  constructor(n, temps, o = {}) {
    this.n = n;
    this.i = 0;
    this.feuilles = (o.forme ?? 1) > 1.5;
    this.gravite = o.gravite ?? 0.15;
    this.vel = new Float32Array(n * 3);
    this.vie = new Float32Array(n);
    this.max = new Float32Array(n).fill(1);
    this.taille0 = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.mat = matierePoints({ temps, forme: o.forme ?? 1 });
    this.points = nuageDePoints(Array.from({ length: n }, () => ({ pos: [0, -99, 0], couleur: "#ffffff", alpha: 0, taille: 0 })), this.mat);
    const g = this.points.geometry;
    this.pos = g.attributes.position;
    this.alpha = g.attributes.aAlpha;
    this.taille = g.attributes.aSize;
    this.col = g.attributes.aColor;
    this.rot = g.attributes.aRot;
    [this.pos, this.alpha, this.taille, this.col, this.rot].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    this.actives = 0;
  }
  emettre(origine, couleurs, nombre = 24, vitesse = 1.2, taille = 0.07) {
    const palette = (Array.isArray(couleurs) ? couleurs : [couleurs]).map((x) => new THREE.Color(x));
    const blanc = new THREE.Color("#fff");
    for (let k = 0; k < nombre; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.n;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
      const v = vitesse * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
      this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * v * 0.9 + 0.3 * vitesse;
      this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
      this.pos.setXYZ(i, origine.x, origine.y, origine.z);
      const m = !this.feuilles && Math.random() < 0.35 ? blanc : palette[(Math.random() * palette.length) | 0];
      this.col.setXYZ(i, m.r, m.g, m.b);
      this.max[i] = this.vie[i] = (this.feuilles ? 1.4 : 0.9) + Math.random() * 0.9;
      this.taille0[i] = taille * (0.5 + Math.random());
      this.rot.setX(i, Math.random() * 6.28);
      this.spin[i] = (Math.random() - 0.5) * 9;
    }
    this.actives = this.n;
    this.col.needsUpdate = true;
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
      const frein = this.feuilles ? 0.95 : 0.97;
      this.vel[j] *= frein;
      this.vel[j + 2] *= frein;
      this.vel[j + 1] = this.vel[j + 1] * frein + this.gravite * dt;
      // les feuilles se balancent en tombant
      const balance = this.feuilles ? Math.sin(this.vie[i] * 5 + i) * 0.25 * dt : 0;
      this.pos.setXYZ(i, this.pos.getX(i) + this.vel[j] * dt + balance, this.pos.getY(i) + this.vel[j + 1] * dt, this.pos.getZ(i) + this.vel[j + 2] * dt);
      this.alpha.setX(i, t > 0 ? Math.min(1, t * 1.6) : 0);
      this.taille.setX(i, this.taille0[i] * (this.feuilles ? 0.7 + 0.3 * t : 0.4 + 0.6 * t));
      this.rot.setX(i, this.rot.getX(i) + this.spin[i] * dt);
    }
    this.actives = vivantes;
    this.pos.needsUpdate = this.alpha.needsUpdate = this.taille.needsUpdate = this.rot.needsUpdate = true;
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

const SPHERE = new THREE.SphereGeometry(1, 20, 14);
function ellipsoide(sx, sy, sz, seg = 28) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(sx, sy, sz);
  return g;
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
  float bord = smoothstep(1.0, 0.78, d);
  float rides = 0.5 + 0.5 * sin(d * 26.0 - uTime * 2.2);
  vec3 eau = mix(vec3(0.02, 0.22, 0.45), vec3(0.25, 0.7, 1.0), 0.3 + 0.3 * rides * (1.0 - d));
  vec3 col = eau * (0.5 + uSky * 0.8) ;
  // reflet du ciel et de la lune
  vec2 c = p - vec2(0.2, -0.15);
  float lune = smoothstep(0.3, 0.24, length(c)) - smoothstep(0.28, 0.22, length(c - vec2(0.09, 0.05))) * 0.8;
  col += vec3(1.0, 0.92, 0.75) * max(lune, 0.0) * 0.7;
  vec3 Ld = uLanternPos - vW;
  col += uLanternColor * uLantern * 0.3 / (1.0 + dot(Ld, Ld) * 2.0);
  gl_FragColor = vec4(col, bord * 0.85);
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
  m.scale.set(0.66, 0.46, 1);
  m.position.set(0.05, 0.006, 0.08);
  m.renderOrder = 3;
  return m;
}

/* Ombre douce sous la créature : elle « pose » au sol au lieu de flotter. */
function ombre() {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.ShaderMaterial({
      uniforms: { uForce: { value: 0.42 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform float uForce; varying vec2 vUv; void main(){ float d = length(vUv * 2.0 - 1.0); float a = (1.0 - smoothstep(0.1, 1.0, d)) * uForce; gl_FragColor = vec4(0.02, 0.06, 0.03, a); }",
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.004;
  m.scale.set(0.5, 0.42, 1);
  m.renderOrder = 2;
  return m;
}

/* ---------------- Créature-animal ---------------- */
// Un petit animal assis : un corps rond, une tête ronde par-dessus (sans visage), des oreilles,
// une queue et des pattes. La tête se tourne et s'incline avec curiosité.
let graine = 1;
export class Creature {
  constructor(id, L, o = {}) {
    const q = { couches: 28, poils: 14000, fourrure: 0.075, segW: 64, segH: 40, ...o };
    const P = PALETTE[id];
    this.id = id;
    this.L = L;
    this.q = q;
    this.R = 0.42;
    this.graine = (graine++ * 1.618) % 10;
    this.glow = { value: o.glow ?? 0 };
    this.cibleGlow = this.glow.value;
    this.groupe = new THREE.Group();
    this.pivot = new THREE.Group();
    this.corps = new THREE.Group();
    this.groupe.add(this.pivot);
    this.pivot.add(this.corps);
    this.hauteur = 0.3;
    this.corps.position.y = this.hauteur;
    this.tete = new THREE.Group();
    this.tete.position.set(0, 0.36, 0.1);
    this.corps.add(this.tete);
    // saut, ressort d'écrasement, orientation, inclinaison de la tête
    this.y = 0;
    this.vy = 0;
    this.s = 0;
    this.sv = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.cibleYaw = 0;
    this.ciblePitch = 0;
    this.penche = 0;
    this.ciblePenche = 0;
    this.prochainPenche = 1 + Math.random() * 3;
    this.oreilles = [];
    this.queue = null;
    this.ailes = [];
    this.mats = [];

    // corps et tête en fourrure ; ventre plus clair
    const corpsGeo = new THREE.SphereGeometry(1, q.segW, q.segH);
    corpsGeo.scale(0.38, 0.33, 0.35);
    const corps = pelage(corpsGeo, P, L, q, this.glow, { force: 0.6, debut: 0.55, fin: 0.95, dir: [0, -0.3, 1] });
    this.mats.push(corps.material);
    this.corps.add(corps);
    const teteGeo = new THREE.SphereGeometry(0.27, Math.round(q.segW * 0.8), Math.round(q.segH * 0.8));
    const qt = { ...q, poils: Math.round(q.poils * 0.6) };
    const tete = pelage(teteGeo, P, L, qt, this.glow, { force: 0.35, debut: 0.7, fin: 1.0, dir: [0, -0.45, 1] });
    this.mats.push(tete.material);
    this.tete.add(tete);

    this.ombre = ombre();
    this.groupe.add(this.ombre);
    this.eclats = null;
    this.anatomie(id, P, L);
  }

  // morceau solide (oreille, patte…) ajouté à un parent
  morceau(geo, mat, parent, pos, rot = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    return m;
  }

  // petit pivot (pour faire bouger oreilles, queue, ailes)
  articulation(parent, pos, rot = [0, 0, 0]) {
    const p = new THREE.Group();
    p.position.set(...pos);
    p.rotation.set(...rot);
    p.userData.repos = p.rotation.clone();
    parent.add(p);
    return p;
  }

  // touffe de fourrure (queue en pompon, mèche…)
  touffe(geo, couleurs, parent, pos, rot = [0, 0, 0], zone) {
    const qq = { ...this.q, couches: Math.max(12, Math.round(this.q.couches * 0.6)), poils: Math.round(this.q.poils * 0.35), fourrure: this.q.fourrure * 0.9 };
    const m = pelage(geo, couleurs, this.L, qq, this.glow, zone);
    m.position.set(...pos);
    m.rotation.set(...rot);
    parent.add(m);
    this.mats.push(m.material);
    return m;
  }

  pattes(P, o = {}) {
    const mat = solide(P.patte, this.L, { glow: this.glow, wrap: 0.8 });
    const avant = o.avant || [0.07, 0.05, 0.08], arriere = o.arriere || [0.09, 0.05, 0.13];
    [-1, 1].forEach((sx) => {
      this.morceau(ellipsoide(...avant, 16), mat, this.corps, [0.11 * sx, -0.29, 0.27]);
      this.morceau(ellipsoide(...arriere, 16), mat, this.corps, [0.22 * sx, -0.305, 0.05], [0, 0.35 * sx, 0]);
    });
  }

  anatomie(id, P, L) {
    const c = this.corps, h = this.tete, glow = this.glow;
    const vert = solide("#3FBF5C", L, { glow, wrap: 0.7 });
    const feuille = (parent, pos, rz, ry = 0, s = 1) => {
      const m = new THREE.Mesh(SPHERE, vert);
      m.scale.set(0.08 * s, 0.02 * s, 0.042 * s);
      m.position.set(...pos);
      m.rotation.set(0, ry, rz);
      parent.add(m);
    };
    const peau = (couleur) => solide(couleur, L, { glow, wrap: 0.85 });
    const interieur = solide(P.oreille || P.ventre, L, { glow, wrap: 0.9 });

    if (id === "minotaure") {
      // petit veau : cornes, oreilles tombantes, mèche, queue à pompon, sabots
      this.pattes(P);
      const corne = solide(P.corne, L, { glow, wrap: 0.6 });
      const oreille = peau(P.oreille2);
      [-1, 1].forEach((sx) => {
        h.add(new THREE.Mesh(tubeEffile([[0.14 * sx, 0.16, 0.03], [0.25 * sx, 0.23, 0.03], [0.32 * sx, 0.33, 0.0], [0.3 * sx, 0.42, -0.05]], 0.042, 0.012), corne));
        const pv = this.articulation(h, [0.22 * sx, 0.05, 0.0], [0, 0, -0.5 * sx]);
        this.morceau(ellipsoide(0.12, 0.042, 0.07, 20), oreille, pv, [0.09 * sx, 0, 0]);
        this.morceau(ellipsoide(0.08, 0.018, 0.046, 16), interieur, pv, [0.1 * sx, 0.012, 0.014]);
        this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.35, t: Math.random() * 4, v: 0, x: 0 });
      });
      this.touffe(ellipsoide(0.12, 0.06, 0.09, 24), { racine: P.racine, base: P.touffe, pointe: P.pointe }, h, [0, 0.22, 0.1], [0.4, 0, 0]);
      feuille(h, [-0.1, 0.25, -0.04], -0.5, -0.4, 0.8);
      const pq = this.articulation(c, [0, -0.04, -0.33]);
      pq.add(new THREE.Mesh(tubeEffile([[0, 0, 0], [0.02, -0.05, -0.11], [0.06, -0.14, -0.17], [0.08, -0.22, -0.19]], 0.024, 0.017, 20, 8), peau(P.oreille2)));
      this.touffe(new THREE.SphereGeometry(0.06, 20, 14), { racine: P.racine, base: P.touffe, pointe: P.pointe }, pq, [0.08, -0.25, -0.19]);
      this.queue = { pv: pq, axe: "y", amp: 0.35, vitesse: 2.6 };
    } else if (id === "gribou") {
      // petit renard : oreilles pointues au bout sombre, grosse queue touffue au bout crème
      this.pattes(P);
      const oreille = peau(P.base);
      const pointeO = solide("#5E1A0E", L, { glow, wrap: 0.8 });
      [-1, 1].forEach((sx) => {
        const pv = this.articulation(h, [0.14 * sx, 0.19, -0.01], [-0.08, 0, -0.3 * sx]);
        const cone = new THREE.ConeGeometry(0.08, 0.22, 18);
        cone.translate(0, 0.11, 0);
        this.morceau(cone, oreille, pv, [0, 0, 0]);
        const coneIn = new THREE.ConeGeometry(0.048, 0.15, 14);
        coneIn.translate(0, 0.075, 0);
        this.morceau(coneIn, interieur, pv, [0, 0.015, 0.033]);
        const bout = new THREE.ConeGeometry(0.028, 0.055, 12);
        bout.translate(0, 0.195, 0);
        this.morceau(bout, pointeO, pv, [0, 0.001, 0]);
        this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.25, t: Math.random() * 4, v: 0, x: 0 });
      });
      const pq = this.articulation(c, [0, -0.15, -0.29], [-0.5, 0, 0]);
      this.touffe(ellipsoide(0.15, 0.33, 0.15, 32), { racine: P.racine, base: P.base, pointe: P.pointe }, pq, [0, 0.26, -0.04], [0, 0, 0], { dir: [0, 1, 0], couleur: P.touffe, debut: 0.45, fin: 0.85, force: 1 });
      this.queue = { pv: pq, axe: "z", amp: 0.28, vitesse: 2.2 };
      const tige = solide("#3FA15F", L, { glow, wrap: 0.6 });
      h.add(new THREE.Mesh(tubeEffile([[0, 0.24, 0.02], [0.01, 0.33, 0.02], [0.05, 0.41, 0.03], [0.11, 0.44, 0.04], [0.15, 0.41, 0.04], [0.13, 0.37, 0.04], [0.09, 0.38, 0.04]], 0.018, 0.008, 40), tige));
      feuille(h, [-0.06, 0.31, 0.02], -0.65, 0.2, 0.9);
    } else if (id === "bloop") {
      // petite loutre : oreilles rondes, queue plate, pattes palmées, goutte de rosée
      this.pattes(P, { arriere: [0.11, 0.042, 0.13] });
      const oreille = peau(P.oreille2);
      [-1, 1].forEach((sx) => {
        const pv = this.articulation(h, [0.19 * sx, 0.15, 0.0], [0, 0, -0.35 * sx]);
        this.morceau(ellipsoide(0.062, 0.054, 0.04, 18), oreille, pv, [0, 0.02, 0]);
        this.morceau(ellipsoide(0.036, 0.03, 0.018, 14), interieur, pv, [0, 0.022, 0.026]);
        this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.3, t: Math.random() * 4, v: 0, x: 0 });
      });
      const pq = this.articulation(c, [0, -0.25, -0.31], [0.3, 0, 0]);
      this.morceau(ellipsoide(0.11, 0.033, 0.19, 24), peau(P.oreille2), pq, [0, 0, -0.11]);
      this.queue = { pv: pq, axe: "y", amp: 0.4, vitesse: 1.8 };
      const eau = solide("#9FDBFF", L, { glow, wrap: 1, emissive: 0.35, opacite: 0.85 });
      const m = new THREE.Mesh(goutte(), eau);
      m.position.set(0, 0.26, 0.03);
      h.add(m);
      this.flaque = flaque(L, glow);
      this.groupe.add(this.flaque);
      // deux nénuphars sur la flaque
      const nenuphar = solide("#3DBE6A", L, { glow, wrap: 0.6, double: true });
      [[0.42, 0.18, 0.3], [-0.38, 0.28, -2.1]].forEach(([x, z, r]) => {
        const g = new THREE.CircleGeometry(0.075, 20, 0.4, Math.PI * 2 - 0.5);
        g.rotateX(-Math.PI / 2);
        const n = new THREE.Mesh(g, nenuphar);
        n.position.set(x, 0.01, z);
        n.rotation.y = r;
        this.groupe.add(n);
      });
    } else if (id === "noki") {
      // petite chouette : ailes, aigrette, plumes de queue, pattes orange, scintillements
      this.pattes(P, { avant: [0.03, 0.024, 0.065], arriere: [0.065, 0.028, 0.09] });
      const plume = peau(P.plume);
      [-1, 1].forEach((sx) => {
        const pv = this.articulation(c, [0.35 * sx, 0.04, -0.02], [0, 0, 0.18 * sx]);
        this.morceau(ellipsoide(0.055, 0.17, 0.14, 24), plume, pv, [0.03 * sx, -0.06, 0]);
        this.ailes.push({ pv, sens: sx });
      });
      [-0.42, 0, 0.42].forEach((rz, i) => {
        const pv = this.articulation(h, [rz * 0.07, 0.23, 0.03], [-0.25, 0, rz]);
        this.morceau(ellipsoide(0.03, 0.1, 0.02, 14), plume, pv, [0, 0.07, 0]);
        if (i === 1) this.oreilles.push({ pv, axe: "x", sens: 1, amp: 0.25, t: Math.random() * 4, v: 0, x: 0 });
      });
      // deux petites aigrettes de chouette
      [-1, 1].forEach((sx) => {
        const pv = this.articulation(h, [0.17 * sx, 0.18, 0.0], [0, 0, -0.45 * sx]);
        const cone = new THREE.ConeGeometry(0.05, 0.13, 14);
        cone.translate(0, 0.065, 0);
        this.morceau(cone, plume, pv, [0, 0, 0]);
        this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.2, t: Math.random() * 4, v: 0, x: 0 });
      });
      [-0.45, 0, 0.45].forEach((ry) => {
        const pv = this.articulation(c, [ry * 0.09, -0.17, -0.31], [0.5, ry, 0]);
        this.morceau(ellipsoide(0.038, 0.02, 0.12, 14), plume, pv, [0, 0, -0.09]);
      });
      this.eclats = nuageDePoints(
        [
          { pos: [0.5, 0.2, 0], couleur: "#FFFFFF", taille: 0.16 },
          { pos: [-0.5, 0.0, 0], couleur: "#FFF2C0", taille: 0.12 },
          { pos: [0.2, -0.1, 0.5], couleur: "#FFFFFF", taille: 0.1 },
        ],
        matierePoints({ temps: L.uTime, forme: 1 })
      );
      c.add(this.eclats);
    } else if (id === "pipo") {
      // petit lapin : grandes oreilles (dont une tombante), queue en pompon, grands pieds, fleur
      this.pattes(P, { arriere: [0.09, 0.045, 0.18] });
      const oreille = peau(P.oreille2);
      [[-1, 0.12], [1, -1.05]].forEach(([sx, rz]) => {
        const pv = this.articulation(h, [0.09 * sx, 0.2, -0.02], [-0.12, 0, rz]);
        this.morceau(ellipsoide(0.064, 0.23, 0.042, 24), oreille, pv, [0, 0.21, 0]);
        this.morceau(ellipsoide(0.04, 0.17, 0.018, 18), interieur, pv, [0, 0.21, 0.03]);
        this.oreilles.push({ pv, axe: "z", sens: sx, amp: sx > 0 ? 0.2 : 0.3, t: Math.random() * 4, v: 0, x: 0 });
      });
      this.touffe(new THREE.SphereGeometry(0.085, 22, 16), { racine: "#DDE8E2", base: "#FFFFFF", pointe: "#FFFFFF" }, c, [0, -0.11, -0.35]);
      const tige = solide("#2FA36F", L, { glow, wrap: 0.6 });
      h.add(new THREE.Mesh(tubeEffile([[-0.12, 0.18, 0.12], [-0.14, 0.25, 0.13], [-0.15, 0.3, 0.13]], 0.012, 0.009, 12), tige));
      const petale = solide("#FF4F9A", L, { glow, wrap: 0.8, emissive: 0.05 });
      const coeur = solide("#FFC21F", L, { glow, wrap: 0.8, emissive: 0.12 });
      const fleur = new THREE.Group();
      fleur.position.set(-0.15, 0.32, 0.13);
      fleur.rotation.set(0.55, 0, 0.3);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const m = new THREE.Mesh(SPHERE, petale);
        m.scale.set(0.042, 0.015, 0.028);
        m.position.set(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04);
        m.rotation.y = -a;
        m.rotation.z = 0.25;
        fleur.add(m);
      }
      const centre = new THREE.Mesh(SPHERE, coeur);
      centre.scale.setScalar(0.022);
      centre.position.y = 0.01;
      fleur.add(centre);
      h.add(fleur);
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
    this.corps.position.y = this.hauteur * sy + this.y;
    const grav = -0.3 - this.vy * 0.1, remous = 0.08 + Math.min(Math.abs(this.sv) * 0.04, 0.4);
    this.mats.forEach((m) => {
      m.uniforms.uGravity.value.y = grav;
      m.uniforms.uWobble.value = remous;
    });
    // l'ombre rétrécit quand la créature saute
    const o = Math.max(0.35, 1 - this.y * 2.2);
    this.ombre.scale.set(0.46 * o, 0.4 * o, 1);
    this.ombre.material.uniforms.uForce.value = 0.42 * o;
    this.yaw += (this.cibleYaw - this.yaw) * Math.min(1, dt * 5);
    this.pitch += (this.ciblePitch - this.pitch) * Math.min(1, dt * 5);
    this.pivot.rotation.set(this.pitch * 0.5, this.yaw * 0.6, 0);
    // la tête suit davantage le regard et s'incline par curiosité, comme un chiot
    this.prochainPenche -= dt;
    if (this.prochainPenche < 0) {
      this.ciblePenche = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.14);
      this.prochainPenche = 2 + Math.random() * 4;
    }
    this.penche += (this.ciblePenche - this.penche) * Math.min(1, dt * 4);
    this.tete.rotation.set(this.pitch * 0.6 - this.s * 0.3, this.yaw * 0.5, this.penche);
    this.glow.value += (this.cibleGlow - this.glow.value) * Math.min(1, dt * 2.5);

    // oreilles qui frémissent de temps en temps
    for (const or of this.oreilles) {
      or.t -= dt;
      if (or.t < 0) {
        or.v += (Math.random() < 0.5 ? -1 : 1) * 9 * or.amp;
        or.t = 1.5 + Math.random() * 4;
      }
      or.v += (-90 * or.x - 7 * or.v) * dt;
      or.x += or.v * dt;
      const r = or.pv.userData.repos;
      if (or.axe === "z") or.pv.rotation.z = r.z + or.x * or.sens;
      else or.pv.rotation.x = r.x + or.x;
    }
    // la queue remue
    if (this.queue) {
      const q = this.queue, r = q.pv.userData.repos;
      const agite = Math.sin(t * q.vitesse + this.graine) * q.amp * (0.4 + Math.min(1, Math.abs(this.sv) * 0.3));
      if (q.axe === "y") q.pv.rotation.y = r.y + agite;
      else q.pv.rotation.z = r.z + agite;
    }
    // les ailes battent pendant les sauts
    for (const a of this.ailes) {
      const r = a.pv.userData.repos;
      const bat = this.y > 0.005 ? Math.sin(t * 28) * 0.55 : Math.sin(t * 1.6 + this.graine) * 0.05;
      a.pv.rotation.z = r.z + bat * a.sens;
    }
    if (this.eclats) {
      const p = this.eclats.geometry.attributes.position;
      p.setXYZ(0, Math.cos(t * 1.1) * 0.55, 0.3 + Math.sin(t * 1.7) * 0.1, Math.sin(t * 1.1) * 0.55);
      p.setXYZ(1, Math.cos(t * 0.8 + 2.4) * 0.58, 0.1 + Math.sin(t * 1.3) * 0.12, Math.sin(t * 0.8 + 2.4) * 0.58);
      p.setXYZ(2, Math.cos(-t * 1.4 + 4) * 0.5, 0.45 + Math.sin(t * 2) * 0.08, Math.sin(-t * 1.4 + 4) * 0.5);
      p.needsUpdate = true;
    }
    if (this.fleur) this.fleur.rotation.y = Math.sin(t * 0.9 + this.graine) * 0.35;
  }

  // centre de la créature (entre le corps et la tête), en coordonnées monde
  centre(v) {
    return this.corps.localToWorld(v.set(0, 0.15, 0.04));
  }
}
