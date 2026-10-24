// @ts-nocheck — ported from the Minitaure site's 3D engine (plain JavaScript), extended for Lumoly.
/* Minitaure 3D — pièces partagées : lumières, matières, créatures-animaux en fourrure, particules.
   La fourrure utilise la technique des « coquilles » : la même forme est dessinée en
   N couches de plus en plus grandes, et chaque couche ne garde que la pointe des poils.
   Lumoly : chaque espèce a son propre corps (boule, cube, méduse, baleine, raie, serpent…)
   et sa propre façon de bouger quand on ne joue pas avec elle. */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

/* ---------------- Fourrure ----------------
   Deux façons de planter les poils : selon la direction depuis le centre (boules, œufs, cubes
   arrondis : uMode 0) ou sur une grille le long d'un tube (queues, tentacules, corps de serpent :
   uMode 1). Des vagues peuvent plier la forme dans le shader (serpent, queue de chat, ailes de raie). */
const FOURRURE_VS = /* glsl */ `
attribute float aShell;
uniform float uTime;
uniform float uFur;
uniform vec3 uGravity;
uniform float uWobble;
uniform float uSeed;
uniform vec4 uVague;     // amplitude A, amplitude B, nombre d'onde, phase
uniform vec4 uVagueEnv;  // enveloppe clamp(s * x + y)^z ; w = 1 : s le long du tube, 0 : s = x
uniform vec3 uVagueA;
uniform vec3 uVagueB;
uniform float uLong;
uniform vec3 uAile;      // ailes de raie : amplitude, nombre d'onde, phase
varying vec3 vN;
varying vec3 vNo;
varying vec3 vW;
varying vec3 vO;
varying vec2 vUv;
varying float vS;
varying float vDepth;
void main() {
  vS = aShell;
  vUv = uv;
  vec3 n = normalize(normal);
  vNo = n;
  vec3 p = position + n * uFur * aShell;
  if (uVague.x != 0.0 || uVague.y != 0.0) {
    float s = uVagueEnv.w > 0.5 ? uv.x * uLong : position.x;
    float e = pow(clamp(s * uVagueEnv.x + uVagueEnv.y, 0.0, 1.0), uVagueEnv.z);
    float ph = uVague.z * s + uVague.w;
    p += (uVagueA * (uVague.x * sin(ph)) + uVagueB * (uVague.y * cos(ph))) * e;
    if (uVagueEnv.w < 0.5) {
      vec3 dd = (uVagueA * (uVague.x * cos(ph)) - uVagueB * (uVague.y * sin(ph))) * (e * uVague.z);
      n = normalize(n - vec3(dot(dd, n), 0.0, 0.0));
    }
  }
  if (uAile.x != 0.0) {
    float ax = abs(position.x);
    float ph = uAile.z - uAile.y * ax;
    p.y += uAile.x * ax * ax * sin(ph);
    float dy = uAile.x * (2.0 * ax * sin(ph) - ax * ax * uAile.y * cos(ph)) * sign(position.x);
    n = normalize(vec3(n.x - dy * n.y, n.y, n.z));
  }
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
uniform vec3 uShape;
uniform float uMode;
uniform vec2 uGrille;
uniform float uEtoiles;
uniform float uIris;
uniform float uNebula;
uniform vec3 uNebCol;
varying vec3 vN;
varying vec3 vNo;
varying vec3 vW;
varying vec3 vO;
varying vec2 vUv;
varying float vS;
varying float vDepth;
void main() {
  vec3 dir = normalize(vO / uShape);
  float a = 1.0;
  float h = 0.5;
  float id = 0.0;
  if (vS > 0.001) {
    float dist;
    if (uMode > 0.5) {
      // poils sur une grille (le long du tube, autour du tube), un peu décalés au hasard
      vec2 g = vUv * uGrille;
      vec2 c0 = floor(g);
      float best = 9.0;
      vec2 bc = c0;
      for (int j = -1; j <= 1; j++) {
        for (int i = -1; i <= 1; i++) {
          vec2 c = c0 + vec2(float(i), float(j));
          vec2 cc = vec2(c.x, mod(c.y, uGrille.y));
          vec2 q = c + 0.2 + 0.6 * vec2(hash12(cc + uSeed), hash12(cc * 1.37 + 4.1 - uSeed));
          vec2 dq = g - q;
          float d = dot(dq, dq);
          if (d < best) { best = d; bc = cc; }
        }
      }
      dist = sqrt(best);
      id = bc.x * 157.0 + bc.y;
    } else {
      // léger gauchissement pour casser la régularité des rangées de poils
      float esp = sqrt(12.566 / uStrands);
      vec3 d2 = normalize(dir + esp * (0.7 * sin(dir.yzx * 41.0 + uSeed) + 0.45 * sin(dir.zxy * 97.0 - uSeed * 1.7)));
      // pôles de la spirale sur les côtés (vus de profil seulement)
      vec2 poil = poilProche(vec3(d2.y, d2.z, d2.x), uStrands);
      dist = poil.y / esp;
      id = poil.x;
    }
    h = hash13(vec3(id * 0.618, uSeed, 3.7));
    float h2 = hash13(vec3(uSeed, id * 0.371, 9.1));
    float t = vS / (0.7 + 0.3 * h);
    if (t > 1.0) discard;
    float epais = mix(0.72, 0.26, t) * (0.82 + 0.36 * h2);
    a = 1.0 - smoothstep(epais * 0.5, epais, dist);
    if (a < 0.02) discard;
  }
  vec3 N = normalize(vN);
  // zone plus claire : ventre des animaux, bout de la queue du renard…
  vec3 zd = uMode > 0.5 ? normalize(vNo) : dir;
  float zone = smoothstep(uZone.x, uZone.y, dot(zd, uZoneDir)) * uZone.z;
  vec3 root = mix(uRoot, uZoneCol * 0.8, zone * 0.7);
  vec3 base = mix(uBase, uZoneCol, zone);
  vec3 tip = mix(uTip, mix(uZoneCol, vec3(1.0), 0.4), zone);
  if (uNebula > 0.0) {
    // nuages de nébuleuse
    vec3 np = uMode > 0.5 ? vec3(vUv.x * 5.0, vNo.yz * 1.5) : dir * 1.8;
    float nb = fbm(np.xy * 1.6 + np.z * 1.9 + uSeed);
    float m = smoothstep(0.42, 0.72, nb) * uNebula;
    base = mix(base, uNebCol, m);
    tip = mix(tip, mix(uNebCol, vec3(1.0), 0.35), m);
  }
  vec3 c = mix(root, base, smoothstep(0.0, 0.55, vS));
  c = mix(c, tip, smoothstep(0.5, 1.0, vS) * 0.7);
  c *= 0.92 + 0.16 * h;
  if (uIris > 0.0) {
    // reflets irisés (prisme, aurore) qui changent avec l'angle de vue
    vec3 V = normalize(cameraPosition - vW);
    float fi = dot(N, V);
    vec3 ir = 0.55 + 0.45 * cos(6.2831 * (fi * 0.8 + vS * 0.35 + uTime * 0.06 + dir.y * 0.5 + vec3(0.0, 0.33, 0.67)));
    c = mix(c, ir * (0.6 + 0.5 * dot(c, vec3(0.3, 0.5, 0.2))), uIris * smoothstep(0.25, 1.0, vS));
  }
  vec3 col = eclairer(c, N, vW, 0.7);
  col *= mix(0.6, 1.0, vS);
  // couleurs bien vives
  float lumi = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lumi), col, 1.2), 0.0);
  col += c * uGlow * 0.18;
  if (uEtoiles > 0.0) {
    // quelques pointes de poils brillent comme des étoiles et scintillent
    float st = step(1.0 - uEtoiles * 0.045, hash13(vec3(id * 0.437, uSeed * 1.3, 5.9)));
    float tw = 0.55 + 0.45 * sin(uTime * (2.0 + 3.0 * h) + id);
    col += st * smoothstep(0.55, 1.0, vS) * vec3(1.0, 0.96, 0.88) * 2.4 * tw;
  }
  col = mix(uFogColor, col, brume(vDepth));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

function pelage(geo, P, L, q, glow, zone = {}, x = {}) {
  const g = new THREE.InstancedBufferGeometry();
  g.index = geo.index;
  g.setAttribute("position", geo.attributes.position);
  g.setAttribute("normal", geo.attributes.normal);
  if (geo.attributes.uv) g.setAttribute("uv", geo.attributes.uv);
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
      uShape: { value: new THREE.Vector3(...(x.forme || [1, 1, 1])) },
      uMode: { value: x.grille ? 1 : 0 },
      uGrille: { value: new THREE.Vector2(...(x.grille || [1, 1])) },
      uVague: { value: new THREE.Vector4(0, 0, 0, 0) },
      uVagueEnv: { value: new THREE.Vector4(...(x.env || [0, 1, 1, x.grille ? 1 : 0])) },
      uVagueA: { value: new THREE.Vector3(...(x.axeA || [0, 1, 0])) },
      uVagueB: { value: new THREE.Vector3(...(x.axeB || [0, 0, 1])) },
      uLong: { value: x.longueur ?? 1 },
      uAile: { value: new THREE.Vector3(0, 0, 0) },
      uEtoiles: { value: x.etoiles ?? 0 },
      uIris: { value: x.iris ?? 0 },
      uNebula: { value: x.nebuleuse ? x.nebForce ?? 0.75 : 0 },
      uNebCol: { value: new THREE.Color(x.nebuleuse || "#ffffff") },
    },
    vertexShader: FOURRURE_VS,
    fragmentShader: FOURRURE_FS,
    alphaToCoverage: true,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/* ---------------- Matière « solide » (oreilles, pattes, cornes, nageoires, plumes…) ---------------- */
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
  #ifdef USE_COLOR
    vCol *= color;
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
uniform float uIris;
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
  vec3 V = normalize(cameraPosition - vW);
  #ifdef POIS
    // pois blancs des champignons
    vec3 o = normalize(vObj);
    vec2 g = vec2(atan(o.z, o.x) * 1.9, o.y * 4.2);
    vec2 f = fract(g) - 0.5;
    float hp = hash12(floor(g) + vId * 7.0);
    float tache = (1.0 - smoothstep(0.17, 0.24, length(f + (hp - 0.5) * 0.25))) * step(0.3, hp) * step(0.12, o.y);
    base = mix(base, vec3(1.0, 0.97, 0.9), tache);
  #endif
  #ifdef IRIS
    // nacre irisée (corne de licorne, plumes de paon)
    float fi = dot(N, V);
    vec3 ir = 0.55 + 0.45 * cos(6.2831 * (fi * 0.9 + uTime * 0.07 + vObj.y * 2.5 + vId * 0.13 + vec3(0.0, 0.33, 0.67)));
    base = mix(base, ir * (0.5 + 0.6 * dot(base, vec3(0.3, 0.5, 0.2))), uIris);
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
  #ifdef VERRE
    // verre / gelée : plus opaque et plus brillant sur les bords
    float fr = pow(1.0 - abs(dot(N, V)), 2.0);
    alpha *= 0.35 + 0.65 * fr;
    col += base * fr * 0.7;
  #endif
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
  if (o.iris) defines.IRIS = "";
  if (o.verre) defines.VERRE = "";
  const opacite = o.opacite ?? 1;
  const uniforms = {
    ...L,
    uColor: { value: new THREE.Color(couleur) },
    uEmissive: { value: o.emissive ?? 0 },
    uGlow: o.glow || { value: 0 },
    uOpacity: { value: opacite },
    uWrap: { value: o.wrap ?? 0.5 },
    uIris: { value: o.iris ?? 0 },
  };
  if (o.brume !== undefined) uniforms.uFogDensity = { value: o.brume };
  const transparent = opacite < 1 || !!o.fondu || !!o.verre;
  return new THREE.ShaderMaterial({
    uniforms,
    defines,
    vertexShader: SOLIDE_VS,
    fragmentShader: SOLIDE_FS,
    transparent,
    vertexColors: !!o.couleurs,
    side: o.double ? THREE.DoubleSide : THREE.FrontSide,
    depthWrite: o.depthWrite ?? !transparent,
  });
}

/* ---------------- Points (lucioles, étincelles, étoiles, feuilles qui volent) ---------------- */
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

/* o.px / o.echelle : objets uniform partagés (la scène les met à jour pour toutes ses particules). */
export function matierePoints(o = {}) {
  const feuilles = (o.forme ?? 0) > 1.5;
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: o.temps || { value: 0 },
      uPx: o.px || { value: 1 },
      uEchelle: o.echelle || { value: 500 },
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
    this.palettes = new Map();
  }
  /* dir (facultatif) : un jet dans une direction (souffle de feu, jet d'eau) au lieu d'une gerbe. */
  emettre(origine, couleurs, nombre = 24, vitesse = 1.2, taille = 0.07, dir = null, cone = 0.35) {
    const cle = Array.isArray(couleurs) ? couleurs.join() : couleurs;
    let palette = this.palettes.get(cle);
    if (!palette) {
      palette = (Array.isArray(couleurs) ? couleurs : [couleurs]).map((x) => new THREE.Color(x));
      if (this.palettes.size < 24) this.palettes.set(cle, palette);
    }
    const blanc = BLANC;
    for (let k = 0; k < nombre; k++) {
      const i = this.i;
      this.i = (this.i + 1) % this.n;
      const v = vitesse * (0.4 + Math.random() * 0.8);
      if (dir) {
        let x = dir.x + (Math.random() - 0.5) * 2 * cone, y = dir.y + (Math.random() - 0.5) * 2 * cone, z = dir.z + (Math.random() - 0.5) * 2 * cone;
        const l = Math.hypot(x, y, z) || 1;
        this.vel[i * 3] = (x / l) * v;
        this.vel[i * 3 + 1] = (y / l) * v;
        this.vel[i * 3 + 2] = (z / l) * v;
      } else {
        const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
        this.vel[i * 3] = Math.sin(ph) * Math.cos(th) * v;
        this.vel[i * 3 + 1] = Math.abs(Math.cos(ph)) * v * 0.9 + 0.3 * vitesse;
        this.vel[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * v;
      }
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
const BLANC = new THREE.Color("#fff");

/* ---------------- Géométries utilitaires ---------------- */
/* Un tube qui s'affine ; r0 peut être une fonction t → rayon (queue touffue plus grosse au milieu). */
function tubeEffile(points, r0, r1, seg = 28, rad = 10) {
  const courbe = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(courbe, seg, 1, rad, false);
  const pos = geo.attributes.position, nor = geo.attributes.normal, P = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const r = typeof r0 === "function" ? r0(t) : r0 + (r1 - r0) * t;
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
export function ellipsoide(sx, sy, sz, seg = 28) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.7));
  g.scale(sx, sy, sz);
  return g;
}

/* Une sphère unité déformée par F(x, y, z, sortie) ; normales exactes (pas de couture). */
const _J = new THREE.Matrix3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3(), _nn = new THREE.Vector3();
function deformer(F, segW = 64, segH = 40) {
  const g = new THREE.SphereGeometry(1, segW, segH);
  const p = g.attributes.position, nr = g.attributes.normal, e = 1e-3;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    F(x + e, y, z, _a); F(x - e, y, z, _b); _cx.subVectors(_a, _b);
    F(x, y + e, z, _a); F(x, y - e, z, _b); _cy.subVectors(_a, _b);
    F(x, y, z + e, _a); F(x, y, z - e, _b); _cz.subVectors(_a, _b);
    _J.set(_cx.x, _cy.x, _cz.x, _cx.y, _cy.y, _cz.y, _cx.z, _cy.z, _cz.z).invert().transpose();
    _nn.set(x, y, z).applyMatrix3(_J).normalize();
    F(x, y, z, _a);
    p.setXYZ(i, _a.x, _a.y, _a.z);
    nr.setXYZ(i, _nn.x, _nn.y, _nn.z);
  }
  return g;
}

/* Un cube aux coins arrondis (superellipsoïde) : la chouette « pixel ». */
function cubeArrondi(sx, sy, sz, n = 5, seg = 48) {
  return deformer(
    (x, y, z, o) => {
      const k = Math.pow(Math.pow(Math.abs(x), n) + Math.pow(Math.abs(y), n) + Math.pow(Math.abs(z), n), -1 / n) * Math.hypot(x, y, z);
      return o.set(x * k * sx, y * k * sy, z * k * sz);
    },
    seg,
    Math.round(seg * 0.7)
  );
}

function etoile(r1, r2, ep) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? r2 : r1;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: ep, bevelEnabled: true, bevelThickness: ep * 0.6, bevelSize: ep * 0.5, bevelSegments: 2 });
  g.center();
  return g;
}

/* Une flamme / une goutte : ronde en bas, pointue en haut. */
function flamme(h, r, seg = 18) {
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16;
    pts.push(new THREE.Vector2(Math.max(1e-4, r * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15)), 0.8) * (1 - u * 0.85)), h * u));
  }
  return new THREE.LatheGeometry(pts, seg);
}

function goutte() {
  const pts = [];
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    pts.push(new THREE.Vector2(0.085 * Math.pow(Math.sin(Math.PI * u), 0.85) * (0.3 + 0.7 * u), 0.22 * (1 - u)));
  }
  return new THREE.LatheGeometry(pts, 28);
}

/* Couleur par sommet, pour fusionner plusieurs pièces de couleurs différentes en une seule. */
const _col = new THREE.Color();
function peint(geo, hex) {
  _col.set(hex);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([_col.r, _col.g, _col.b], i * 3);
  geo.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return geo;
}
function fusion(geos) {
  const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)));
  geos.forEach((x) => x.dispose());
  return g;
}

const _c1 = new THREE.Color(), _c2 = new THREE.Color();
/* t < 0 : plus sombre, t > 0 : plus clair. */
function teinte(hex, t) {
  _c1.set(hex);
  _c2.set(t < 0 ? "#000000" : "#ffffff");
  _c1.lerp(_c2, Math.abs(t));
  return `#${_c1.getHexString()}`;
}
function fourrureDe(hex, o = {}) {
  return { racine: teinte(hex, -0.5), base: hex, pointe: teinte(hex, o.pointe ?? 0.32), ventre: o.ventre || teinte(hex, 0.58), patte: teinte(hex, -0.38) };
}
function aireEllipsoide(a, b, c) {
  const p = 1.6075;
  return 4 * Math.PI * Math.pow((Math.pow(a * b, p) + Math.pow(a * c, p) + Math.pow(b * c, p)) / 3, 1 / p);
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
export function ombre() {
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
const TAU = Math.PI * 2;
const doux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lisse = (a, b, x) => doux((x - a) / (b - a));
const cloche = (x) => (x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x));
/* enveloppe 0 → 1 → 0 sur [0, d] avec des montées de m secondes */
const enveloppe = (t, d, m = 0.3) => (t < 0 ? 0 : Math.min(lisse(0, m, t), 1 - lisse(d - m, d, t)));
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _sc = new THREE.Vector3();

const ETINCELLES = ["#FFE27A", "#FFFFFF", "#FFC6F0"];
const BRAISES = ["#FFE27A", "#FF9F1C", "#FF4A2E", "#FFD36B"];
const BULLES = ["#BDEBFF", "#FFFFFF", "#9FD8FF"];
const ARC_EN_CIEL = ["#FF8FC8", "#FFB86B", "#FFE27A", "#7DE3B0", "#8FC8FF", "#C3A3FF"];
const COSMOS = ["#FFFFFF", "#C7D2FE", "#A5F3FC", "#F0ABFC", "#FDE68A"];
const OR = ["#FFE08A", "#FACC15", "#FFF3C4", "#FFB21C"];

let graine = 1;
export class Creature {
  constructor(id, L, o = {}) {
    const q = { couches: 28, poils: 14000, fourrure: 0.075, segW: 64, segH: 40, ...o };
    // Lumoly : n'importe quelles couleurs (o.palette) sur n'importe quel corps (o.forme).
    const P0 = o.palette || PALETTE[id] || PALETTE.pipo;
    const P = { ...P0, accent: P0.accent || P0.oreille || P0.pointe };
    const forme = o.forme || id;
    this.id = id;
    this.L = L;
    this.q = q;
    this.P = P;
    this.R = 0.42;
    this.graine = (graine++ * 1.618) % 10;
    this.glow = { value: o.glow ?? 0 };
    this.cibleGlow = this.glow.value;
    this.extra = { etoiles: o.etoiles ?? 0, iris: o.iris ?? 0, nebuleuse: o.nebuleuse ?? null };
    // humeur : joyeux (par défaut), colere (le boss), triste, endormi
    this.humeur = o.humeur || "joyeux";
    this.calme = this.humeur === "joyeux" || this.humeur === "colere";
    this.vitesse = this.humeur === "endormi" ? 0.35 : this.humeur === "triste" ? 0.55 : 1;
    this.pointsU = o.points || {};
    /** Branché par la scène : (origine, couleurs, nombre, vitesse, taille, direction?) → étincelles. */
    this.emettre = null;
    this.groupe = new THREE.Group();
    this.pivot = new THREE.Group();
    this.corps = new THREE.Group();
    this.corps.rotation.order = "YXZ";
    this.groupe.add(this.pivot);
    this.pivot.add(this.corps);
    this.hauteur = 0.3;
    this.flotte = false;
    this.taille = 1;
    this.baseYaw = 0;
    this.basePitch = 0;
    this.ombreT = [0.46, 0.4];
    this.centreLocal = new THREE.Vector3(0, 0.15, 0.04);
    this.tete = new THREE.Group();
    this.tete.position.set(0, 0.36, 0.1);
    this.corps.add(this.tete);
    this.teteRepos = new THREE.Euler();
    this.teteAmp = 1;
    this.teteF = new THREE.Vector3();
    // ce que l'animation du moment ajoute au corps (remis à zéro à chaque image)
    this.f = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sq: 0, souffle: 1 };
    this.ouvre = 0;
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
    this.regardVif = 5;
    this.oreilles = [];
    this.queue = null;
    this.mats = [];
    this.r = {};
    this.minuteurs = {};
    this.ta = this.graine;
    // un « tour » de temps en temps (bond, souffle de feu, jet d'eau, looping…)
    this.sp = { t: -1, duree: 1, prochain: 2.5 + Math.random() * 3, n: 0, fait: 0 };
    this.spTous = [5, 9];
    this.spDuree = 1.2;
    this.face = {};

    this.ombre = ombre();
    this.groupe.add(this.ombre);
    this.eclats = null;
    const plan = this[`plan_${forme}`] ? forme : "lapin";
    this.anim = this[`anim_${plan}`];
    this[`plan_${plan}`](P, L);
    if (this.boucheMuseau && !this.face.boucheSur) this.face.boucheSur = this.boucheMuseau;
    this.visage(this.face, this.humeur, L);
    this.pivot.scale.setScalar(this.taille);
    this.corps.rotation.set(this.basePitch, this.baseYaw, 0);
    // clignements, coups d'œil
    this.cligne = 1.5 + Math.random() * 3;
    this.clin = 0;
    this.regardLibre = true;
    this.prochainRegard = 1 + Math.random() * 2;
  }

  /* ---------- outils de construction ---------- */

  // fourrure sur un ellipsoïde (ou une géométrie « ronde » autour de son centre)
  boule(r, parent, pos, o = {}) {
    const [sx, sy, sz] = Array.isArray(r) ? r : [r, r, r];
    const aire = aireEllipsoide(sx, sy, sz);
    const k = Math.sqrt(aire / 1.63);
    let geo = o.geo;
    if (!geo) {
      const segW = Math.max(20, Math.round(this.q.segW * Math.min(1, 0.4 + k)));
      geo = new THREE.SphereGeometry(1, segW, Math.max(12, Math.round(segW * 0.62)));
      geo.scale(sx, sy, sz);
    }
    const qq = {
      ...this.q,
      poils: Math.max(300, Math.round(this.q.poils * (aire / 1.63) * (o.densite ?? 1))),
      fourrure: this.q.fourrure * (o.poil ?? 1),
      couches: o.couches ?? Math.max(12, Math.round(this.q.couches * (k < 0.35 ? 0.6 : k < 0.7 ? 0.8 : 1))),
    };
    const m = pelage(geo, o.P || this.P, this.L, qq, this.glow, o.zone || {}, {
      forme: [sx, sy, sz],
      etoiles: o.etoiles ?? this.extra.etoiles,
      iris: o.iris ?? this.extra.iris,
      nebuleuse: o.nebuleuse === undefined ? this.extra.nebuleuse : o.nebuleuse,
    });
    m.position.set(...pos);
    if (o.rot) m.rotation.set(...o.rot);
    parent.add(m);
    this.mats.push(m.material);
    return m;
  }

  // fourrure le long d'un tube (queue, tentacule, corps de serpent, branchies)
  tube(points, r0, r1, parent, pos, o = {}) {
    const courbe = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const long = courbe.getLength();
    const geo = tubeEffile(courbe, r0, r1, o.seg ?? 40, o.rad ?? 16);
    const rm = typeof r0 === "function" ? (r0(0.2) + r0(0.5) + r0(0.8)) / 3 : (r0 + r1) / 2;
    const esp = Math.sqrt(1.63 / this.q.poils) / Math.sqrt(o.densite ?? 1);
    const fur = this.q.fourrure * (o.poil ?? 1);
    const grille = [Math.max(4, Math.round(long / esp)), Math.max(6, Math.round((TAU * (rm + fur * 0.4)) / esp))];
    const qq = { ...this.q, fourrure: fur, couches: o.couches ?? Math.max(12, Math.round(this.q.couches * 0.8)) };
    const v = o.vague || {};
    const m = pelage(geo, o.P || this.P, this.L, qq, this.glow, o.zone || {}, {
      grille,
      longueur: long,
      env: v.env || [1 / long, 0, 1.4, v.selonX ? 0 : 1],
      axeA: v.A,
      axeB: v.B,
      etoiles: o.etoiles ?? this.extra.etoiles,
      iris: o.iris ?? this.extra.iris,
      nebuleuse: o.nebuleuse === undefined ? this.extra.nebuleuse : o.nebuleuse,
    });
    m.position.set(...pos);
    if (o.rot) m.rotation.set(...o.rot);
    parent.add(m);
    this.mats.push(m.material);
    m.userData.long = long;
    return m;
  }

  // morceau solide (oreille, patte…) ajouté à un parent
  morceau(geo, mat, parent, pos, rot = [0, 0, 0], sc) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rot);
    if (sc) m.scale.set(...sc);
    parent.add(m);
    return m;
  }

  // petit pivot (pour faire bouger oreilles, queue, ailes)
  articulation(parent, pos, rot = [0, 0, 0]) {
    const p = new THREE.Group();
    p.position.set(...pos);
    p.rotation.set(...rot);
    p.userData.repos = p.rotation.clone();
    p.userData.pos = p.position.clone();
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

  feuille(parent, pos, rz, ry = 0, s = 1) {
    this.r.vert ??= solide("#3FBF5C", this.L, { glow: this.glow, wrap: 0.7 });
    const m = new THREE.Mesh(SPHERE, this.r.vert);
    m.scale.set(0.08 * s, 0.02 * s, 0.042 * s);
    m.position.set(...pos);
    m.rotation.set(0, ry, rz);
    parent.add(m);
    return m;
  }

  mat(couleur, o = {}) {
    return solide(couleur, this.L, { glow: this.glow, wrap: 0.75, ...o });
  }

  // un museau en fourrure avec sa truffe ; la bouche se pose dessous
  museau(parent, pos, r, Pm, nez, o = {}) {
    const g = new THREE.Group();
    g.position.set(...pos);
    if (o.rot) g.rotation.set(...o.rot);
    parent.add(g);
    this.boule(r, g, [0, 0, 0], { P: Pm, poil: o.poil ?? 0.45, zone: o.zone });
    const fur = this.q.fourrure * (o.poil ?? 0.45);
    if (nez === "narines") {
      const n = this.mat("#2A1020", { wrap: 0.3 });
      [-1, 1].forEach((sx) => this.morceau(SPHERE, n, g, [r[0] * 0.38 * sx, r[1] * 0.42, r[2] + fur * 0.3], [0, 0, 0], [0.016, 0.012, 0.01]));
    } else if (nez) {
      this.r.nez = this.morceau(SPHERE, this.mat(nez, { wrap: 0.4, emissive: 0.08 }), g, [0, r[1] * 0.45, r[2] + fur * 0.35], [0, 0, 0], [0.034, 0.025, 0.022]);
    }
    this.boucheMuseau = { parent: g, pos: [0, -r[1] * 0.42, r[2] * 0.86 + fur * 0.4], rot: [0.5, 0, 0] };
    return g;
  }

  /* Un visage : yeux brillants qui clignent, joues, bouche ou bec, sourcils selon l'humeur. */
  visage(F, humeur, L) {
    const glow = this.glow;
    const colere = humeur === "colere", triste = humeur === "triste", dort = humeur === "endormi";
    const t = F.t ?? 1, R = F.R ?? 0.312, k = (0.312 / R) * t, dec = F.decal ?? 0;
    const tete = F.parent || this.tete;
    // un pivot au centre de la tête, tourné vers l'endroit du visage où poser la pièce
    const poser = (parent, yaw, pitch, z) => {
      const pv = new THREE.Group();
      pv.rotation.set(pitch, yaw, 0, "YXZ");
      parent.add(pv);
      const g = new THREE.Group();
      g.position.set(0, 0, z);
      pv.add(g);
      return g;
    };
    const plat = (parent, pos, rot) => {
      const g = new THREE.Group();
      g.position.set(...pos);
      if (rot) g.rotation.set(...rot);
      parent.add(g);
      return g;
    };
    const ici = (p, yaw, pitch, z = R) => (p.pos ? plat(p.parent || tete, p.pos, p.rot) : poser(p.parent || tete, p.yaw ?? yaw, p.pitch ?? pitch, p.R ?? z));
    const noir = solide(colere ? "#2A0707" : "#120D24", L, { glow, wrap: 0.25 });
    const reflet = solide("#FFFFFF", L, { emissive: 1.4 });
    const lueur = solide("#FF4A2E", L, { emissive: 1.6 });
    const ey = F.yeux || {};
    this.yeuxMesh = [];
    this.reflets = [];
    (F.yeuxSur || [{ sx: -1 }, { sx: 1 }]).forEach((p) => {
      const sx = p.sx;
      const g = ici(p, (ey.yaw ?? 0.36) * k * sx, (ey.pitch ?? -0.12) * k + dec);
      const te = (p.t ?? t) * (ey.taille ?? 1);
      g.scale.setScalar(te);
      if (dort) {
        // yeux fermés : deux petits arcs
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0085, 6, 16, Math.PI), F.sclere ? solide("#FFFFFF", L, { emissive: 0.5 }) : noir);
        arc.rotation.z = Math.PI;
        arc.position.set(0, 0.012, 0.01);
        g.add(arc);
      } else {
        const oeil = new THREE.Group();
        g.add(oeil);
        this.yeuxMesh.push(oeil);
        let zr = 0.037;
        if (F.sclere) {
          // grands yeux blancs (Lumo)
          const blanc = new THREE.Mesh(SPHERE, solide("#FFFFFF", L, { wrap: 0.7, emissive: 0.3 }));
          blanc.scale.set(0.066, 0.08, 0.036);
          oeil.add(blanc);
          const pu = new THREE.Mesh(SPHERE, noir);
          pu.scale.set(0.038, 0.046, 0.024);
          pu.position.set(0.004 * sx, -0.012, 0.022);
          oeil.add(pu);
          zr = 0.044;
        } else {
          const o = new THREE.Mesh(SPHERE, noir);
          o.scale.set(0.062, colere ? 0.056 : triste ? 0.068 : 0.078, 0.042);
          oeil.add(o);
        }
        // reflets : un gros en haut, un petit en bas (une lueur rouge pour le boss)
        const r1 = new THREE.Mesh(SPHERE, colere ? lueur : reflet);
        r1.scale.setScalar(colere ? 0.024 : 0.02);
        r1.position.set(colere ? 0 : 0.016, colere ? 0 : 0.026, zr);
        oeil.add(r1);
        this.reflets.push(r1);
        if (!colere) {
          const r2 = new THREE.Mesh(SPHERE, reflet);
          r2.scale.setScalar(0.009);
          r2.position.set(-0.017, -0.026, zr - 0.001);
          oeil.add(r2);
          this.reflets.push(r2);
        }
      }
      if (colere || triste) {
        // sourcils : froncés (colère) ou relevés au milieu (tristesse)
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.02, 0.03), solide(colere ? "#1A0606" : "#2A2140", L, { wrap: 0.3 }));
        b.position.set(colere ? 0 : -0.006 * sx, 0.098, 0.012);
        b.rotation.z = (colere ? 0.5 : -0.38) * sx;
        g.add(b);
      }
    });
    if (!colere && F.joues !== false) {
      // joues roses
      const mj = solide("#FF7FA8", L, { emissive: 0.35, opacite: 0.8, depthWrite: false });
      (F.jouesSur || [{ sx: -1 }, { sx: 1 }]).forEach((p) => {
        const g = ici(p, (F.jouesYaw ?? 0.62) * k * p.sx, 0.1 * k + dec + (F.jouesPitch ?? 0), R - 0.008);
        const joue = new THREE.Mesh(SPHERE, mj);
        joue.scale.set(0.046 * t, 0.026 * t, 0.012 * t);
        g.add(joue);
      });
    }
    if (F.nez) {
      const g = F.nezSur ? ici(F.nezSur, 0, 0) : poser(tete, 0, (F.nezPitch ?? 0.1) * k + dec, R + 0.004);
      this.r.nez = new THREE.Mesh(SPHERE, solide(F.nez, L, { glow, wrap: 0.4, emissive: 0.1 }));
      this.r.nez.scale.set(0.026 * t, 0.018 * t, 0.016 * t);
      g.add(this.r.nez);
    }
    const B = F.bouche || {};
    if (F.bec) {
      // un bec (oiseaux)
      const g = F.boucheSur ? ici(F.boucheSur, 0, 0) : poser(tete, 0, (B.pitch ?? 0.12) * k + dec, R + 0.01);
      const s = t * (F.becTaille ?? 1);
      const bec = new THREE.Mesh(new THREE.ConeGeometry(0.03 * s, 0.075 * s, 14), solide(colere ? "#B23A1A" : F.bec, L, { glow, wrap: 0.6 }));
      bec.rotation.x = Math.PI / 2 + (F.becPenche ?? 0.25);
      g.add(bec);
      this.r.bec = bec;
    } else if (B.type !== "aucune") {
      const g = F.boucheSur ? ici(F.boucheSur, 0, 0) : poser(tete, 0, (B.pitch ?? 0.2) * k + dec, R - 0.004);
      g.scale.multiplyScalar(F.boucheSur ? t * (B.taille ?? 1) : B.taille ?? 1);
      const s = F.boucheSur ? 1 : t;
      const type = dort ? "o" : B.type || "sourire";
      const fache = colere || triste;
      const mb = solide(F.boucheCouleur || "#3A1430", L, { wrap: 0.3, emissive: F.boucheCouleur ? 0.5 : 0 });
      if (type === "o") {
        const m = new THREE.Mesh(SPHERE, mb);
        m.scale.set(0.02 * s, 0.024 * s, 0.01 * s);
        g.add(m);
      } else if (type === "chat") {
        // une bouche en « w »
        [-1, 1].forEach((sx) => {
          const m = new THREE.Mesh(new THREE.TorusGeometry(0.02 * s, 0.0065 * s, 6, 14, Math.PI), mb);
          m.rotation.z = fache ? 0 : Math.PI;
          m.position.set(0.02 * s * sx, fache ? -0.01 * s : 0.008 * s, 0);
          g.add(m);
        });
      } else {
        const large = type === "large";
        const m = new THREE.Mesh(new THREE.TorusGeometry((large ? 0.068 : 0.034) * s, (large ? 0.011 : 0.0085) * s, 8, 24, Math.PI), mb);
        // un sourire (l'arc en bas) ; une moue fâchée ou triste (l'arc en haut)
        m.rotation.z = fache ? 0 : Math.PI;
        m.position.y = (fache ? -0.012 : 0.012) * s * (large ? 1.6 : 1);
        g.add(m);
      }
      // la bouche grande ouverte (rugissement, bâillement, souffle de feu)
      const ouverte = new THREE.Mesh(SPHERE, solide("#4A0F24", L, { wrap: 0.2 }));
      const big = type === "large" ? 1.8 : 1;
      ouverte.userData.base = [0.034 * s * big, 0.03 * s * big, 0.014 * s];
      ouverte.position.set(0, -0.006 * s * big, -0.004);
      ouverte.visible = false;
      g.add(ouverte);
      this.r.ouverte = ouverte;
    }
  }

  /* ---------- les corps (un par espèce) ----------
     Chaque plan pose le corps dans this.corps (centre à this.hauteur au-dessus du sol), la tête
     dans this.tete, règle le visage (this.face) et ses tours ; anim_<plan> le fait bouger. */

  // Tortue moussue : carapace de mousse (avec champignon), petite tête sortie, pattes qui marchent.
  plan_tortue(P, L) {
    const c = this.corps, glow = this.glow;
    this.hauteur = 0.31;
    this.taille = 1.1;
    this.baseYaw = 0.5;
    this.ombreT = [0.6, 0.5];
    this.teteAmp = 0.8;
    this.spTous = [7, 12];
    this.spDuree = 2.6;
    this.centreLocal.set(0, 0.12, 0.1);
    const peau = fourrureDe(P.accent);
    const dome = new THREE.SphereGeometry(1, this.q.segW, this.q.segH, 0, TAU, 0, Math.PI * 0.6);
    dome.scale(0.44, 0.36, 0.48);
    this.boule([0.44, 0.36, 0.48], c, [0, 0, 0], { geo: dome, poil: 1.05, densite: 0.8, zone: { force: 0.35, debut: 0.75, fin: 1, dir: [0, 1, 0], couleur: teinte(P.base, 0.25) } });
    const bord = new THREE.TorusGeometry(1, 0.075, 10, 56);
    bord.rotateX(Math.PI / 2);
    bord.scale(0.445, 1, 0.485);
    this.morceau(bord, this.mat("#8A6330", { wrap: 0.6 }), c, [0, -0.1, 0]);
    this.morceau(ellipsoide(0.42, 0.06, 0.46, 32), this.mat("#EAD9A0", { wrap: 0.8 }), c, [0, -0.135, 0]);
    // un champignon et deux feuilles qui poussent sur la carapace
    const champ = this.articulation(c, [-0.13, 0.31, -0.1], [-0.25, 0, 0.3]);
    this.morceau(new THREE.CylinderGeometry(0.022, 0.03, 0.1, 12), this.mat("#FFF4E0"), champ, [0, 0.04, 0]);
    const chapeau = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2);
    chapeau.scale(0.08, 0.065, 0.08);
    this.morceau(chapeau, this.mat("#FF5A5A", { wrap: 0.7, pois: true }), champ, [0, 0.085, 0]);
    this.feuille(c, [0.12, 0.36, -0.04], -0.6, 0.7, 1.2);
    this.feuille(c, [0.19, 0.33, 0.03], 0.5, -0.4, 0.95);
    // cou et tête
    const cou = this.articulation(c, [0, -0.02, 0.36]);
    this.r.cou = cou;
    this.boule([0.1, 0.1, 0.16], cou, [0, 0.07, 0.02], { P: peau, poil: 0.6, rot: [-0.7, 0, 0] });
    cou.add(this.tete);
    this.tete.position.set(0, 0.17, 0.12);
    this.boule(0.19, this.tete, [0, 0, 0], { P: peau, zone: { force: 0.5, debut: 0.6, fin: 1, dir: [0, -0.6, 1] } });
    this.teteRepos.set(0, -0.42, 0);
    this.face = { R: 0.235, t: 0.85 };
    // quatre pattes (paires en diagonale) et une petite queue
    this.r.pattes = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const pv = this.articulation(c, [0.29 * sx, -0.11, 0.25 * sz]);
      this.boule([0.085, 0.1, 0.09], pv, [0, -0.07, 0], { P: peau, poil: 0.55 });
      this.r.pattes.push({ pv, ph: sx * sz > 0 ? 0 : Math.PI });
    });
    const q = new THREE.ConeGeometry(0.04, 0.12, 12);
    q.rotateX(-Math.PI / 2 - 0.3);
    this.morceau(q, this.mat(peau.base, { wrap: 0.8 }), c, [0, -0.09, -0.5]);
  }

  // Mouton nuage : une grosse boule de laine bosselée, une frimousse crème, quatre petites pattes.
  plan_mouton(P, L) {
    const c = this.corps;
    this.hauteur = 0.5;
    this.ombreT = [0.52, 0.46];
    this.teteAmp = 0.5;
    this.spTous = [6, 10];
    this.spDuree = 1.1;
    this.centreLocal.set(0, 0, 0.1);
    const laine = { racine: teinte(P.base, -0.28), base: P.base, pointe: teinte(P.base, 0.55), ventre: "#FFFFFF" };
    const fl = { P: laine, poil: 1.5, densite: 0.42 };
    this.boule(0.38, c, [0, 0, 0], fl);
    // des bosses de nuage
    [[0.27, 0.22, -0.03, 0.16], [-0.27, 0.22, -0.03, 0.16], [0, 0.35, -0.06, 0.17], [0.33, -0.06, -0.06, 0.14], [-0.33, -0.06, -0.06, 0.14], [0.17, 0.3, 0.12, 0.12], [-0.17, 0.3, 0.12, 0.12]].forEach(([x, y, z, r]) =>
      this.boule(r, c, [x, y, z], { ...fl, poil: 1.3 })
    );
    this.tete.position.set(0, -0.05, 0.16);
    const peau = this.mat("#FFF1E6", { wrap: 0.85 });
    this.morceau(ellipsoide(0.19, 0.165, 0.1, 32), peau, this.tete, [0, 0, 0.27]);
    // une mèche de laine sur le front, des oreilles tombantes
    this.boule(0.11, this.tete, [0, 0.17, 0.25], { ...fl, poil: 1.1 });
    const interieur = this.mat("#FFC1D9", { wrap: 0.9 });
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(this.tete, [0.17 * sx, 0.08, 0.26], [0, 0, -0.55 * sx]);
      this.morceau(ellipsoide(0.1, 0.042, 0.06, 18), peau, pv, [0.08 * sx, 0, 0]);
      this.morceau(ellipsoide(0.065, 0.02, 0.04, 14), interieur, pv, [0.085 * sx, 0.015, 0.016]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.3, t: Math.random() * 4, v: 0, x: 0 });
    });
    const sabot = this.mat("#4B4766", { wrap: 0.7 });
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => this.morceau(ellipsoide(0.055, 0.09, 0.055, 14), sabot, c, [0.15 * sx, -0.4, 0.13 * sz]));
    this.face = { R: 0.372, t: 0.95 };
  }

  // Chouette pixel : un cube de plumes, de grands disques autour des yeux, aigrettes pointues.
  plan_cube(P, L) {
    const c = this.corps;
    this.hauteur = 0.43;
    this.taille = 1.02;
    this.teteAmp = 0;
    this.spTous = [5, 8];
    this.spDuree = 1.0;
    this.centreLocal.set(0, 0.05, 0.1);
    const geo = cubeArrondi(0.33, 0.37, 0.31, 5, this.q.segW);
    this.boule([0.33, 0.37, 0.31], c, [0, 0, 0], { geo, zone: { force: 0.75, debut: 0.45, fin: 0.85, dir: [0, -0.55, 1] } });
    const creme = this.mat("#FFE9C4", { wrap: 0.8 });
    const fonce = this.mat(teinte(P.base, -0.3), { wrap: 0.7 });
    const disque = new THREE.CylinderGeometry(0.1, 0.1, 0.03, 28);
    disque.rotateX(Math.PI / 2);
    this.tete.position.set(0, 0, 0);
    this.face = { R: 0.4, t: 1.3, yeuxSur: [], bec: P.accent, becTaille: 1.25, becPenche: 0.55, boucheSur: { parent: c, pos: [0, -0.04, 0.41] }, jouesSur: [{ sx: -1, parent: c, pos: [-0.2, -0.07, 0.4] }, { sx: 1, parent: c, pos: [0.2, -0.07, 0.4] }] };
    [-1, 1].forEach((sx) => {
      this.morceau(disque, creme, c, [0.125 * sx, 0.06, 0.4]);
      this.face.yeuxSur.push({ sx, parent: c, pos: [0.125 * sx, 0.06, 0.418] });
      // sourcil de plumes en V
      this.morceau(new THREE.BoxGeometry(0.15, 0.04, 0.03), fonce, c, [0.12 * sx, 0.185, 0.405], [0, 0, -0.32 * sx]);
      // aigrettes en pyramide
      const pv = this.articulation(c, [0.22 * sx, 0.36, -0.01], [0, 0.785, -0.32 * sx]);
      const cone = new THREE.ConeGeometry(0.08, 0.2, 4);
      cone.translate(0, 0.1, 0);
      this.morceau(cone, fonce, pv, [0, 0, 0]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.15, t: Math.random() * 4, v: 0, x: 0 });
      // ailes plates en blocs
      const aile = this.articulation(c, [0.34 * sx, 0.1, -0.02], [0, 0, 0.06 * sx]);
      this.morceau(cubeArrondi(0.055, 0.2, 0.15, 4, 24), this.mat(teinte(P.base, -0.2), { wrap: 0.7 }), aile, [0.035 * sx, -0.16, 0]);
      (this.r.ailes ??= []).push({ pv: aile, sx });
      // pattes carrées
      this.morceau(cubeArrondi(0.07, 0.035, 0.07, 4, 16), this.mat(P.accent), c, [0.12 * sx, -0.405, 0.16]);
    });
    // trois petits pixels qui flottent autour
    this.eclats = nuageDePoints(
      [
        { pos: [0.5, 0.2, 0], couleur: "#FFFFFF", taille: 0.12 },
        { pos: [-0.5, 0.0, 0], couleur: "#FFF2C0", taille: 0.1 },
        { pos: [0.2, -0.1, 0.5], couleur: "#FFFFFF", taille: 0.08 },
      ],
      matierePoints({ temps: L.uTime, forme: 1, px: this.pointsU.uPx, echelle: this.pointsU.uEchelle })
    );
    c.add(this.eclats);
  }

  // Renard comète : assis de trois quarts, museau crème, grandes oreilles, énorme queue qui balaie.
  plan_renard(P, L) {
    const c = this.corps;
    this.hauteur = 0.31;
    this.baseYaw = 0.32;
    this.teteRepos.set(0, -0.26, 0);
    this.spTous = [5, 8];
    this.spDuree = 1.35;
    const creme = fourrureDe(P.accent, { ventre: "#FFFFFF" });
    this.boule([0.29, 0.32, 0.29], c, [0, 0, 0], { zone: { force: 0.95, debut: 0.45, fin: 0.85, dir: [0, -0.15, 1], couleur: P.accent } });
    this.tete.position.set(0, 0.37, 0.08);
    this.boule(0.25, this.tete, [0, 0, 0], { zone: { force: 0.9, debut: 0.62, fin: 0.95, dir: [0, -0.7, 1], couleur: P.accent } });
    [-1, 1].forEach((sx) => this.boule([0.1, 0.075, 0.085], this.tete, [0.2 * sx, -0.09, 0.07], { P: creme, poil: 1.1, rot: [0, 0, -0.5 * sx] }));
    this.museau(this.tete, [0, -0.075, 0.215], [0.09, 0.068, 0.11], creme, "#2A1A1A");
    const oreille = this.mat(P.base, { wrap: 0.85 });
    const interieur = this.mat(P.accent, { wrap: 0.9 });
    const pointeO = this.mat("#4A160C", { wrap: 0.8 });
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(this.tete, [0.14 * sx, 0.18, -0.02], [-0.1, 0, -0.3 * sx]);
      const cone = new THREE.ConeGeometry(0.085, 0.25, 18);
      cone.translate(0, 0.125, 0);
      this.morceau(cone, oreille, pv, [0, 0, 0]);
      const coneIn = new THREE.ConeGeometry(0.05, 0.17, 14);
      coneIn.translate(0, 0.085, 0);
      this.morceau(coneIn, interieur, pv, [0, 0.015, 0.035]);
      const bout = new THREE.ConeGeometry(0.03, 0.065, 12);
      bout.translate(0, 0.22, 0);
      this.morceau(bout, pointeO, pv, [0, 0.001, 0]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.25, t: Math.random() * 4, v: 0, x: 0 });
    });
    // la queue de comète, qui sort sur le côté
    const pq = this.articulation(c, [-0.14, -0.2, -0.2], [-0.45, 0, 0.95]);
    this.boule([0.15, 0.36, 0.15], pq, [0, 0.3, -0.02], { poil: 1.3, zone: { dir: [0, 1, 0], couleur: "#FFF4EA", debut: 0.45, fin: 0.85, force: 1 } });
    this.r.bout = new THREE.Object3D();
    this.r.bout.position.set(0, 0.6, -0.02);
    pq.add(this.r.bout);
    this.queue = { pv: pq, axe: "z", amp: 0.42, vitesse: 1.9 };
    const patte = this.mat(teinte(P.base, -0.35), { wrap: 0.8 });
    const blanc = this.mat("#FFF4EA", { wrap: 0.85 });
    [-1, 1].forEach((sx) => {
      this.morceau(ellipsoide(0.07, 0.05, 0.08, 16), blanc, c, [0.11 * sx, -0.29, 0.26]);
      this.morceau(ellipsoide(0.09, 0.05, 0.13, 16), patte, c, [0.21 * sx, -0.3, 0.05], [0, 0.35 * sx, 0]);
    });
    this.face = { R: 0.292, t: 0.95 };
  }

  // Chat de cristal : assis, tête large aux joues touffues, moustaches, longue queue qui ondule, cristaux.
  plan_chat(P, L) {
    const c = this.corps;
    this.hauteur = 0.32;
    this.baseYaw = -0.3;
    this.teteRepos.set(0, 0.24, 0);
    this.spTous = [6, 10];
    this.spDuree = 2.4;
    const clair = fourrureDe(P.accent, { ventre: "#FFFFFF" });
    this.boule([0.28, 0.33, 0.27], c, [0, 0, 0], { zone: { force: 0.85, debut: 0.5, fin: 0.9, dir: [0, -0.2, 1], couleur: P.accent } });
    this.tete.position.set(0, 0.38, 0.07);
    this.boule([0.27, 0.23, 0.245], this.tete, [0, 0, 0], { zone: { force: 0.8, debut: 0.65, fin: 0.95, dir: [0, -0.7, 1], couleur: P.accent } });
    [-1, 1].forEach((sx) => this.boule([0.075, 0.055, 0.065], this.tete, [0.245 * sx, -0.08, 0.04], { P: clair, poil: 1.25, rot: [0, 0, -0.45 * sx] }));
    const oreille = this.mat(P.base, { wrap: 0.85 });
    const interieur = this.mat("#FFB3CF", { wrap: 0.9 });
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(this.tete, [0.15 * sx, 0.15, -0.02], [-0.05, 0, -0.42 * sx]);
      const cone = new THREE.ConeGeometry(0.1, 0.18, 16);
      cone.translate(0, 0.09, 0);
      this.morceau(cone, oreille, pv, [0, 0, 0]);
      const coneIn = new THREE.ConeGeometry(0.06, 0.12, 14);
      coneIn.translate(0, 0.06, 0);
      this.morceau(coneIn, interieur, pv, [0, 0.012, 0.045]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.25, t: Math.random() * 4, v: 0, x: 0 });
      // moustaches
      const mo = this.mat("#FFFFFF", { emissive: 0.4 });
      [-0.18, 0, 0.18].forEach((a) => {
        const w = new THREE.CylinderGeometry(0.0035, 0.0018, 0.2, 5);
        w.rotateZ(Math.PI / 2);
        w.translate(0.1 * sx, 0, 0);
        this.morceau(w, mo, this.tete, [0.13 * sx, -0.07, 0.19], [0, -0.3 * sx, a * sx]);
      });
    });
    // un cristal sur le front et sur le dos, qui luisent
    const cristal = this.mat("#C8F6FF", { emissive: 0.6, iris: 0.35, opacite: 0.92, wrap: 0.9, pulse: true });
    this.morceau(new THREE.OctahedronGeometry(0.055), cristal, this.tete, [0, 0.135, 0.25], [-0.35, 0, 0], [0.85, 1.4, 0.55]);
    [[0, 0.2, -0.24, -0.5, 0.09], [0.09, 0.05, -0.27, -0.8, 0.07], [-0.09, 0.07, -0.26, -0.7, 0.065]].forEach(([x, y, z, rx, s]) =>
      this.morceau(new THREE.OctahedronGeometry(s), cristal, c, [x, y, z], [rx, 0, x * 3], [0.6, 1.6, 0.6])
    );
    // la queue
    const pts = [[0.04, -0.27, -0.18], [0.24, -0.31, -0.2], [0.38, -0.2, -0.12], [0.42, 0.0, -0.05], [0.37, 0.17, 0.0], [0.28, 0.24, 0.02]];
    this.r.queue = this.tube(pts, 0.055, 0.042, c, [0, 0, 0], { poil: 0.7, vague: { A: [0, 0, 1], B: [1, 0, 0] } });
    this.morceau(new THREE.OctahedronGeometry(0.045), cristal, c, [0.26, 0.28, 0.03], [0, 0, 0.6], [0.7, 1.5, 0.7]);
    const blanc = this.mat("#FFFFFF", { wrap: 0.85 });
    [-1, 1].forEach((sx) => {
      this.morceau(ellipsoide(0.07, 0.05, 0.08, 16), blanc, c, [0.1 * sx, -0.3, 0.25]);
      this.morceau(ellipsoide(0.085, 0.05, 0.12, 16), this.mat(P.base), c, [0.2 * sx, -0.31, 0.06], [0, 0.35 * sx, 0]);
    });
    this.face = { R: 0.29, t: 0.95, yeux: { yaw: 0.42, pitch: -0.06 }, bouche: { type: "chat", pitch: 0.3 }, nez: "#FF8FB0", nezPitch: 0.17, jouesYaw: 0.7 };
  }

  // Méduse étoile : cloche de fourrure qui se contracte, bordure frisée, étoile dorée, perles qui ondulent.
  plan_meduse(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.8;
    this.ombreT = [0.38, 0.34];
    this.teteAmp = 0.45;
    this.spTous = [6, 10];
    this.spDuree = 1.6;
    this.centreLocal.set(0, -0.05, 0.1);
    const bell = new THREE.Group();
    c.add(bell);
    this.r.cloche = bell;
    const dome = new THREE.SphereGeometry(1, this.q.segW, this.q.segH, 0, TAU, 0, Math.PI * 0.56);
    dome.scale(0.4, 0.34, 0.4);
    this.boule([0.4, 0.34, 0.4], bell, [0, 0, 0], { geo: dome, poil: 0.8, etoiles: Math.max(0.3, this.extra.etoiles), zone: { force: 0.7, debut: 0.55, fin: 1.0, dir: [0, 1, 0], couleur: P.accent } });
    const dessous = new THREE.SphereGeometry(1, 32, 12, 0, TAU, Math.PI * 0.5, Math.PI * 0.5);
    dessous.scale(0.38, 0.13, 0.38);
    this.morceau(dessous, this.mat(P.accent, { emissive: 0.45, verre: true, double: true, opacite: 0.9 }), bell, [0, -0.04, 0]);
    const frange = new THREE.TorusGeometry(0.4, 0.032, 8, 72);
    frange.rotateX(Math.PI / 2);
    const fp = frange.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const x = fp.getX(i), z = fp.getZ(i), a = Math.atan2(z, x), k = 1 + 0.045 * Math.sin(a * 12);
      fp.setXYZ(i, x * k, fp.getY(i) + 0.012 * Math.cos(a * 12), z * k);
    }
    frange.computeVertexNormals();
    this.morceau(frange, this.mat(teinte(P.accent, -0.1), { emissive: 0.45, opacite: 0.92, wrap: 0.9 }), bell, [0, -0.07, 0]);
    this.r.etoile = this.morceau(etoile(0.1, 0.045, 0.03), this.mat("#FFE27A", { emissive: 0.9, wrap: 0.8 }), bell, [0, 0.43, 0]);
    // les tentacules : des perles lumineuses (une seule pièce instanciée)
    const brins = [];
    for (let i = 0; i < 4; i++) brins.push({ a: (i / 4) * TAU + Math.PI / 4, r0: 0.11, n: 7, s0: 0.055, s1: 0.03, pas: 0.062, col: P.accent });
    for (let i = 0; i < 8; i++) brins.push({ a: (i / 8) * TAU + 0.2, r0: 0.3, n: 8, s0: 0.027, s1: 0.013, pas: 0.056, col: teinte(P.base, 0.35) });
    const total = brins.reduce((s, b) => s + b.n, 0);
    const perles = new THREE.InstancedMesh(SPHERE, solide("#FFFFFF", L, { glow: this.glow, emissive: 0.55, wrap: 0.9, opacite: 0.9 }), total);
    perles.frustumCulled = false;
    let i = 0;
    for (const b of brins) {
      b.i0 = i;
      _col.set(b.col);
      for (let j = 0; j < b.n; j++) perles.setColorAt(i++, _col);
    }
    perles.instanceColor.needsUpdate = true;
    c.add(perles);
    this.r.perles = perles;
    this.r.brins = brins;
    bell.add(this.tete);
    this.tete.position.set(0, 0, 0);
    this.face = { R: 0.44, t: 1.05, decal: -0.28 };
  }

  // Poulpe bulle : grosse tête ronde à pois, huit tentacules de fourrure qui ondulent en vague.
  plan_poulpe(P, L) {
    const c = this.corps;
    this.hauteur = 0.53;
    this.ombreT = [0.62, 0.56];
    this.teteAmp = 0.45;
    this.spTous = [5, 9];
    this.spDuree = 2;
    this.centreLocal.set(0, 0.05, 0.1);
    this.boule([0.35, 0.39, 0.34], c, [0, 0.04, -0.02], { zone: { force: 0.5, debut: 0.4, fin: 0.9, dir: [0, -0.5, 1] } });
    const pois = this.mat(teinte(P.accent, 0.2), { wrap: 0.8, emissive: 0.15 });
    [[0.15, 0.3, -0.12, 0.05], [-0.2, 0.24, -0.16, 0.04], [0.03, 0.38, -0.02, 0.035], [0.27, 0.1, -0.2, 0.035], [-0.05, 0.22, -0.3, 0.045], [-0.29, 0.06, -0.12, 0.03]].forEach(([x, y, z, r]) => {
      _v.set(x / 0.35, (y - 0.04) / 0.39, (z + 0.02) / 0.34).normalize();
      const p = [_v.x * 0.39, _v.y * 0.43 + 0.04, _v.z * 0.38 - 0.02];
      const m = this.morceau(SPHERE, pois, c, p, [0, 0, 0], [r, r, r * 0.4]);
      m.lookAt(_v2.set(p[0] * 2, p[1] * 2 - 0.04, p[2] * 2 + 0.02));
    });
    this.r.tentacules = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + Math.PI / 8;
      const g = this.articulation(c, [0, -0.2, 0], [0, -a, 0]);
      const pts = [[0.1, 0.02, 0], [0.23, -0.12, 0], [0.35, -0.22, 0], [0.46, -0.25, 0], [0.55, -0.2, 0], [0.58, -0.11, 0]];
      const m = this.tube(pts, 0.078, 0.022, g, [0, 0, 0], { poil: 0.55, zone: { dir: [0, -1, 0], couleur: P.ventre, force: 0.9, debut: 0.2, fin: 0.7 }, vague: { A: [0, 1, 0], B: [0, 0, 1], env: null } });
      this.r.tentacules.push(m);
    }
    this.r.haut = new THREE.Object3D();
    this.r.haut.position.set(0.1, 0.4, 0.1);
    c.add(this.r.haut);
    this.tete.position.set(0, -0.02, 0);
    this.face = { R: 0.4, t: 1.05, decal: 0.06 };
  }

  // Dragon de braise : bébé dragon assis, ventre doré, cornes, ailes de chauve-souris, queue à pointe.
  plan_dragon(P, L) {
    const c = this.corps;
    this.hauteur = 0.32;
    this.baseYaw = 0.22;
    this.teteRepos.set(0, -0.18, 0);
    this.spTous = [5, 8];
    this.spDuree = 2.1;
    this.boule([0.29, 0.33, 0.28], c, [0, 0, 0], { zone: { force: 1, debut: 0.42, fin: 0.82, dir: [0, -0.25, 1], couleur: "#FFD36B" } });
    this.tete.position.set(0, 0.38, 0.06);
    this.boule(0.25, this.tete, [0, 0, 0]);
    this.r.museau = this.museau(this.tete, [0, -0.075, 0.2], [0.13, 0.095, 0.11], this.P, "narines");
    this.r.gueule = new THREE.Object3D();
    this.r.gueule.position.set(0, -0.02, 0.14);
    this.r.museau.add(this.r.gueule);
    const corne = this.mat("#FFF0D2", { wrap: 0.6 });
    const accent = this.mat(P.accent, { wrap: 0.7, emissive: 0.08 });
    [-1, 1].forEach((sx) => {
      this.tete.add(new THREE.Mesh(tubeEffile([[0.1 * sx, 0.17, -0.02], [0.16 * sx, 0.27, -0.06], [0.18 * sx, 0.36, -0.13], [0.15 * sx, 0.42, -0.2]], 0.042, 0.01), corne));
      const fr = new THREE.ConeGeometry(0.05, 0.13, 3);
      fr.translate(0, 0.065, 0);
      const pv = this.articulation(this.tete, [0.22 * sx, 0.06, -0.03], [0, 0, -1.2 * sx]);
      this.morceau(fr, accent, pv, [0, 0, 0], [0, 0, 0], [1, 1, 0.35]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.25, t: Math.random() * 4, v: 0, x: 0 });
    });
    // pointes le long du dos
    [[0.24, -0.2, -0.7], [0.07, -0.3, -1.25], [-0.12, -0.28, -1.75]].forEach(([y, z, rx]) => {
      const pk = new THREE.ConeGeometry(0.045, 0.11, 8);
      pk.translate(0, 0.05, 0);
      this.morceau(pk, accent, c, [0, y, z], [rx, 0, 0]);
    });
    // ailes de chauve-souris
    const s = new THREE.Shape();
    s.moveTo(0, 0.03);
    s.quadraticCurveTo(0.16, 0.28, 0.42, 0.34);
    s.quadraticCurveTo(0.37, 0.18, 0.46, 0.11);
    s.quadraticCurveTo(0.35, 0.06, 0.34, -0.05);
    s.quadraticCurveTo(0.2, -0.02, 0.02, -0.06);
    s.lineTo(0, 0.03);
    const membrane = new THREE.ShapeGeometry(s, 10);
    const os = tubeEffile([[0, 0.02, 0.004], [0.16, 0.24, 0.004], [0.42, 0.34, 0.004]], 0.022, 0.008, 16, 6);
    const mMem = this.mat(teinte(P.accent, -0.05), { wrap: 0.9, emissive: 0.12, double: true });
    const mOs = this.mat(teinte(P.base, -0.25), { wrap: 0.7 });
    this.r.ailes = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.12 * sx, 0.14, -0.2], [0.1, 0, 0]);
      const g = new THREE.Group();
      g.scale.set(sx, 1, 1);
      g.rotation.y = 0.55 * sx;
      pv.add(g);
      g.add(new THREE.Mesh(membrane, mMem), new THREE.Mesh(os, mOs));
      this.r.ailes.push({ pv, sx });
    });
    // la queue (fourrure) et sa pointe en losange
    const pts = [[-0.02, -0.24, -0.18], [-0.16, -0.3, -0.3], [-0.33, -0.28, -0.3], [-0.46, -0.18, -0.22], [-0.52, -0.05, -0.12]];
    this.r.queue = this.tube(pts, 0.075, 0.026, c, [0, 0, 0], { poil: 0.6, vague: { A: [0, 0, 1], B: [0, 1, 0] } });
    this.r.pointe = this.morceau(new THREE.OctahedronGeometry(0.07), accent, c, [-0.53, 0.02, -0.09], [0, 0.6, 0.35], [1, 1.2, 0.3]);
    const patte = this.mat(teinte(P.base, -0.3));
    const griffe = this.mat("#FFF0D2");
    [-1, 1].forEach((sx) => {
      this.morceau(ellipsoide(0.085, 0.05, 0.12, 16), patte, c, [0.16 * sx, -0.3, 0.16]);
      [-1, 0, 1].forEach((k) => {
        const g = new THREE.ConeGeometry(0.012, 0.03, 6);
        g.rotateX(Math.PI / 2);
        this.morceau(g, griffe, c, [0.16 * sx + k * 0.035, -0.31, 0.28]);
      });
      this.boule([0.055, 0.075, 0.055], c, [0.18 * sx, 0.02, 0.22], { poil: 0.5, rot: [0.6, 0, 0.3 * sx] });
    });
    this.face = { R: 0.292, t: 0.95 };
  }

  // Grenouille de flaque : large et plate, yeux sur des bosses, gorge qui gonfle, grand saut.
  plan_grenouille(P, L) {
    const c = this.corps, glow = this.glow;
    this.hauteur = 0.25;
    this.taille = 1.08;
    this.ombreT = [0.6, 0.5];
    this.teteAmp = 0;
    this.spTous = [4, 7];
    this.spDuree = (n) => (n % 3 === 0 ? 0.7 : 1.4);
    this.centreLocal.set(0, 0.05, 0.15);
    this.boule([0.4, 0.26, 0.34], c, [0, 0, 0], { zone: { force: 0.95, debut: 0.35, fin: 0.85, dir: [0, -0.6, 0.8], couleur: "#EEF8C2" } });
    const taches = this.mat(teinte(P.accent, -0.1), { wrap: 0.8 });
    [[0.14, -0.1, 0.05], [-0.2, -0.14, 0.045], [0.02, -0.2, 0.04], [0.27, 0.02, 0.035], [-0.3, 0.0, 0.035]].forEach(([x, z, r]) => {
      _v.set(x / 0.4, 0, z / 0.34);
      _v.y = Math.sqrt(Math.max(0.05, 1 - _v.x * _v.x - _v.z * _v.z));
      const p = [x, _v.y * 0.26 + 0.035, z];
      const m = this.morceau(SPHERE, taches, c, p, [0, 0, 0], [r, r, r * 0.35]);
      m.lookAt(_v2.set(p[0] + _v.x * 0.2, p[1] + _v.y, p[2] + _v.z * 0.2));
    });
    this.tete.position.set(0, 0, 0);
    this.face = { R: 0.38, t: 1.05, yeuxSur: [], bouche: { type: "large", pitch: 0.16 }, jouesYaw: 0.62 };
    [-1, 1].forEach((sx) => {
      const b = this.articulation(c, [0.17 * sx, 0.2, 0.11]);
      this.boule(0.12, b, [0, 0, 0], { poil: 0.7 });
      this.face.yeuxSur.push({ sx, parent: b, R: 0.152, yaw: 0.22 * sx, pitch: -0.12, t: 1.2 });
    });
    this.r.gorge = this.morceau(SPHERE, this.mat("#F6FAD0", { wrap: 0.9, opacite: 0.95 }), c, [0, -0.13, 0.27], [0, 0, 0], [0.11, 0.07, 0.08]);
    this.r.gorge.userData.s = this.r.gorge.scale.clone();
    this.r.langue = this.morceau(new THREE.CylinderGeometry(0.018, 0.022, 1, 10).translate(0, 0.5, 0).rotateX(Math.PI / 2), this.mat("#FF6F9A", { wrap: 0.8 }), c, [0, -0.02, 0.33], [-0.25, 0, 0], [1, 1, 0.001]);
    this.r.langue.visible = false;
    const pied = this.mat(teinte(P.base, 0.15), { wrap: 0.85 });
    this.r.pattesAr = [];
    [-1, 1].forEach((sx) => {
      this.boule([0.055, 0.085, 0.055], c, [0.2 * sx, -0.17, 0.25], { poil: 0.5 });
      [-1, 0, 1].forEach((k) => this.morceau(SPHERE, pied, c, [0.2 * sx + k * 0.032, -0.245, 0.3], [0, 0, 0], [0.022, 0.012, 0.03]));
      const pv = this.articulation(c, [0.29 * sx, -0.1, -0.07]);
      this.boule([0.12, 0.09, 0.17], pv, [0.03 * sx, 0, 0.02], { poil: 0.7 });
      this.morceau(ellipsoide(0.085, 0.022, 0.13, 18), pied, pv, [0.1 * sx, -0.135, 0.13], [0, -0.3 * sx, 0]);
      this.r.pattesAr.push({ pv, sx });
    });
    // une flaque et deux nénuphars
    this.flaque = flaque(L, glow);
    this.flaque.scale.set(0.82, 0.6, 1);
    this.flaque.position.set(0.0, 0.006, 0.06);
    this.groupe.add(this.flaque);
    const nenuphar = solide("#3DBE6A", L, { glow, wrap: 0.6, double: true });
    [[0.52, 0.22, 0.3], [-0.5, 0.3, -2.1]].forEach(([x, z, r]) => {
      const g = new THREE.CircleGeometry(0.08, 20, 0.4, Math.PI * 2 - 0.5);
      g.rotateX(-Math.PI / 2);
      const n = new THREE.Mesh(g, nenuphar);
      n.position.set(x, 0.01, z);
      n.rotation.y = r;
      this.groupe.add(n);
    });
  }

  // Écureuil gland : petit corps droit, gland entre les pattes, énorme queue touffue en S.
  plan_ecureuil(P, L) {
    const c = this.corps;
    this.hauteur = 0.31;
    this.baseYaw = -0.34;
    this.teteRepos.set(0, 0.26, 0);
    this.regardVif = 12;
    this.spTous = [4, 7];
    this.spDuree = 0.9;
    const creme = fourrureDe(P.accent, { ventre: "#FFFFFF" });
    this.boule([0.26, 0.31, 0.25], c, [0, 0, 0], { zone: { force: 1, debut: 0.45, fin: 0.85, dir: [0, -0.1, 1], couleur: P.accent } });
    this.tete.position.set(0, 0.36, 0.07);
    this.boule(0.235, this.tete, [0, 0, 0], { zone: { force: 0.75, debut: 0.6, fin: 0.95, dir: [0, -0.6, 1], couleur: P.accent } });
    const m = this.museau(this.tete, [0, -0.07, 0.2], [0.078, 0.058, 0.075], creme, "#3A2418");
    const dent = this.mat("#FFFFFF", { wrap: 0.9, emissive: 0.15 });
    [-1, 1].forEach((sx) => this.morceau(new THREE.BoxGeometry(0.02, 0.03, 0.008), dent, m, [0.011 * sx, -0.075, 0.062], [0.3, 0, 0]));
    this.boucheMuseau.pos[1] = -0.035;
    const fonce = this.mat(teinte(P.base, -0.35), { wrap: 0.8 });
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(this.tete, [0.13 * sx, 0.18, -0.02], [-0.1, 0, -0.25 * sx]);
      this.morceau(ellipsoide(0.052, 0.088, 0.026, 16), this.mat(P.base, { wrap: 0.85 }), pv, [0, 0.07, 0]);
      this.morceau(ellipsoide(0.03, 0.055, 0.01, 12), this.mat("#FFC9A8", { wrap: 0.9 }), pv, [0, 0.068, 0.02]);
      const tf = new THREE.ConeGeometry(0.026, 0.08, 8);
      tf.translate(0, 0.04, 0);
      this.morceau(tf, fonce, pv, [0, 0.145, 0]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.3, t: Math.random() * 4, v: 0, x: 0 });
    });
    // le gland, tenu entre les pattes
    const gl = this.articulation(c, [0, 0.0, 0.27]);
    this.r.gland = gl;
    this.morceau(ellipsoide(0.062, 0.078, 0.062, 20), this.mat("#D9A066", { wrap: 0.8 }), gl, [0, -0.01, 0]);
    const cap = new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, Math.PI / 2);
    cap.scale(0.07, 0.045, 0.07);
    this.morceau(cap, this.mat("#7A4A22", { wrap: 0.7 }), gl, [0, 0.035, 0]);
    this.morceau(new THREE.CylinderGeometry(0.008, 0.01, 0.035, 6), this.mat("#5A3416"), gl, [0, 0.085, 0]);
    [-1, 1].forEach((sx) => this.boule([0.045, 0.058, 0.045], gl, [0.06 * sx, 0.0, -0.01], { poil: 0.5 }));
    // la grande queue en S
    const pts = [[0.02, -0.24, -0.2], [0.1, -0.2, -0.4], [0.18, 0.0, -0.5], [0.22, 0.3, -0.46], [0.2, 0.56, -0.32], [0.12, 0.7, -0.15], [0.05, 0.68, 0.0]];
    this.r.queue = this.tube(pts, (t) => 0.06 + 0.075 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 1.05)), 0, c, [0, 0, 0], { poil: 1.9, densite: 0.55, vague: { A: [1, 0, 0], B: [0, 0, 1] } });
    this.boule(0.07, c, [0.05, 0.68, 0.02], { poil: 1.6, densite: 0.55 });
    const patte = this.mat(teinte(P.base, -0.3));
    [-1, 1].forEach((sx) => this.morceau(ellipsoide(0.075, 0.045, 0.12, 16), patte, c, [0.14 * sx, -0.29, 0.12], [0, 0.3 * sx, 0]));
    this.face = { R: 0.277, t: 0.9 };
  }

  // Pingouin des neiges : un œuf debout, ventre blanc, bonnet à pompon, ailerons, pieds orange.
  plan_pingouin(P, L) {
    const c = this.corps;
    this.hauteur = 0.44;
    this.teteAmp = 0.35;
    this.spTous = [5, 8];
    this.spDuree = 1.3;
    this.centreLocal.set(0, 0.1, 0.1);
    this.boule([0.3, 0.41, 0.28], c, [0, 0, 0], { zone: { force: 1, debut: 0.28, fin: 0.58, dir: [0, -0.08, 1], couleur: "#F4F8FF" } });
    this.r.ailerons = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.28 * sx, 0.08, -0.01], [0, 0, 0.22 * sx]);
      this.boule([0.05, 0.18, 0.1], pv, [0.02 * sx, -0.15, 0], { poil: 0.6 });
      this.r.ailerons.push({ pv, sx });
    });
    const orange = this.mat("#FFA53A", { wrap: 0.8 });
    this.r.pieds = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.12 * sx, -0.41, 0.12]);
      this.morceau(ellipsoide(0.08, 0.03, 0.11, 16), orange, pv, [0, 0, 0], [0, 0.25 * sx, 0]);
      this.r.pieds.push({ pv, sx });
    });
    // bonnet tricoté à pompon
    const bonnet = new THREE.SphereGeometry(1, 28, 12, 0, TAU, 0, Math.PI / 2);
    bonnet.scale(0.245, 0.2, 0.235);
    const hat = this.articulation(c, [0, 0.3, -0.01], [-0.12, 0, 0.1]);
    this.morceau(bonnet, this.mat("#FF4D6D", { wrap: 0.75 }), hat, [0, 0, 0]);
    const bord = new THREE.TorusGeometry(0.24, 0.042, 10, 40);
    bord.rotateX(Math.PI / 2);
    this.morceau(bord, this.mat("#FFF6E8", { wrap: 0.9 }), hat, [0, 0.01, 0], [0, 0, 0], [1, 1, 0.97]);
    this.boule(0.07, hat, [0, 0.23, 0], { P: { racine: "#E6E9F2", base: "#FFFFFF", pointe: "#FFFFFF", ventre: "#FFFFFF" }, poil: 0.9 });
    this.oreilles.push({ pv: hat, axe: "z", sens: 1, amp: 0.12, t: Math.random() * 4, v: 0, x: 0 });
    this.tete.position.set(0, 0.17, 0);
    this.face = { R: 0.335, t: 1.0, bec: "#FFA53A", becTaille: 1.15, bouche: { pitch: 0.1 } };
  }

  // Lapin porte-bonheur : longues oreilles (une tombante), trèfle à quatre feuilles, sauts en série.
  plan_lapin(P, L) {
    const c = this.corps;
    this.hauteur = 0.3;
    this.spTous = [3, 5];
    this.spDuree = 1.3;
    this.boule([0.36, 0.32, 0.34], c, [0, 0, 0], { zone: { force: 0.6, debut: 0.55, fin: 0.95, dir: [0, -0.3, 1] } });
    this.boule(0.26, this.tete, [0, 0, 0], { zone: { force: 0.35, debut: 0.7, fin: 1.0, dir: [0, -0.45, 1] } });
    const interieur = this.mat(P.oreille || "#FFB0C6", { wrap: 0.9 });
    [[-1, 0.12], [1, -1.0]].forEach(([sx, rz]) => {
      const pv = this.articulation(this.tete, [0.09 * sx, 0.2, -0.02], [-0.12, 0, rz]);
      this.boule([0.06, 0.22, 0.04], pv, [0, 0.21, 0], { poil: 0.45 });
      this.morceau(ellipsoide(0.038, 0.16, 0.012, 18), interieur, pv, [0, 0.21, 0.04]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: sx > 0 ? 0.25 : 0.32, t: Math.random() * 4, v: 0, x: 0 });
    });
    this.boule(0.085, c, [0, -0.11, -0.35], { P: { racine: "#DDE8E2", base: "#FFFFFF", pointe: "#FFFFFF", ventre: "#FFFFFF" }, poil: 1.1 });
    const patte = this.mat(teinte(P.base, -0.2), { wrap: 0.8 });
    [-1, 1].forEach((sx) => {
      this.morceau(ellipsoide(0.07, 0.05, 0.08, 16), patte, c, [0.11 * sx, -0.29, 0.27]);
      this.morceau(ellipsoide(0.09, 0.045, 0.18, 16), patte, c, [0.22 * sx, -0.305, 0.05], [0, 0.35 * sx, 0]);
    });
    const dent = this.mat("#FFFFFF", { wrap: 0.9, emissive: 0.15 });
    [-1, 1].forEach((sx) => this.morceau(new THREE.BoxGeometry(0.02, 0.026, 0.008), dent, this.tete, [0.011 * sx, -0.105, 0.283], [0.35, 0, 0]));
    // un trèfle à quatre feuilles
    const vert = this.mat("#3DBE5A", { wrap: 0.8, emissive: 0.06 });
    this.tete.add(new THREE.Mesh(tubeEffile([[-0.12, 0.18, 0.12], [-0.14, 0.25, 0.13], [-0.15, 0.3, 0.13]], 0.011, 0.008, 12), this.mat("#2FA36F")));
    const tr = new THREE.Group();
    tr.position.set(-0.15, 0.31, 0.13);
    tr.rotation.set(0.6, 0, 0.3);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      [-1, 1].forEach((s) => {
        const m = new THREE.Mesh(SPHERE, vert);
        m.scale.set(0.024, 0.008, 0.024);
        m.position.set(Math.cos(a) * 0.035 + Math.cos(a + (s * Math.PI) / 2) * 0.014, 0, Math.sin(a) * 0.035 + Math.sin(a + (s * Math.PI) / 2) * 0.014);
        tr.add(m);
      });
    }
    this.tete.add(tr);
    this.r.trefle = tr;
    this.face = { R: 0.312, t: 1, nez: "#FF5C93", nezPitch: 0.1, bouche: { type: "chat", pitch: 0.24 } };
  }

  // Dino des rochers : tyrannosaure de trois quarts, grosse tête souriante, plaques sur le dos, petits bras.
  plan_dino(P, L) {
    const c = this.corps;
    this.hauteur = 0.41;
    this.baseYaw = 0.5;
    this.teteRepos.set(0, -0.38, 0);
    this.spTous = [6, 9];
    this.spDuree = 1.7;
    this.boule([0.3, 0.33, 0.37], c, [0, 0, 0], { rot: [-0.35, 0, 0], zone: { force: 0.9, debut: 0.4, fin: 0.85, dir: [0, -0.4, 0.9], couleur: teinte(P.accent, 0.2) } });
    this.tete.position.set(0, 0.36, 0.2);
    this.boule([0.25, 0.22, 0.25], this.tete, [0, 0.02, 0], { zone: { force: 0.7, debut: 0.6, fin: 0.95, dir: [0, -0.8, 0.5], couleur: teinte(P.accent, 0.3) } });
    // un grand museau arrondi, avec un sourire plein de petites dents
    const mu = this.museau(this.tete, [0, -0.08, 0.2], [0.17, 0.11, 0.13], fourrureDe(teinte(P.base, 0.18)), "narines", { poil: 0.55 });
    const dent = this.mat("#FFFFFF", { wrap: 0.9, emissive: 0.15 });
    const d = new THREE.ConeGeometry(0.014, 0.03, 6);
    d.rotateX(Math.PI);
    [-0.06, -0.02, 0.02, 0.06].forEach((x) => this.morceau(d, dent, mu, [x, -0.035 + Math.abs(x) * 0.25, 0.135 - Math.abs(x) * 0.3]));
    this.boucheMuseau.pos = [0, -0.03, 0.15];
    const plaque = this.mat(P.accent, { wrap: 0.7, emissive: 0.08 });
    const pl = new THREE.ConeGeometry(0.09, 0.2, 5);
    pl.translate(0, 0.08, 0);
    [[this.tete, 0, 0.24, -0.04, -0.25, 0.75], [this.tete, 0, 0.18, -0.19, -0.85, 0.85], [c, 0, 0.33, -0.06, -0.5, 1], [c, 0, 0.26, -0.22, -0.9, 1.05], [c, 0, 0.12, -0.35, -1.3, 0.95], [c, 0, -0.03, -0.45, -1.6, 0.8]].forEach(([par, x, y, z, rx, s]) =>
      this.morceau(pl, plaque, par, [x, y, z], [rx, 0, 0], [0.4 * s, s, s])
    );
    [-1, 1].forEach((sx) => this.boule([0.045, 0.075, 0.045], c, [0.17 * sx, 0.06, 0.31], { poil: 0.5, rot: [0.9, 0, 0.3 * sx] }));
    this.r.jambes = [];
    const patte = this.mat(teinte(P.base, -0.3));
    const griffe = this.mat("#FFF0D2");
    [-1, 1].forEach((sx, i) => {
      const pv = this.articulation(c, [0.22 * sx, -0.16, 0.0]);
      this.boule([0.13, 0.16, 0.15], pv, [0, 0, 0], { poil: 0.8 });
      this.morceau(ellipsoide(0.1, 0.05, 0.14, 16), patte, pv, [0, -0.18, 0.08]);
      [-1, 0, 1].forEach((k) => {
        const g = new THREE.ConeGeometry(0.014, 0.035, 6);
        g.rotateX(Math.PI / 2);
        this.morceau(g, griffe, pv, [k * 0.04, -0.19, 0.21]);
      });
      this.r.jambes.push({ pv, ph: i * Math.PI });
    });
    const pts = [[0, -0.12, -0.28], [0, -0.2, -0.48], [-0.08, -0.27, -0.64], [-0.2, -0.3, -0.72], [-0.33, -0.3, -0.74]];
    this.r.queue = this.tube(pts, 0.15, 0.03, c, [0, 0, 0], { poil: 0.8, zone: { dir: [0, -1, 0], couleur: teinte(P.accent, 0.2), force: 0.6, debut: 0.3, fin: 0.8 }, vague: { A: [1, 0, 0], B: [0, 1, 0] } });
    this.face = { R: 0.29, t: 1.0, yeux: { pitch: -0.32 }, bouche: { type: "large", taille: 0.8 } };
  }

  // Licorne mystique : un poney de profil, crinière arc-en-ciel, corne nacrée qui scintille.
  plan_licorne(P, L) {
    const c = this.corps;
    this.hauteur = 0.45;
    this.baseYaw = 0.75;
    this.taille = 0.95;
    this.teteRepos.set(0, -0.55, 0);
    this.ombreT = [0.55, 0.42];
    this.spTous = [6, 10];
    this.spDuree = 1.7;
    this.centreLocal.set(0, 0.2, 0.2);
    const clair = fourrureDe(P.ventre);
    this.boule([0.22, 0.21, 0.34], c, [0, 0, 0], { zone: { force: 0.5, debut: 0.5, fin: 0.9, dir: [0, -1, 0] } });
    this.r.jambes = [];
    const sabot = this.mat("#FFD36B", { wrap: 0.7, emissive: 0.15 });
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const pv = this.articulation(c, [0.12 * sx, -0.12, 0.2 * sz]);
      this.boule([0.058, 0.16, 0.058], pv, [0, -0.14, 0], { poil: 0.45 });
      this.morceau(new THREE.CylinderGeometry(0.05, 0.058, 0.05, 14), sabot, pv, [0, -0.3, 0]);
      this.r.jambes.push({ pv, avant: sz > 0, sx });
    });
    this.boule([0.11, 0.2, 0.12], c, [0, 0.18, 0.27], { rot: [0.55, 0, 0] });
    this.tete.position.set(0, 0.38, 0.35);
    this.boule([0.16, 0.16, 0.19], this.tete, [0, 0, 0]);
    this.museau(this.tete, [0, -0.07, 0.14], [0.11, 0.09, 0.1], clair, "narines");
    const oreille = this.mat(P.base, { wrap: 0.85 });
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(this.tete, [0.08 * sx, 0.13, -0.04], [-0.2, 0, -0.25 * sx]);
      const cone = new THREE.ConeGeometry(0.04, 0.11, 12);
      cone.translate(0, 0.055, 0);
      this.morceau(cone, oreille, pv, [0, 0, 0]);
      this.oreilles.push({ pv, axe: "z", sens: sx, amp: 0.3, t: Math.random() * 4, v: 0, x: 0 });
    });
    // la corne en spirale
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const y = (i / 30) * 0.25;
      pts.push(new THREE.Vector2(Math.max(1e-4, 0.042 * Math.pow(1 - y / 0.25, 0.9) * (1 + 0.14 * Math.sin(y * 95))), y));
    }
    const corne = this.articulation(this.tete, [0, 0.12, 0.07], [0.45, 0, 0]);
    this.morceau(new THREE.LatheGeometry(pts, 16), this.mat("#FFF1C2", { iris: 0.45, emissive: 0.35, wrap: 0.8 }), corne, [0, 0, 0]);
    this.r.corne = new THREE.Object3D();
    this.r.corne.position.set(0, 0.25, 0);
    corne.add(this.r.corne);
    // crinière et queue arc-en-ciel
    this.r.criniere = [];
    [[0, 0.17, -0.05, 0.6], [0, 0.11, -0.15, 0.9]].forEach(([x, y, z, rx], i) =>
      this.r.criniere.push(this.boule([0.075, 0.12, 0.08], this.tete, [x, y, z], { P: fourrureDe(ARC_EN_CIEL[i]), poil: 1.3, rot: [rx, 0, 0] }))
    );
    [[0, 0.38, 0.2, 0.9], [0, 0.3, 0.13, 0.7], [0, 0.21, 0.07, 0.5]].forEach(([x, y, z, rx], i) =>
      this.r.criniere.push(this.boule([0.08, 0.13, 0.085], c, [x, y + 0.02, z - 0.02], { P: fourrureDe(ARC_EN_CIEL[i + 2]), poil: 1.3, rot: [rx, 0, 0] }))
    );
    const pq = this.articulation(c, [0, 0.1, -0.33], [-0.5, 0, 0]);
    [0, 1, 2].forEach((i) => this.boule([0.06, 0.13, 0.065], pq, [0.025 * (i - 1), -0.12 - i * 0.05, -0.06 - i * 0.02], { P: fourrureDe(ARC_EN_CIEL[(i * 2 + 1) % 6]), poil: 1.2, rot: [0.3 + i * 0.15, 0, (i - 1) * 0.3] }));
    this.queue = { pv: pq, axe: "y", amp: 0.35, vitesse: 2.2 };
    this.face = { R: 0.2, t: 0.75, yeux: { pitch: -0.05 } };
  }

  // Baleine cosmique : grand corps en goutte qui nage dans l'air, nageoires, queue qui bat, jet d'eau.
  plan_baleine(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.64;
    this.baseYaw = 0.78;
    this.ombreT = [0.62, 0.42];
    this.teteAmp = 0.35;
    this.spTous = [5, 8];
    this.spDuree = 2.4;
    this.centreLocal.set(0, 0.05, 0.25);
    const geo = deformer(
      (x, y, z, o) => {
        const k = z < 0 ? 1 + 0.62 * z : 1;
        return o.set(x * k * 0.4, (y < 0 ? y * 0.92 : y) * k * 0.34, z * 0.58);
      },
      this.q.segW,
      this.q.segH
    );
    this.boule([0.4, 0.34, 0.58], c, [0, 0, 0], { geo, etoiles: Math.max(0.35, this.extra.etoiles), zone: { force: 0.95, debut: 0.3, fin: 0.75, dir: [0, -1, 0.3], couleur: P.accent } });
    const queue = this.articulation(c, [0, 0.02, -0.55]);
    [-1, 1].forEach((sx) => this.boule([0.17, 0.035, 0.085], queue, [0.12 * sx, 0, -0.06], { poil: 0.5, rot: [0, 0.45 * sx, 0] }));
    this.r.queue = queue;
    this.r.nageoires = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.32 * sx, -0.12, 0.16], [0, 0, -0.35 * sx]);
      this.boule([0.15, 0.03, 0.075], pv, [0.12 * sx, -0.01, -0.03], { poil: 0.5, rot: [0, 0.45 * sx, 0] });
      this.r.nageoires.push({ pv, sx });
    });
    this.r.event = new THREE.Object3D();
    this.r.event.position.set(0, 0.36, 0.15);
    c.add(this.r.event);
    this.tete.position.set(0, 0.0, 0.2);
    this.teteRepos.set(0, -0.5, 0);
    this.face = { R: 0.41, t: 1.1, decal: 0.08, yeux: { yaw: 0.4 } };
  }

  // Paon aurore : petit oiseau bleu, aigrette à pompons, immense roue de plumes irisées qui s'ouvre.
  plan_paon(P, L) {
    const c = this.corps;
    this.hauteur = 0.34;
    this.ombreT = [0.5, 0.4];
    this.spTous = [6, 9];
    this.spDuree = 1.6;
    this.centreLocal.set(0, 0.2, 0.1);
    this.boule([0.23, 0.3, 0.23], c, [0, 0, 0.04], { zone: { force: 0.6, debut: 0.5, fin: 0.9, dir: [0, -0.3, 1], couleur: teinte(P.base, 0.3) } });
    this.boule([0.11, 0.16, 0.11], c, [0, 0.27, 0.09], { poil: 0.8 });
    this.tete.position.set(0, 0.43, 0.1);
    this.boule(0.15, this.tete, [0, 0, 0], { zone: { force: 0.8, debut: 0.75, fin: 0.98, dir: [0, -0.1, 1], couleur: "#FFFFFF" } });
    // aigrette : tiges et pompons
    const tiges = [], pompons = [];
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.26;
      tiges.push(peint(tubeEffile([[0, 0.12, 0], [Math.sin(a) * 0.05, 0.2, -0.02], [Math.sin(a) * 0.11, 0.3, -0.04]], 0.006, 0.004, 10, 5), "#2A6F9E"));
      const s = new THREE.SphereGeometry(0.027, 12, 8);
      s.translate(Math.sin(a) * 0.11, 0.31, -0.04);
      pompons.push(peint(s, i % 2 ? P.accent : "#FFE27A"));
    }
    this.morceau(fusion([...tiges, ...pompons]), solide("#FFFFFF", L, { glow: this.glow, couleurs: true, emissive: 0.2, wrap: 0.8 }), this.tete, [0, 0, 0]);
    // la roue : une plume (tige + ocelle) fusionnée, puis instanciée
    const plume = fusion([
      peint(ellipsoide(0.07, 0.29, 0.012, 18).translate(0, 0.33, 0), "#1FB58F"),
      peint(ellipsoide(0.055, 0.066, 0.016, 16).translate(0, 0.53, 0.004), "#D3E86A"),
      peint(ellipsoide(0.036, 0.044, 0.02, 14).translate(0, 0.53, 0.008), "#3F51D8"),
      peint(ellipsoide(0.017, 0.022, 0.024, 10).translate(0, 0.535, 0.012), "#2A0F55"),
    ]);
    const N = 13, M = 11;
    const roue = new THREE.InstancedMesh(plume, solide("#FFFFFF", L, { glow: this.glow, couleurs: true, iris: 0.3, emissive: 0.18, wrap: 0.9, double: true }), N + M);
    roue.frustumCulled = false;
    const roueG = this.articulation(c, [0, -0.16, -0.22], [-0.3, 0, 0]);
    roueG.scale.setScalar(1.32);
    roueG.add(roue);
    this.r.roue = roue;
    this.r.roueN = [N, M];
    this.majRoue(0.95, 0);
    const pattes = this.mat("#8A8F99", { wrap: 0.7 });
    [-1, 1].forEach((sx) => {
      this.morceau(new THREE.CylinderGeometry(0.014, 0.012, 0.12, 8), pattes, c, [0.08 * sx, -0.32, 0.06]);
      this.morceau(ellipsoide(0.045, 0.015, 0.06, 12), pattes, c, [0.08 * sx, -0.375, 0.1]);
    });
    this.face = { R: 0.19, t: 0.7, bec: "#E8D5B0", becTaille: 1.2, bouche: { pitch: 0.18 } };
  }
  majRoue(ouv, fremit) {
    const [N, M] = this.r.roueN, roue = this.r.roue;
    for (let i = 0; i < N + M; i++) {
      const rang = i < N ? 0 : 1, n = rang ? M : N, j = rang ? i - N : i;
      const u = j / (n - 1) - 0.5;
      const a = u * Math.PI * 0.86 * ouv + (fremit ? Math.sin(this.ta * 47 + i * 1.7) * fremit : 0);
      const s = rang ? 0.74 : 1;
      _e.set(rang ? 0.12 : 0, 0, -a);
      _q.setFromEuler(_e);
      _m4.compose(_v.set(0, 0, rang ? 0.03 : 0), _q, _sc.set(s, s * (0.8 + 0.2 * ouv), s));
      roue.setMatrixAt(i, _m4);
    }
    roue.instanceMatrix.needsUpdate = true;
  }

  // Phénix céleste : oiseau de feu qui plane, grandes ailes de plumes-flammes, longues plumes de queue.
  plan_phenix(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.6;
    this.ombreT = [0.5, 0.36];
    this.spTous = [6, 9];
    this.spDuree = 1.5;
    this.centreLocal.set(0, 0.05, 0.05);
    this.boule([0.23, 0.27, 0.22], c, [0, 0, 0], { P: { ...this.P, pointe: "#FFE066" }, zone: { force: 1, debut: 0.45, fin: 0.85, dir: [0, -0.3, 1], couleur: "#FFE066" } });
    this.tete.position.set(0, 0.31, 0.06);
    this.boule(0.18, this.tete, [0, 0, 0], { P: { ...this.P, pointe: "#FFE066" } });
    const feu = solide("#FFFFFF", L, { glow: this.glow, couleurs: true, emissive: 0.55, wrap: 0.9, double: true });
    // crête de flammes
    const crete = [[-0.35, 0.15, 0], [0, 0.22, 0.04], [0.35, 0.15, 0]].map(([rz, h], i) => {
      const g = flamme(h, 0.05);
      g.rotateZ(rz);
      g.rotateX(-0.45);
      g.translate(rz * 0.05, 0.13, -0.02 - i * 0.0);
      return peint(g, i === 1 ? P.accent : "#FF6A2B");
    });
    this.morceau(fusion(crete), feu, this.tete, [0, 0, 0]);
    // ailes : cinq plumes-flammes en éventail, de l'orange au rose
    const coul = ["#FFC21F", "#FF9F1C", "#FF6A2B", "#FF4F7A", P.accent];
    const aile = fusion(
      coul.map((col, i) => {
        const long = 0.2 + i * 0.045, a = 0.65 - i * 0.3;
        const g = ellipsoide(long, 0.05, 0.014, 18);
        g.translate(long * 0.9, 0, 0);
        g.rotateZ(a);
        return peint(g, col);
      })
    );
    this.r.ailes = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.17 * sx, 0.1, -0.06], [0, -0.25 * sx, 0]);
      const g = new THREE.Mesh(aile, feu);
      g.scale.set(sx, 1, 1);
      pv.add(g);
      this.r.ailes.push({ pv, sx });
    });
    // longues plumes de queue
    const qq = [];
    [-0.35, 0, 0.35].forEach((a, i) => {
      const pts = [[0, 0, 0], [Math.sin(a) * 0.08, -0.15, -0.1], [Math.sin(a) * 0.18, -0.32, -0.12], [Math.sin(a) * 0.26, -0.44, -0.05]];
      qq.push(peint(tubeEffile(pts, 0.02, 0.008, 20, 6), "#FF8A1C"));
      const f = flamme(0.16, 0.045);
      f.rotateX(Math.PI);
      f.rotateZ(a * 0.6);
      f.translate(Math.sin(a) * 0.26, -0.42, -0.05);
      qq.push(peint(f, i === 1 ? "#FFC21F" : P.accent));
    });
    this.r.queue = this.articulation(c, [0, -0.2, -0.12], [0.2, 0, 0]);
    this.morceau(fusion(qq), feu, this.r.queue, [0, 0, 0]);
    this.face = { R: 0.222, t: 0.8, bec: "#FFD23F", becTaille: 1.2, bouche: { pitch: 0.16 } };
  }

  // Dragon galaxie : long corps de serpent étoilé qui ondule dans l'air, tête à bois dorés et moustaches.
  plan_serpent(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.6;
    this.ombreT = [0.72, 0.34];
    this.teteAmp = 0.6;
    this.spTous = [6, 9];
    this.spDuree = 2;
    this.centreLocal.set(0, 0.05, 0.05);
    const pts = [[-0.5, 0.0, 0.05], [-0.25, 0.0, 0.02], [0, 0.0, -0.02], [0.25, 0.0, -0.04], [0.5, 0.02, -0.04], [0.68, 0.05, -0.03]];
    this.r.corpsS = this.tube(pts, (t) => 0.115 - 0.08 * t * t, 0, c, [0, 0, 0], {
      poil: 0.75,
      seg: 64,
      vague: { A: [0, 1, 0], B: [0, 0, 1], env: [0, 1, 1, 0], selonX: true },
      zone: { dir: [0, 1, 0], couleur: P.accent, debut: 0.55, fin: 0.85, force: 0.9 },
      etoiles: Math.max(0.9, this.extra.etoiles),
      nebuleuse: this.extra.nebuleuse || "#FF6AD5",
    });
    this.r.bout = this.articulation(c, [0.7, 0.05, -0.03]);
    this.boule([0.08, 0.05, 0.05], this.r.bout, [0.02, 0, 0], { P: fourrureDe(P.accent), poil: 1.4 });
    // la tête, au bout de devant
    this.r.cou = this.articulation(c, [-0.56, 0.04, 0.08]);
    this.r.cou.add(this.tete);
    this.tete.position.set(0, 0.04, 0.04);
    this.teteRepos.set(0, -0.35, 0);
    this.boule([0.2, 0.17, 0.2], this.tete, [0, 0, 0], { etoiles: 0.5 });
    const m = this.museau(this.tete, [0, -0.05, 0.17], [0.11, 0.08, 0.1], this.P, "narines");
    const or = this.mat("#FFD36B", { wrap: 0.7, emissive: 0.25 });
    this.r.moustaches = [];
    [-1, 1].forEach((sx) => {
      const bois = this.articulation(this.tete, [0.08 * sx, 0.13, -0.04], [0, 0, 0]);
      bois.add(new THREE.Mesh(tubeEffile([[0, 0, 0], [0.05 * sx, 0.1, -0.05], [0.08 * sx, 0.2, -0.13]], 0.022, 0.008), or));
      bois.add(new THREE.Mesh(tubeEffile([[0.04 * sx, 0.08, -0.04], [0.1 * sx, 0.12, -0.03], [0.13 * sx, 0.17, -0.05]], 0.012, 0.006), or));
      const mo = this.articulation(m, [0.09 * sx, 0.0, 0.06]);
      mo.add(new THREE.Mesh(tubeEffile([[0, 0, 0], [0.12 * sx, -0.02, -0.04], [0.22 * sx, -0.1, -0.12], [0.28 * sx, -0.2, -0.16]], 0.009, 0.003, 20, 5), or));
      this.r.moustaches.push({ pv: mo, sx });
    });
    this.boule([0.1, 0.14, 0.09], this.tete, [0, 0.03, -0.15], { P: fourrureDe(P.accent), poil: 1.4, rot: [-0.6, 0, 0], etoiles: 0 });
    this.face = { R: 0.235, t: 0.8 };
  }

  // Axolotl prisme : grosse tête souriante, six branchies plumeuses irisées, queue à nageoire qui ondule.
  plan_axolotl(P, L) {
    const c = this.corps;
    this.hauteur = 0.3;
    this.baseYaw = 0.55;
    this.taille = 1.05;
    this.teteRepos.set(0, -0.42, 0);
    this.ombreT = [0.5, 0.4];
    this.spTous = [5, 8];
    this.spDuree = 1.6;
    this.centreLocal.set(0, 0.08, 0.25);
    const iris = Math.max(0.3, this.extra.iris);
    this.boule([0.19, 0.16, 0.3], c, [0, 0, -0.02], { iris, zone: { force: 0.8, debut: 0.4, fin: 0.85, dir: [0, -1, 0.2] } });
    this.r.cou = this.articulation(c, [0, 0.03, 0.22]);
    this.r.cou.add(this.tete);
    this.tete.position.set(0, 0.05, 0.12);
    this.boule([0.28, 0.2, 0.22], this.tete, [0, 0, 0], { iris, zone: { force: 0.6, debut: 0.6, fin: 0.95, dir: [0, -0.8, 0.6] } });
    const rose = fourrureDe(P.accent);
    this.r.branchies = [];
    [-1, 1].forEach((sx) => {
      [[0.08, 0.2], [0.0, 0.0], [-0.07, -0.2]].forEach(([y, a], i) => {
        const pv = this.articulation(this.tete, [0.22 * sx, y, -0.06], [0, 0, 0]);
        const pts = [[0, 0, 0], [0.08 * sx, 0.04 + a * 0.3, -0.04], [0.16 * sx, 0.1 + a * 0.55, -0.08], [0.21 * sx, 0.15 + a * 0.75, -0.1]];
        this.tube(pts, 0.026, 0.014, pv, [0, 0, 0], { P: rose, poil: 0.55, iris: 0.55, densite: 1.4, couches: 14 });
        this.r.branchies.push({ pv, sx, i });
      });
    });
    const pq = this.articulation(c, [0, 0.01, -0.28]);
    this.boule([0.065, 0.12, 0.28], pq, [0, 0, -0.23], { iris });
    this.morceau(ellipsoide(0.01, 0.17, 0.3, 24), this.mat(P.accent, { verre: true, emissive: 0.4, double: true, iris: 0.4 }), pq, [0, 0.03, -0.25]);
    this.r.queue = pq;
    this.morceau(ellipsoide(0.01, 0.06, 0.24, 20), this.mat(P.accent, { verre: true, emissive: 0.4, double: true }), c, [0, 0.17, -0.06]);
    this.r.pattes = [];
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
      const pv = this.articulation(c, [0.15 * sx, -0.1, 0.14 * sz], [0, 0, -0.5 * sx]);
      this.boule([0.035, 0.07, 0.035], pv, [0.02 * sx, -0.05, 0], { poil: 0.45, iris });
      this.r.pattes.push({ pv, sx, sz });
    });
    this.face = { R: 0.285, t: 0.9, yeux: { yaw: 0.5, pitch: -0.2, taille: 0.9 }, bouche: { type: "large", pitch: 0.22 }, jouesYaw: 0.7 };
  }

  // Raie nébuleuse : un grand losange plat semé d'étoiles, ailes qui ondulent, longue queue fouet.
  plan_raie(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.66;
    this.basePitch = 0.42;
    this.ombreT = [0.72, 0.46];
    this.teteAmp = 0.25;
    this.spTous = [6, 9];
    this.spDuree = 2;
    this.centreLocal.set(0, 0.05, 0.1);
    const geo = deformer(
      (x, y, z, o) => {
        const ax = Math.abs(x);
        const ep = 0.07 * (1 - 0.85 * Math.pow(ax, 1.3)) + 0.075 * Math.exp(-(x * x) / 0.05) * (z > -0.3 ? 1 : 0.5);
        return o.set(x * 0.7, y * ep, z * 0.36 * (1 - 0.82 * Math.pow(ax, 1.4)) - 0.18 * x * x + 0.04);
      },
      this.q.segW,
      this.q.segH
    );
    this.boule([0.66, 0.14, 0.36], c, [0, 0, 0], { geo, etoiles: Math.max(1, this.extra.etoiles), nebuleuse: this.extra.nebuleuse || P.accent, zone: { dir: [0, -1, 0], couleur: "#F4E8FF", force: 0.9, debut: 0.25, fin: 0.6 } });
    this.r.raie = this.mats[this.mats.length - 1];
    const fonce = this.mat(teinte(P.base, -0.25), { wrap: 0.7 });
    [-1, 1].forEach((sx) => this.morceau(tubeEffile([[0.13 * sx, 0.0, 0.3], [0.15 * sx, -0.02, 0.38], [0.14 * sx, -0.08, 0.42], [0.11 * sx, -0.12, 0.39]], 0.03, 0.012, 16, 8), fonce, c, [0, 0, 0]));
    this.r.queue = this.articulation(c, [0, 0.0, -0.3]);
    this.morceau(tubeEffile([[0, 0, 0], [0, 0.01, -0.2], [0, 0.04, -0.4], [0, 0.03, -0.6]], 0.02, 0.004, 24, 6), fonce, this.r.queue, [0, 0, 0]);
    this.tete.position.set(0, 0.0, 0.14);
    this.face = {
      R: 0.25,
      t: 0.85,
      yeuxSur: [-1, 1].map((sx) => ({ sx, parent: c, pos: [0.1 * sx, 0.125, 0.25], rot: [-0.95, 0.15 * sx, 0], t: 0.9 })),
      jouesSur: [-1, 1].map((sx) => ({ sx, parent: c, pos: [0.19 * sx, 0.09, 0.27], rot: [-0.8, 0.3 * sx, 0] })),
      boucheSur: { parent: c, pos: [0, 0.07, 0.345], rot: [-0.45, 0, 0] },
      bouche: { type: "large", taille: 0.9 },
    };
  }

  // Lumo la luciole : tête-corps indigo toute douce, ventre-lanterne doré qui pulse, ailes de verre, antennes.
  plan_luciole(P, L) {
    const c = this.corps;
    this.flotte = true;
    this.hauteur = 0.68;
    this.teteAmp = 0.55;
    this.ombreT = [0.42, 0.36];
    this.spTous = [5, 8];
    this.spDuree = 1.3;
    this.centreLocal.set(0, -0.1, 0);
    this.boule(0.29, c, [0, 0.04, 0], { P: { ...this.P, pointe: teinte(P.base, 0.45) }, zone: { force: 0.5, debut: 0.6, fin: 1, dir: [0, -1, -0.4], couleur: P.accent } });
    // la lanterne
    const ventre = this.articulation(c, [0, -0.25, -0.13], [0.55, 0, 0]);
    this.r.lanterne = this.morceau(ellipsoide(0.19, 0.21, 0.2, 32), this.mat(P.accent, { emissive: 1.0, wrap: 1 }), ventre, [0, -0.04, 0]);
    const anneau = this.mat(teinte(P.accent, -0.35), { wrap: 0.8, emissive: 0.3 });
    [[0.06, 0.2], [-0.05, 0.198]].forEach(([y, r]) => {
      const t = new THREE.TorusGeometry(r, 0.014, 8, 40);
      t.rotateX(Math.PI / 2);
      this.morceau(t, anneau, ventre, [0, y, 0], [0, 0, 0], [1, 1, 1.02]);
    });
    this.r.halo = nuageDePoints([{ pos: [0, -0.06, 0], couleur: "#FFC845", taille: 1.25, alpha: 0.55 }], matierePoints({ temps: L.uTime, forme: 0, px: this.pointsU.uPx, echelle: this.pointsU.uEchelle }));
    ventre.add(this.r.halo);
    this.r.ventre = ventre;
    // ailes de verre
    const verre = this.mat("#C7D2FE", { verre: true, emissive: 0.35, double: true, opacite: 0.9, wrap: 1 });
    this.r.ailes = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.1 * sx, 0.2, -0.17], [0.3, 0, 0.5 * sx]);
      this.morceau(ellipsoide(0.26, 0.014, 0.13, 24), verre, pv, [0.23 * sx, 0.02, -0.02]);
      const pv2 = this.articulation(c, [0.1 * sx, 0.12, -0.2], [0.5, 0, 0.15 * sx]);
      this.morceau(ellipsoide(0.19, 0.012, 0.09, 20), verre, pv2, [0.17 * sx, 0, -0.03]);
      this.r.ailes.push({ pv, sx, ph: 0 }, { pv: pv2, sx, ph: 1.4 });
    });
    // antennes aux bouts lumineux
    const fonce = this.mat("#312E81", { wrap: 0.7 });
    const bout = this.mat(P.accent, { emissive: 1.4 });
    this.r.antennes = [];
    [-1, 1].forEach((sx) => {
      const pv = this.articulation(c, [0.09 * sx, 0.3, 0.06], [0, 0, 0]);
      pv.add(new THREE.Mesh(tubeEffile([[0, 0, 0], [0.04 * sx, 0.12, 0.04], [0.13 * sx, 0.22, 0.06], [0.2 * sx, 0.25, 0.06]], 0.013, 0.009, 16, 6), fonce));
      this.morceau(SPHERE, bout, pv, [0.205 * sx, 0.25, 0.06], [0, 0, 0], [0.04, 0.04, 0.04]);
      this.r.antennes.push({ pv, sx });
    });
    this.tete.position.set(0, 0.04, 0);
    this.face = { R: 0.33, t: 1.2, sclere: true, boucheCouleur: "#FFFFFF", decal: 0.02 };
  }

  /* ---------- les mouvements ---------- */

  sauter(force = 1) {
    if (this.y > 0.02) return;
    this.vy = 2.2 * force;
    this.sv += 3.2 * force;
  }

  // vrai toutes les `periode` secondes (minuteur nommé)
  chaque(cle, periode, dt) {
    if (dt <= 0) return false;
    const m = this.minuteurs;
    m[cle] = (m[cle] ?? Math.random() * periode) - dt;
    if (m[cle] <= 0) {
      m[cle] += periode;
      return true;
    }
    return false;
  }

  // des étincelles depuis un point de la créature (direction dans le repère de ce point)
  jet(obj, couleurs, n, vitesse, taille, dir) {
    if (!this.emettre || !obj) return;
    obj.getWorldPosition(_v);
    let d = null;
    if (dir) d = _v2.set(dir[0], dir[1], dir[2]).transformDirection(obj.matrixWorld);
    this.emettre(_v, couleurs, n, vitesse, taille, d);
  }

  anim_tortue(ta, dt) {
    const f = this.f, sp = this.sp, w = 2.6;
    // de temps en temps elle rentre la tête dans sa carapace, puis ressort d'un coup
    const cache = sp.t >= 0 ? enveloppe(sp.t, sp.duree, 0.35) : 0;
    if (sp.t > sp.duree - 0.4 && !sp.fait) {
      sp.fait = 1;
      this.sauter(0.3);
    }
    const marche = 1 - cache;
    for (const p of this.r.pattes) {
      p.pv.rotation.x = 0.42 * Math.sin(w * ta + p.ph) * marche;
      p.pv.position.y = p.pv.userData.pos.y + 0.012 * Math.max(0, Math.sin(w * ta + p.ph)) * marche + cache * 0.06;
      p.pv.scale.setScalar(1 - cache * 0.3);
    }
    f.rz = 0.05 * Math.sin(w * ta) * marche;
    f.y = 0.008 * Math.abs(Math.sin(w * ta)) * marche - cache * 0.04;
    f.ry = 0.2 * Math.sin(ta * 0.35);
    const cou = this.r.cou;
    cou.position.z = cou.userData.pos.z + 0.025 * Math.sin(w * ta * 0.5) - cache * 0.24;
    cou.position.y = cou.userData.pos.y - cache * 0.05;
    cou.scale.setScalar(1 - cache * 0.3);
  }

  anim_mouton(ta, dt) {
    const f = this.f;
    // une balle de laine qui rebondit sans arrêt ; un saut sur quatre, elle tourne sur elle-même
    if (dt > 0 && this.calme) {
      this.rebond = (this.rebond ?? 0.5) - dt;
      if (this.rebond <= 0 && this.y <= 0.001) {
        this.nb = (this.nb ?? 0) + 1;
        const grand = this.nb % 4 === 0 || this.sp.t >= 0;
        this.sauter(grand ? 0.9 : 0.52);
        this.tourne = grand ? 1 : 0;
        this.tAir = 0;
        this.rebond = grand ? 0.95 : 0.6;
      }
    }
    if (this.y > 0 && this.tourne) {
      this.tAir += dt;
      f.ry = TAU * doux(this.tAir / 0.4);
    } else this.tourne = 0;
    f.rz = 0.05 * Math.sin(ta * 3.1);
    f.souffle = 1.4;
  }

  anim_cube(ta, dt) {
    const f = this.f, sp = this.sp;
    // tout bouge par à-coups, comme un jeu vidéo en pixels (5 images par seconde)
    const pas = Math.floor(ta * 5);
    f.souffle = 0;
    f.y = (pas % 2) * 0.016;
    const pose = Math.floor(ta / 1.3);
    f.ry = [0, 0.38, 0, -0.38, 0, 0.2][pose % 6];
    f.rz = [0, 0, 0.13, 0, -0.13, 0][(pose + 2) % 6];
    // la tête qui fait le tour complet en huit à-coups (comme une vraie chouette)
    if (sp.t >= 0) f.ry = Math.min(8, Math.floor(sp.t / 0.11)) * (Math.PI / 4);
    const bat = ta % 3.4 < 0.9 || sp.t >= 0 ? (pas % 2) * 0.75 : 0;
    for (const a of this.r.ailes) a.pv.rotation.z = a.pv.userData.repos.z + bat * a.sx;
    if (this.eclats) {
      const p = this.eclats.geometry.attributes.position;
      const tq = pas / 5;
      p.setXYZ(0, Math.round(Math.cos(tq * 1.1) * 6) / 10, Math.round((0.3 + Math.sin(tq * 1.7) * 0.1) * 10) / 10, Math.round(Math.sin(tq * 1.1) * 6) / 10);
      p.setXYZ(1, Math.round(Math.cos(tq * 0.8 + 2.4) * 6) / 10, 0.1, Math.round(Math.sin(tq * 0.8 + 2.4) * 6) / 10);
      p.setXYZ(2, Math.round(Math.cos(-tq * 1.4 + 4) * 5) / 10, 0.5, Math.round(Math.sin(-tq * 1.4 + 4) * 5) / 10);
      p.needsUpdate = true;
    }
  }

  anim_renard(ta, dt) {
    const f = this.f, sp = this.sp;
    // la queue balaie largement ; des étincelles de comète s'en échappent
    if (this.chaque("comete", 0.5, dt)) this.jet(this.r.bout, ["#FFE7A0", "#FFB347", "#FFFFFF"], 2, 0.25, 0.045);
    if (sp.t >= 0) {
      // un bond : il se ramasse, puis saute en avant
      const ramasse = sp.t < 0.45 ? lisse(0, 0.35, sp.t) : 1 - lisse(0.45, 0.6, sp.t);
      f.sq = -0.45 * ramasse;
      f.rx = 0.25 * ramasse;
      if (sp.t > 0.45 && !sp.fait) {
        sp.fait = 1;
        this.sauter(0.85);
      }
      const avance = 0.14 * cloche((sp.t - 0.45) / 0.85);
      f.x = Math.sin(this.baseYaw) * avance;
      f.z = Math.cos(this.baseYaw) * avance;
      this.queue.amp = 0.7;
    } else this.queue.amp = 0.42;
  }

  anim_chat(ta, dt) {
    const f = this.f, sp = this.sp;
    f.rz = 0.035 * Math.sin(ta * 1.2);
    // la queue ondule en S
    const u = this.r.queue.material.uniforms.uVague.value;
    u.set(0.07, 0.05, 9, -ta * 2.4);
    if (sp.t >= 0) {
      // il s'étire, l'avant baissé, et bâille
      const e = enveloppe(sp.t, sp.duree, 0.5);
      f.rx = 0.3 * e;
      f.sq = -0.18 * e;
      this.teteF.x = -0.25 * e;
      this.ouvre = lisse(0.6, 1.0, sp.t) * (1 - lisse(1.5, 1.9, sp.t));
      if (sp.t > 0.6 && sp.t < 1.6) this.clin = Math.max(this.clin, 0.0801);
    }
  }

  anim_meduse(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    const p = (ta / 1.9) % 1;
    // la cloche se contracte (et la pousse vers le haut), puis se relâche en redescendant doucement
    const contr = p < 0.28 ? lisse(0, 0.28, p) : 1 - lisse(0.28, 0.75, p);
    r.cloche.scale.set(1 - 0.13 * contr, 1 + 0.1 * contr, 1 - 0.13 * contr);
    const monte = p < 0.3 ? lisse(0, 0.3, p) : 1 - lisse(0.3, 1, p);
    f.y = 0.07 * monte - 0.03;
    f.rz = 0.07 * Math.sin(ta * 0.6);
    f.rx = 0.05 * Math.sin(ta * 0.45);
    f.souffle = 0;
    if (sp.t >= 0) f.ry = TAU * doux(sp.t / 1.4);
    r.etoile.rotation.y = ta * 0.9;
    r.etoile.position.y = 0.43 + 0.02 * Math.sin(ta * 2);
    const ouvert = lisse(0.3, 1, p);
    for (let k = 0; k < r.brins.length; k++) {
      const b = r.brins[k], ca = Math.cos(b.a), sa = Math.sin(b.a);
      for (let j = 0; j < b.n; j++) {
        const u = j / (b.n - 1);
        const onde = Math.sin(ta * 2.4 - j * 0.6 + k * 1.7) * 0.045 * (0.25 + u);
        const ray = b.r0 * (1 - 0.15 * contr) + u * (0.03 + 0.07 * ouvert) * (b.r0 > 0.2 ? 1 : 0.5);
        const s = b.s0 + (b.s1 - b.s0) * u;
        _m4.makeScale(s, s, s);
        _m4.setPosition(ca * ray - sa * onde, -0.09 - j * b.pas * (1 + 0.12 * contr - 0.08 * ouvert), sa * ray + ca * onde);
        r.perles.setMatrixAt(b.i0 + j, _m4);
      }
    }
    r.perles.instanceMatrix.needsUpdate = true;
  }

  anim_poulpe(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    const danse = sp.t >= 0 ? enveloppe(sp.t, sp.duree, 0.3) : 0;
    const amp = 1 + 0.8 * danse;
    for (let i = 0; i < r.tentacules.length; i++) {
      const m = r.tentacules[i];
      m.material.uniforms.uVague.value.set(0.06 * amp, 0.045 * amp, 2 * Math.PI / 0.45, -2.6 * ta + i * 0.785);
    }
    f.y = 0.025 * Math.sin(2.6 * ta) + 0.05 * danse * Math.abs(Math.sin(ta * 5));
    f.rz = 0.06 * Math.sin(1.3 * ta);
    f.ry = 0.15 * Math.sin(0.5 * ta) + (sp.t >= 0 ? TAU * doux(sp.t / sp.duree) : 0);
    if (this.chaque("bulles", 2.4, dt)) this.jet(r.haut, BULLES, 3, 0.35, 0.06);
  }

  anim_dragon(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    const bat = sp.t >= 0 ? 0.15 : 0.3;
    for (const a of r.ailes) a.pv.rotation.y = a.pv.userData.repos.y + a.sx * bat * Math.sin(2.4 * ta);
    r.queue.material.uniforms.uVague.value.set(0.06, 0.03, 8, -ta * 2);
    r.pointe.position.z = -0.09 + 0.06 * Math.sin(-ta * 2 + 8 * 0.6);
    f.rz = 0.03 * Math.sin(1.2 * ta);
    if (sp.t >= 0) {
      // il prend son souffle… et crache des braises
      const inspire = lisse(0, 0.6, sp.t) * (1 - lisse(0.65, 0.8, sp.t));
      const souffle = lisse(0.7, 0.85, sp.t) * (1 - lisse(1.5, 1.8, sp.t));
      this.teteF.x = -0.3 * inspire + 0.12 * souffle;
      f.sq = 0.18 * inspire;
      this.ouvre = souffle;
      if (souffle > 0.3 && this.chaque("feu", 0.04, dt)) this.jet(r.gueule, BRAISES, 3, 1.5, 0.075, [0.75, 0.15, 0.65]);
    }
  }

  anim_grenouille(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    f.souffle = 0.6;
    // la gorge qui gonfle : « croâ-croâ »
    const ph = ta % 3.3;
    const gonfle = ph < 0.9 ? cloche(ph / 0.42) + cloche((ph - 0.48) / 0.42) : 0;
    r.gorge.scale.copy(r.gorge.userData.s).multiplyScalar(1 + 0.9 * gonfle);
    let tire = 0, pli = 0;
    if (sp.t >= 0 && sp.n % 3 === 0) {
      // la langue qui attrape une mouche
      const l = cloche(sp.t / 0.5);
      r.langue.visible = l > 0.01;
      r.langue.scale.z = 0.001 + 0.42 * l;
    } else {
      r.langue.visible = false;
      if (sp.t >= 0) {
        // un grand saut : accroupie, détente, pattes arrière tendues en l'air
        pli = sp.t < 0.25 ? lisse(0, 0.22, sp.t) : 0;
        f.sq = -0.35 * pli;
        if (sp.t >= 0.25 && !sp.fait) {
          sp.fait = 1;
          this.sauter(0.95);
        }
      }
    }
    if (this.y > 0.01) tire = Math.min(1, this.y * 8);
    for (const p of r.pattesAr) {
      p.pv.rotation.x = -1.0 * tire + 0.25 * pli;
      p.pv.position.z = p.pv.userData.pos.z - 0.06 * tire;
    }
    f.rx = -0.25 * tire;
  }

  anim_ecureuil(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // il grignote son gland par petites rafales, et la queue fouette
    const ph = ta % 3.4;
    const grignote = ph < 1.4 ? enveloppe(ph, 1.4, 0.2) : 0;
    this.teteF.x = 0.06 * Math.sin(ta * 27) * grignote + 0.12 * grignote;
    r.gland.position.y = r.gland.userData.pos.y + 0.08 * grignote;
    r.gland.position.z = r.gland.userData.pos.z + 0.02 * grignote;
    r.gland.rotation.z = 0.15 * Math.sin(ta * 13) * grignote;
    const fouet = sp.t >= 0 ? 2.5 * cloche(sp.t / sp.duree) : 0;
    r.queue.material.uniforms.uVague.value.set(0.025 + 0.05 * fouet, 0.015, 7, -ta * (3 + 6 * fouet));
    if (sp.t >= 0 && !sp.fait) {
      sp.fait = 1;
      this.sauter(0.5);
    }
    f.rz = 0.02 * Math.sin(ta * 7) * (1 - grignote);
  }

  anim_pingouin(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // il se dandine par moments, en balançant son corps d'un pied sur l'autre
    const cyc = ta % 5;
    const e = cyc < 3.2 ? enveloppe(cyc, 3.2, 0.4) : 0;
    const w = 7, s = Math.sin(w * ta);
    f.rz = 0.14 * s * e;
    f.x = 0.03 * s * e;
    f.y = 0.016 * Math.abs(s) * e;
    r.pieds[0].pv.position.y = r.pieds[0].pv.userData.pos.y + 0.035 * Math.max(0, -s) * e;
    r.pieds[1].pv.position.y = r.pieds[1].pv.userData.pos.y + 0.035 * Math.max(0, s) * e;
    const agite = sp.t >= 0 ? enveloppe(sp.t, sp.duree, 0.15) : 0;
    if (sp.t >= 0 && !sp.fait) {
      sp.fait = 1;
      this.sauter(0.45);
    }
    for (const a of r.ailerons) a.pv.rotation.z = a.pv.userData.repos.z + a.sx * (0.12 * e * (0.5 + 0.5 * Math.sin(2 * w * ta)) + agite * (0.35 + 0.5 * Math.abs(Math.sin(ta * 20))));
  }

  anim_lapin(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // le nez qui frétille
    if (r.nez) r.nez.scale.y = 0.018 * (1 + (ta % 2.2 < 0.6 ? 0.3 * Math.sin(ta * 30) : 0));
    // trois petits sauts à la suite
    if (sp.t >= 0) {
      const k = Math.floor(sp.t / 0.42);
      if (k < 3 && sp.fait <= k && this.y <= 0.001) {
        sp.fait = k + 1;
        this.sauter(0.55);
      }
    }
    f.rx = Math.max(-0.15, Math.min(0.15, -this.vy * 0.06));
    if (r.trefle) r.trefle.rotation.y = Math.sin(ta * 0.9) * 0.35;
  }

  anim_dino(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // il piétine lourdement par moments (boum, boum), la queue qui balance
    const cyc = ta % 6;
    const e = sp.t >= 0 ? 0 : cyc < 3.6 ? enveloppe(cyc, 3.6, 0.4) : 0;
    const w = 4.2;
    for (const j of r.jambes) {
      const s = Math.sin(w * ta + j.ph);
      j.pv.position.y = j.pv.userData.pos.y + 0.05 * Math.max(0, s) * e;
      j.pv.rotation.x = -0.25 * Math.max(0, s) * e;
    }
    const s = Math.sin(w * ta);
    if (e > 0.5 && Math.sign(s) !== (this.signe ?? 0) && dt > 0) this.sv -= 0.7;
    this.signe = Math.sign(s);
    f.rz = 0.06 * s * e;
    f.y = -0.012 * Math.abs(Math.cos(w * ta)) * e;
    this.teteF.x = 0.05 * Math.sin(2 * w * ta) * e;
    r.queue.material.uniforms.uVague.value.set(0.05 + 0.03 * e, 0.02, 7, -ta * (1.6 + 2 * e));
    if (sp.t >= 0) {
      // un rugissement !
      const g = enveloppe(sp.t, sp.duree, 0.3);
      this.teteF.x = -0.35 * g;
      this.ouvre = g;
      f.rz = 0.025 * Math.sin(ta * 44) * g;
      f.sq = 0.1 * g;
    }
  }

  anim_licorne(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // elle caracole sur place (comme un cheval à bascule), crinière au vent
    const cyc = ta % 5.5;
    const e = sp.t >= 0 ? 0 : cyc < 3 ? enveloppe(cyc, 3, 0.4) : 0;
    const w = 5.5;
    for (const j of r.jambes) j.pv.rotation.x = (j.avant ? 0.55 * Math.sin(w * ta) : 0.35 * Math.sin(w * ta + Math.PI)) * e;
    f.rx = 0.07 * Math.sin(w * ta + 0.8) * e;
    f.y = 0.035 * Math.max(0, Math.sin(w * ta)) * e;
    this.teteF.x = 0.08 * Math.sin(w * ta + 1.6) * e;
    r.criniere.forEach((m, i) => (m.rotation.z = 0.12 * Math.sin(ta * 3 + i)));
    if (this.chaque("corne", 1.7, dt)) this.jet(r.corne, ARC_EN_CIEL, 2, 0.3, 0.05);
    if (sp.t >= 0) {
      // elle se cabre, et sa corne lance une gerbe d'arc-en-ciel
      const g = enveloppe(sp.t, sp.duree, 0.35);
      f.rx = -0.45 * g;
      f.y = 0.09 * g;
      for (const j of r.jambes) if (j.avant) j.pv.rotation.x = (-0.9 + 0.4 * Math.sin(ta * 14)) * g;
      if (sp.t > 0.5 && !sp.fait) {
        sp.fait = 1;
        this.jet(r.corne, ARC_EN_CIEL, 14, 0.8, 0.06);
      }
    }
  }

  anim_baleine(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // elle nage dans l'air : le corps ondule, la queue bat de haut en bas
    const w = 1.7;
    f.rx = 0.1 * Math.sin(w * ta);
    r.queue.rotation.x = 0.5 * Math.sin(w * ta - 1.3);
    for (const n of r.nageoires) n.pv.rotation.z = n.pv.userData.repos.z + n.sx * 0.28 * Math.sin(w * ta - 0.5);
    f.y = 0.04 * Math.sin(w * ta + 0.8);
    f.ry = 0.15 * Math.sin(0.3 * ta);
    if (this.chaque("jet", 4.6, dt)) this.jet(r.event, ["#BFF3FF", "#FFFFFF", "#7FD8FF"], 14, 0.9, 0.06, [0, 1, 0.1]);
    if (sp.t >= 0) f.rz = TAU * doux(sp.t / sp.duree);
  }

  anim_paon(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // la roue s'ouvre et se referme à moitié, et frémit quand elle est grande ouverte
    let ouv = 0.5 + 0.5 * (0.5 + 0.5 * Math.sin(ta * 0.9 + 0.3));
    let fremit = lisse(0.9, 1, ouv) * 0.02;
    if (sp.t >= 0) {
      const g = enveloppe(sp.t, sp.duree, 0.3);
      ouv = ouv + (1 - ouv) * g;
      fremit = Math.max(fremit, 0.05 * g);
      if (!sp.fait) {
        sp.fait = 1;
        this.cibleGlow += 0.3;
        this.minuteurs.glow = 1.2;
      }
    }
    this.majRoue(ouv, fremit);
    if (this.minuteurs.glow > 0) {
      this.minuteurs.glow -= dt;
      if (this.minuteurs.glow <= 0) this.cibleGlow -= 0.3;
    }
    if (sp.t > 0.3 && this.chaque("aurore", 0.12, dt)) this.jet(this.r.roue, ["#5EEAD4", "#C084FC", "#A5F3FC", "#FFFFFF"], 2, 0.4, 0.05);
    // la tête avance et recule comme un pigeon qui marche
    this.tete.position.z = 0.1 + 0.03 * Math.sin(ta * 5);
    f.ry = 0.3 * Math.sin(ta * 0.45);
  }

  anim_phenix(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // il bat des ailes pour rester en l'air, des braises montent de son corps
    const w = 5.2, bat = Math.sin(w * ta);
    for (const a of r.ailes) {
      a.pv.rotation.z = a.sx * (0.4 * bat + 0.05);
      a.pv.rotation.y = a.pv.userData.repos.y + a.sx * 0.2 * Math.cos(w * ta);
    }
    f.y = -0.04 * bat + 0.03 * Math.sin(1.1 * ta);
    f.rx = 0.05 * Math.cos(w * ta);
    r.queue.rotation.x = 0.2 + 0.18 * Math.sin(w * ta - 1.5);
    if (this.chaque("braise", 0.14, dt)) this.jet(this.corps, BRAISES, 1, 0.35, 0.05);
    if (sp.t >= 0) {
      // il s'embrase et tourne sur lui-même
      f.ry = TAU * doux(sp.t / sp.duree);
      if (!sp.fait) {
        sp.fait = 1;
        this.jet(this.corps, BRAISES, 26, 1.3, 0.07);
      }
    }
  }

  anim_serpent(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // une vague qui court tout le long du corps, de la tête vers la queue
    const turbo = sp.t >= 0 ? enveloppe(sp.t, sp.duree, 0.4) : 0;
    this.phase = (this.phase ?? 0) - dt * 2.6 * (1 + 1.3 * turbo);
    const ay = 0.1, az = 0.08, k = TAU / 0.85, ph = this.phase;
    r.corpsS.material.uniforms.uVague.value.set(ay, az, k, ph);
    const xh = -0.5, xt = 0.7;
    r.cou.position.set(r.cou.userData.pos.x, r.cou.userData.pos.y + ay * Math.sin(k * xh + ph) * 0.9, r.cou.userData.pos.z + az * Math.cos(k * xh + ph) * 0.9);
    this.teteF.x = -0.25 * Math.cos(k * xh + ph);
    r.bout.position.set(r.bout.userData.pos.x, r.bout.userData.pos.y + ay * Math.sin(k * xt + ph), r.bout.userData.pos.z + az * Math.cos(k * xt + ph));
    r.bout.rotation.z = Math.atan(ay * k * Math.cos(k * xt + ph));
    for (const m of r.moustaches) m.pv.rotation.set(0.15 * Math.sin(ta * 2 + m.sx), 0, 0.2 * Math.sin(ta * 1.6) * m.sx);
    f.y = 0.04 * Math.sin(1.1 * ta);
    f.x = 0.03 * Math.sin(0.55 * ta);
    f.rz = 0.05 * Math.sin(0.7 * ta);
    if (turbo > 0.5 && this.chaque("cosmos", 0.09, dt)) this.jet(this.corps, COSMOS, 2, 0.5, 0.05);
  }

  anim_axolotl(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // il nage en se tortillant, ses branchies frémissent
    const joie = sp.t >= 0 ? enveloppe(sp.t, sp.duree, 0.3) : 0;
    this.phase = (this.phase ?? 0) + dt * 3.2 * (1 + 1.2 * joie);
    const ph = this.phase, a = 1 + 0.6 * joie;
    r.queue.rotation.y = 0.45 * a * Math.sin(ph - 1.0);
    f.ry = 0.1 * a * Math.sin(ph);
    r.cou.rotation.y = -0.15 * a * Math.sin(ph + 0.4);
    f.y = 0.05 + 0.03 * Math.sin(1.4 * ta);
    for (const b of r.branchies) b.pv.rotation.set(0.12 * Math.sin(ta * 6 + b.i), 0, b.sx * (0.15 * Math.sin(ta * 7 + b.i * 1.3) + 0.2 * joie));
    for (const p of r.pattes) p.pv.rotation.x = 0.5 * Math.sin(ph * 1.5 + (p.sx * p.sz > 0 ? 0 : Math.PI));
    if (joie > 0.3 && this.chaque("prisme", 0.08, dt)) this.jet(this.tete, ARC_EN_CIEL, 2, 0.5, 0.05);
  }

  anim_raie(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // les ailes ondulent comme une vague, elle glisse en huit en s'inclinant
    const w = 2.3;
    r.raie.uniforms.uAile.value.set(0.36, 3.2, w * ta);
    f.y = 0.035 * Math.sin(w * ta + 1.2);
    f.rz = 0.18 * Math.sin(0.5 * ta);
    f.ry = 0.25 * Math.sin(0.5 * ta + 0.8);
    f.x = 0.05 * Math.sin(0.5 * ta);
    r.queue.rotation.y = 0.25 * Math.sin(1.4 * ta);
    r.queue.rotation.x = 0.15 * Math.sin(w * ta - 1.0);
    if (sp.t >= 0) {
      // un tonneau, dans une pluie d'étoiles
      f.rz += TAU * doux(sp.t / sp.duree);
      if (this.chaque("cosmos", 0.08, dt)) this.jet(this.corps, COSMOS, 2, 0.4, 0.05);
    }
  }

  anim_luciole(ta, dt) {
    const f = this.f, sp = this.sp, r = this.r;
    // elle vole sur place, ailes qui vrombissent, la lanterne qui respire
    f.y = 0.05 * Math.sin(1.6 * ta);
    f.x = 0.05 * Math.sin(0.8 * ta);
    f.rz = 0.08 * Math.sin(0.8 * ta + 0.5);
    f.souffle = 0.5;
    for (const a of r.ailes) a.pv.rotation.z = a.pv.userData.repos.z + a.sx * 0.35 * Math.sin(ta * 38 + a.ph);
    const g = 0.5 + 0.5 * Math.sin(2.3 * ta);
    r.lanterne.material.uniforms.uEmissive.value = 0.7 + 0.9 * g;
    r.halo.material.uniforms.uEclat.value = 0.55 + 0.45 * g;
    for (const a of r.antennes) a.pv.rotation.z = a.sx * 0.1 * Math.sin(2 * ta + a.sx);
    if (sp.t >= 0) {
      // un looping, avec une traînée dorée
      f.rx = -TAU * doux(sp.t / sp.duree);
      f.y += 0.12 * cloche(sp.t / sp.duree);
      if (this.chaque("trainee", 0.05, dt)) this.jet(r.lanterne, OR, 2, 0.2, 0.06);
    } else if (this.chaque("poussiere", 0.6, dt)) this.jet(r.lanterne, OR, 1, 0.2, 0.045);
  }

  maj(t, dt) {
    const vit = this.vitesse;
    this.ta += dt * vit;
    const ta = this.ta;
    if (this.vy !== 0 || this.y > 0) {
      this.vy -= 9 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        const choc = Math.min(5, Math.abs(this.vy) * 1.6);
        this.sv -= choc;
        // les oreilles rebondissent à l'atterrissage
        for (const or of this.oreilles) or.v -= choc * 1.6 * or.amp * or.sens;
        this.vy = 0;
      }
    }
    this.sv += (-140 * this.s - 9 * this.sv) * dt;
    this.s += this.sv * dt;

    // le tour du moment
    const sp = this.sp;
    if (dt > 0) {
      if (sp.t >= 0) {
        sp.t += dt * vit;
        if (sp.t >= sp.duree) sp.t = -1;
      } else if (this.regardLibre && this.calme) {
        sp.prochain -= dt;
        if (sp.prochain <= 0) {
          sp.n++;
          sp.t = 0;
          sp.fait = 0;
          sp.duree = typeof this.spDuree === "function" ? this.spDuree(sp.n) : this.spDuree;
          sp.prochain = this.spTous[0] + Math.random() * (this.spTous[1] - this.spTous[0]);
        }
      }
    }
    const f = this.f;
    f.x = f.y = f.z = f.rx = f.ry = f.rz = f.sq = 0;
    f.souffle = 1;
    this.teteF.set(0, 0, 0);
    this.ouvre = 0;
    this.anim(ta, dt);

    const souffle = Math.sin(ta * 2.1) * 0.018 * f.souffle * (this.humeur === "endormi" ? 1.8 : 1);
    const sq = this.s + f.sq;
    const sy = 1 + sq * 0.22 + souffle, sxz = 1 - sq * 0.11 - souffle * 0.5;
    this.corps.scale.set(sxz, sy, sxz);
    const dort = this.humeur === "endormi" ? (this.flotte ? -0.12 : 0) : 0;
    this.corps.position.set(f.x, (this.flotte ? this.hauteur : this.hauteur * sy) + this.y + f.y + dort, f.z);
    this.corps.rotation.set(this.basePitch + f.rx, this.baseYaw + f.ry, f.rz);
    const grav = -0.3 - this.vy * 0.1, remous = 0.08 + Math.min(Math.abs(this.sv) * 0.04, 0.4);
    for (const m of this.mats) {
      m.uniforms.uGravity.value.y = grav;
      m.uniforms.uWobble.value = remous;
    }
    // l'ombre rétrécit quand la créature saute (ou plane)
    const haut = this.y + Math.max(0, f.y) + (this.flotte ? 0.25 : 0);
    const o = Math.max(0.3, 1 - haut * 1.8);
    this.ombre.position.set(f.x, 0.004, f.z);
    this.ombre.scale.set(this.ombreT[0] * o, this.ombreT[1] * o, 1);
    this.ombre.material.uniforms.uForce.value = 0.42 * o;
    const vif = Math.min(1, dt * this.regardVif);
    this.yaw += (this.cibleYaw - this.yaw) * vif;
    this.pitch += (this.ciblePitch - this.pitch) * vif;
    this.pivot.rotation.set(this.pitch * 0.5, this.yaw * 0.6, 0);
    // la tête suit davantage le regard et s'incline par curiosité, comme un chiot
    this.prochainPenche -= dt;
    if (this.prochainPenche < 0) {
      this.ciblePenche = Math.random() < 0.45 ? 0 : (Math.random() < 0.5 ? -1 : 1) * (0.18 + Math.random() * 0.14);
      this.prochainPenche = 2 + Math.random() * 4;
    }
    this.penche += (this.ciblePenche - this.penche) * Math.min(1, dt * 4);
    const tr = this.teteRepos, ta2 = this.teteAmp, tf = this.teteF;
    const triste = this.humeur === "triste" || this.humeur === "endormi" ? 0.22 : 0;
    this.tete.rotation.set(tr.x + (this.pitch * 0.6 - this.s * 0.3) * ta2 + tf.x + triste, tr.y + this.yaw * 0.5 * ta2 + tf.y, tr.z + this.penche * ta2 + tf.z);
    this.glow.value += (this.cibleGlow - this.glow.value) * Math.min(1, dt * 2.5);
    // la bouche grande ouverte
    const bo = this.r.ouverte;
    if (bo) {
      bo.visible = this.ouvre > 0.03;
      if (bo.visible) bo.scale.set(bo.userData.base[0] * this.ouvre, bo.userData.base[1] * this.ouvre, bo.userData.base[2]);
    }

    // clignement des yeux
    if (dt > 0) {
      this.cligne -= dt;
      if (this.cligne < 0) {
        this.clin = 0.16;
        this.cligne = 2.2 + Math.random() * 3.8;
      }
      if (this.clin > 0) this.clin = Math.max(0, this.clin - dt);
    }
    const ferme = this.clin > 0 ? Math.max(0.08, Math.abs(this.clin - 0.08) / 0.08) : 1;
    for (const e of this.yeuxMesh) e.scale.y = ferme;
    for (const r of this.reflets) r.visible = ferme > 0.5;
    // sans doigt ni souris dessus : elle regarde autour d'elle
    if (this.regardLibre && dt > 0) {
      this.prochainRegard -= dt;
      if (this.prochainRegard < 0) {
        const centre = Math.random() < 0.35;
        this.cibleYaw = centre ? 0 : (Math.random() * 2 - 1) * 0.45;
        this.ciblePitch = centre ? 0 : (Math.random() * 2 - 1) * 0.12;
        this.prochainRegard = (this.regardVif > 8 ? 0.8 : 1.8) + Math.random() * 3;
      }
    }

    // oreilles qui frémissent de temps en temps (et tombent quand elle est triste)
    for (const or of this.oreilles) {
      or.t -= dt;
      if (or.t < 0) {
        or.v += (Math.random() < 0.5 ? -1 : 1) * 9 * or.amp;
        or.t = 1.5 + Math.random() * 4;
      }
      or.v += (-90 * or.x - 7 * or.v) * dt;
      or.x += or.v * dt;
      const r = or.pv.userData.repos;
      if (or.axe === "z") or.pv.rotation.z = r.z + (or.x - triste * 1.5) * or.sens;
      else if (or.axe === "y") or.pv.rotation.y = r.y + or.x;
      else or.pv.rotation.x = r.x + or.x;
    }
    // la queue remue
    if (this.queue) {
      const q = this.queue, r = q.pv.userData.repos;
      const agite = Math.sin(ta * q.vitesse + this.graine) * q.amp * (0.55 + Math.min(1, Math.abs(this.sv) * 0.3));
      if (q.axe === "y") q.pv.rotation.y = r.y + agite;
      else q.pv.rotation.z = r.z + agite;
    }
  }

  // centre de la créature (là d'où partent les étincelles), en coordonnées monde
  centre(v) {
    return this.corps.localToWorld(v.copy(this.centreLocal));
  }
}
