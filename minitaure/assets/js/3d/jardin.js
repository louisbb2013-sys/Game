/* Minitaure — le jardin lunaire en 3D (accueil), au coucher du soleil.
   Prairie fleurie, buissons et arbres feuillus, champignons, lucioles et cinq créatures-animaux
   cachées derrière les buissons (on ne voit que leurs oreilles). La luciole guidée par le pointeur
   ou le doigt les fait sortir. Sans WebGL 2, la version 2D reste en place. */
import { THREE, PALETTE, GLSL, lumieres, Creature, solide, matierePoints, nuageDePoints, Etincelles, webgl2Dispo } from "./commun.js";

const racine = document.querySelector(".jardin");
const api = window.MinitaureJardin;
const economie = navigator.connection && navigator.connection.saveData;
if (racine && api && webgl2Dispo() && !economie) {
  // on laisse d'abord le texte s'animer : la 3D démarre juste après la première image
  requestAnimationFrame(() => setTimeout(lancer3D, 250));
}

function lancer3D() {
  try {
    demarrer();
  } catch (e) {
    console.warn("Jardin 3D indisponible :", e);
    api.passer2D?.();
  }
}

/* ---------- Feuillage « touffu » : des milliers de petites feuilles tournées vers la caméra ---------- */
const FEUILLES_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec3 aNrm;
attribute vec4 aVar;
attribute vec3 aCol;
uniform float uTime;
uniform float uWind;
uniform vec4 uSecousse[5];
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCol;
varying float vAO;
varying float vDepth;
void main() {
  vUv = position.xy * 2.0;
  vec3 c = aPos;
  float vent = sin(uTime * 1.3 + c.x * 1.7 + c.y * 3.0) * 0.5 + sin(uTime * 2.1 + c.z * 2.3) * 0.5;
  c += aNrm * vent * 0.012 * uWind;
  for (int i = 0; i < 5; i++) {
    vec4 s = uSecousse[i];
    float w = s.w * (1.0 - smoothstep(0.0, s.z, distance(c.xz, s.xy)));
    c += vec3(sin(uTime * 31.0 + c.y * 40.0), 0.0, cos(uTime * 27.0 + c.x * 40.0)) * 0.035 * w;
  }
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float co = cos(aVar.y), si = sin(aVar.y);
  mv.xy += mat2(co, -si, si, co) * position.xy * aVar.x;
  vW = c;
  vN = aNrm;
  vCol = aCol;
  vAO = aVar.w;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FEUILLES_FS = /* glsl */ `
${GLSL.LUMIERE}
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying vec3 vCol;
varying float vAO;
varying float vDepth;
void main() {
  vec2 p = vUv;
  float d = length(vec2(p.x * 1.55, p.y - 0.2 * p.x * p.x));
  float a = 1.0 - smoothstep(0.8, 0.98, d);
  if (a < 0.05) discard;
  vec3 N = normalize(vN);
  vec3 base = vCol * (0.88 + 0.24 * (p.y * 0.5 + 0.5));
  vec3 col = eclairer(base, N, vW, 0.55) * mix(0.5, 1.0, vAO);
  // lumière qui traverse les feuilles à contre-jour
  col += base * uSunColor * pow(max(dot(-N, uSunDir), 0.0), 2.0) * 0.3;
  col = mix(uFogColor, col, brume(vDepth));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

/* ---------- Fleurs : petits disques à pétales, de toutes les couleurs ---------- */
const FLEURS_VS = /* glsl */ `
attribute vec3 aPos;
attribute vec4 aVar;
attribute vec3 aCol;
uniform float uTime;
uniform float uWind;
varying vec2 vUv;
varying vec3 vCol;
varying float vPet;
varying vec3 vW;
varying float vDepth;
void main() {
  vUv = position.xy * 2.0;
  vec3 c = aPos;
  float t = uTime * 1.1;
  float vent = sin(t + c.x * 0.6 + c.z * 0.45) * 0.55 + sin(t * 1.9 + c.x * 1.7 - c.z) * 0.22;
  c.xz += vec2(0.5, 0.22) * vent * uWind * c.y * 0.6;
  vW = c;
  vec4 mv = viewMatrix * vec4(c, 1.0);
  float co = cos(aVar.y), si = sin(aVar.y);
  mv.xy += mat2(co, -si, si, co) * position.xy * aVar.x;
  vCol = aCol;
  vPet = aVar.z;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const FLEURS_FS = /* glsl */ `
${GLSL.LUMIERE}
varying vec2 vUv;
varying vec3 vCol;
varying float vPet;
varying vec3 vW;
varying float vDepth;
void main() {
  vec2 p = vUv;
  float r = length(p);
  float an = atan(p.y, p.x);
  float lobe = 0.6 + 0.4 * pow(abs(cos(an * vPet * 0.5)), 0.7);
  float a = 1.0 - smoothstep(lobe - 0.1, lobe, r);
  if (a < 0.05) discard;
  vec3 c = vCol * (0.78 + 0.3 * r);
  float coeur = 1.0 - smoothstep(0.2, 0.27, r);
  c = mix(c, vec3(1.0, 0.72, 0.12), coeur);
  vec3 lum = mix(uGround, uSky, 0.75) + uSunColor * 0.8;
  vec3 Ld = uLanternPos - vW;
  lum += uLanternColor * uLantern / (1.0 + dot(Ld, Ld) * 2.0) * 0.6;
  vec3 col = c * lum;
  col = mix(uFogColor, col, brume(vDepth));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  gl_FragColor = vec4(gl_FragColor.rgb * a, a);
}
`;

function demarrer() {
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tactile = matchMedia("(pointer: coarse)").matches;
  const forcerQualite = /qualite=haute/.test(location.search);
  const IDS = ["minotaure", "gribou", "bloop", "noki", "pipo"];

  const canvas = document.createElement("canvas");
  canvas.className = "jardin__gl";
  canvas.setAttribute("aria-hidden", "true");
  racine.querySelector(".jardin__texte").before(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  let dpr = Math.min(window.devicePixelRatio || 1, tactile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 140);
  // lumière du soir : soleil doré de côté, ciel violet, rebond vert de la prairie, contre-jour rose
  const L = lumieres();
  L.uSunDir.value.set(-0.55, 0.55, 0.62).normalize();
  L.uSunColor.value.set("#FFDDB0").multiplyScalar(0.9);
  L.uSky.value.set("#8D86DA").multiplyScalar(0.5);
  L.uGround.value.set("#5F7A4A").multiplyScalar(0.5);
  L.uRim.value.set("#FF9C80").multiplyScalar(0.7);
  L.uFogColor.value.set("#EFA58E");
  L.uFogDensity.value = 0.032;
  L.uLanternColor.value.set("#FFE89A");
  L.uLantern.value = 1.6;

  const etroit = () => racine.clientWidth / Math.max(1, racine.clientHeight) < 0.9;
  const petitEcran = racine.clientWidth < 700 || tactile;
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), tmp = new THREE.Vector3();

  /* ---------- Sol ---------- */
  const sol = new THREE.Mesh(
    new THREE.CircleGeometry(34, 72),
    new THREE.ShaderMaterial({
      uniforms: { ...L },
      vertexShader: /* glsl */ `
        varying vec3 vW; varying float vDepth;
        void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `
        ${GLSL.LUMIERE}
        ${GLSL.HASH}
        varying vec3 vW; varying float vDepth;
        void main(){
          float n = fbm(vW.xz * 0.35);
          vec3 base = mix(vec3(0.03, 0.15, 0.025), vec3(0.07, 0.27, 0.035), n);
          base = mix(base, vec3(0.13, 0.36, 0.04), smoothstep(0.55, 0.8, fbm(vW.xz * 0.9 + 3.0)) * 0.6);
          vec3 col = eclairer(base, vec3(0.0, 1.0, 0.0), vW, 0.3);
          float fa = brume(vDepth);
          float bord = smoothstep(34.0, 20.0, length(vW.xz - vec2(0.0, -8.0)));
          col = mix(uFogColor, col, fa);
          gl_FragColor = vec4(col, fa * bord);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
    })
  );
  sol.rotation.x = -Math.PI / 2;
  sol.position.z = -8;
  sol.renderOrder = 1;
  scene.add(sol);

  /* ---------- Collines vertes au loin, dans la brume dorée ---------- */
  const collines = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 32, 16), solide("#46B856", L, { fondu: true, wrap: 0.9, brume: 0.015 }), 6);
  [[-20, -30, 13, 3.4], [-6, -34, 12, 2.8], [8, -31, 14, 3.8], [22, -33, 12, 3], [0, -42, 24, 4.6], [-14, -24, 7, 1.8]].forEach(([x, z, w, h], i) => {
    collines.setMatrixAt(i, m4.compose(v3.set(x, -0.6, z), q4.identity(), s3.set(w, h, 6)));
  });
  collines.renderOrder = 0;
  scene.add(collines);

  /* ---------- Feuillage partagé : buissons + arbres (un seul appel de dessin) ---------- */
  const MAX_FEUILLES = petitEcran ? 11000 : 18000;
  const quad = new THREE.PlaneGeometry(1, 1);
  const gF = new THREE.InstancedBufferGeometry();
  gF.index = quad.index;
  gF.setAttribute("position", quad.attributes.position);
  const fPos = new Float32Array(MAX_FEUILLES * 3), fNrm = new Float32Array(MAX_FEUILLES * 3), fVar = new Float32Array(MAX_FEUILLES * 4), fCol = new Float32Array(MAX_FEUILLES * 3);
  const attrsF = [["aPos", fPos, 3], ["aNrm", fNrm, 3], ["aVar", fVar, 4], ["aCol", fCol, 3]].map(([n, a, k]) => {
    const at = new THREE.InstancedBufferAttribute(a, k);
    at.setUsage(THREE.DynamicDrawUsage);
    gF.setAttribute(n, at);
    return at;
  });
  gF.instanceCount = 0;
  const secousses = Array.from({ length: 5 }, () => new THREE.Vector4(0, 0, 0.01, 0));
  const feuillage = new THREE.Mesh(
    gF,
    new THREE.ShaderMaterial({
      uniforms: { ...L, uWind: { value: reduit ? 0 : 1 }, uSecousse: { value: secousses }, uFogDensity: { value: 0.018 } },
      vertexShader: FEUILLES_VS,
      fragmentShader: FEUILLES_FS,
      alphaToCoverage: true,
    })
  );
  feuillage.frustumCulled = false;
  scene.add(feuillage);
  let nF = 0;
  const cA = new THREE.Color(), cB = new THREE.Color(), cM = new THREE.Color();
  // une touffe = plusieurs sphères [x, y, z, r] couvertes de feuilles
  function touffe(spheres, coul1, coul2, taille, densite) {
    cA.set(coul1);
    cB.set(coul2);
    spheres.forEach(([cx, cy, cz, r], k) => {
      const nb = Math.round(densite * r * r * (petitEcran ? 0.6 : 1));
      for (let i = 0; i < nb && nF < MAX_FEUILLES; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, sq = Math.sqrt(1 - u * u);
        const dx = sq * Math.cos(th), dy = u, dz = sq * Math.sin(th);
        const rr = r * (0.82 + Math.random() * 0.2);
        const x = cx + dx * rr, y = cy + dy * rr, z = cz + dz * rr;
        // pas de feuilles cachées à l'intérieur d'une autre sphère
        let dedans = false;
        for (let j = 0; j < spheres.length; j++) {
          if (j === k) continue;
          const [ox, oy, oz, or] = spheres[j];
          if ((x - ox) ** 2 + (y - oy) ** 2 + (z - oz) ** 2 < (or * 0.86) ** 2) { dedans = true; break; }
        }
        if (dedans || y < 0.01) continue;
        fPos.set([x, y, z], nF * 3);
        fNrm.set([dx, dy, dz], nF * 3);
        fVar.set([taille * (0.7 + Math.random() * 0.6), Math.random() * 6.283, 0, 0.55 + 0.45 * (dy * 0.5 + 0.5)], nF * 4);
        cM.copy(cA).lerp(cB, Math.random());
        fCol.set([cM.r, cM.g, cM.b], nF * 3);
        nF++;
      }
    });
  }
  function finFeuillage() {
    gF.instanceCount = nF;
    attrsF.forEach((a) => (a.needsUpdate = true));
  }

  /* ---------- Arbres feuillus (dont deux en fleurs) ---------- */
  const ARBRES = [
    [-9.5, -10, 3.1, "#22A045", "#6BD65A"], [-6, -13, 3.8, "#1F9142", "#5CCB50"], [-10.5, -15, 3.4, "#FF7EB6", "#FFC2DE"],
    [-3.2, -16, 2.6, "#2AA24A", "#78D65F"], [2.5, -18, 2.4, "#239A47", "#66CF57"], [8.8, -11, 3.2, "#22A346", "#6AD65C"],
    [11, -15, 3.6, "#FF8CC2", "#FFCFE6"], [5.2, -15.5, 2.8, "#1E8F40", "#57C34E"], [15, -19, 3.6, "#24A048", "#62CF55"],
  ];
  const troncs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.14, 1, 8), solide("#5A3A22", L, { wrap: 0.5, brume: 0.018 }), ARBRES.length);
  const geoTronc = troncs.geometry;
  geoTronc.translate(0, 0.5, 0);
  const arbresFeuilles = () => {
    ARBRES.forEach(([x, z, h, c1, c2]) => {
      const r = h * 0.32, cy = h * 0.72;
      touffe([[x, cy, z, r], [x - r * 0.75, cy - r * 0.3, z + 0.1, r * 0.75], [x + r * 0.78, cy - r * 0.25, z - 0.1, r * 0.72], [x + r * 0.1, cy + r * 0.6, z - 0.2, r * 0.68]], c1, c2, 0.34, 210);
    });
  };
  ARBRES.forEach(([x, z, h], i) => troncs.setMatrixAt(i, m4.compose(v3.set(x, 0, z), q4.identity(), s3.set(1, h * 0.62, 1))));
  scene.add(troncs);

  /* ---------- Herbe (+ tiges des fleurs) ---------- */
  const nbHerbe = petitEcran ? 11000 : 24000;
  const nbFleurs = petitEcran ? 520 : 1100;
  const nbLames = nbHerbe + nbFleurs;
  const lame = new THREE.PlaneGeometry(1, 1, 1, 5);
  lame.translate(0, 0.5, 0);
  const gHerbe = new THREE.InstancedBufferGeometry();
  gHerbe.index = lame.index;
  gHerbe.setAttribute("position", lame.attributes.position);
  const lames = new Float32Array(nbLames * 4), hasard = new Float32Array(nbLames), hauteurs = new Float32Array(nbLames);
  for (let i = 0; i < nbHerbe; i++) {
    const pres = i < nbHerbe * 0.66;
    const x = pres ? (Math.random() * 2 - 1) * 7.5 : (Math.random() * 2 - 1) * 14;
    const z = pres ? -3.6 + Math.random() * 6.9 : -15 + Math.random() * 11.4;
    hauteurs[i] = pres ? 0.07 + Math.random() * 0.13 : 0.1 + Math.random() * 0.18;
    lames.set([x, z, Math.random() * Math.PI, hauteurs[i]], i * 4);
    hasard[i] = Math.random();
  }

  /* ---------- Fleurs ---------- */
  const COULEURS_FLEURS = ["#FF4F9A", "#FFD23F", "#FF7B2E", "#FFFFFF", "#A06BFF", "#4FC3F7", "#FF5A5A", "#FFB3D9"];
  const gFl = new THREE.InstancedBufferGeometry();
  gFl.index = quad.index;
  gFl.setAttribute("position", quad.attributes.position);
  const flPos = new Float32Array(nbFleurs * 3), flVar = new Float32Array(nbFleurs * 4), flCol = new Float32Array(nbFleurs * 3), flTaille = new Float32Array(nbFleurs);
  const taches = Array.from({ length: 18 }, (_, k) => ({
    x: (Math.random() * 2 - 1) * (k < 13 ? 6.5 : 12),
    z: k < 13 ? -4 + Math.random() * 7 : -13 + Math.random() * 8,
    s: 0.5 + Math.random() * 0.8,
    c: COULEURS_FLEURS[k % COULEURS_FLEURS.length],
  }));
  for (let i = 0; i < nbFleurs; i++) {
    let x, z, coul;
    if (Math.random() < 0.8) {
      const t = taches[(Math.random() * taches.length) | 0];
      const a = Math.random() * 6.283, r = Math.sqrt(-2 * Math.log(Math.random() + 1e-6)) * t.s * 0.5;
      x = t.x + Math.cos(a) * r;
      z = t.z + Math.sin(a) * r;
      coul = Math.random() < 0.82 ? t.c : COULEURS_FLEURS[(Math.random() * COULEURS_FLEURS.length) | 0];
    } else {
      x = (Math.random() * 2 - 1) * 7.5;
      z = -4 + Math.random() * 7.2;
      coul = COULEURS_FLEURS[(Math.random() * COULEURS_FLEURS.length) | 0];
    }
    const loin = z < -4;
    const h = (loin ? 0.16 : 0.1) + Math.random() * 0.1;
    flPos.set([x, h, z], i * 3);
    flTaille[i] = (loin ? 0.09 : 0.055) * (0.75 + Math.random() * 0.5);
    flVar.set([flTaille[i], Math.random() * 6.283, Math.random() < 0.6 ? 5 : 6, 0], i * 4);
    cM.set(coul);
    flCol.set([cM.r, cM.g, cM.b], i * 3);
    // la tige de la fleur rejoint l'herbe
    const j = nbHerbe + i;
    hauteurs[j] = h;
    lames.set([x, z, Math.random() * Math.PI, h], j * 4);
    hasard[j] = 0.02;
  }
  const attrFlVar = new THREE.InstancedBufferAttribute(flVar, 4);
  gFl.setAttribute("aPos", new THREE.InstancedBufferAttribute(flPos, 3));
  gFl.setAttribute("aVar", attrFlVar);
  gFl.setAttribute("aCol", new THREE.InstancedBufferAttribute(flCol, 3));
  gFl.instanceCount = nbFleurs;
  const fleurs = new THREE.Mesh(
    gFl,
    new THREE.ShaderMaterial({ uniforms: { ...L, uWind: { value: reduit ? 0 : 1 } }, vertexShader: FLEURS_VS, fragmentShader: FLEURS_FS, alphaToCoverage: true })
  );
  fleurs.frustumCulled = false;
  scene.add(fleurs);

  const attrLames = new THREE.InstancedBufferAttribute(lames, 4);
  gHerbe.setAttribute("aBlade", attrLames);
  gHerbe.setAttribute("aRand", new THREE.InstancedBufferAttribute(hasard, 1));
  gHerbe.instanceCount = nbLames;
  const herbe = new THREE.Mesh(
    gHerbe,
    new THREE.ShaderMaterial({
      uniforms: { ...L, uWind: { value: reduit ? 0 : 1 } },
      vertexShader: /* glsl */ `
        attribute vec4 aBlade; attribute float aRand;
        uniform float uTime; uniform float uWind; uniform vec3 uLanternPos;
        varying float vY; varying vec3 vW; varying float vDepth; varying float vRand;
        void main(){
          float y = position.y;
          vY = y; vRand = aRand;
          float largeur = (0.016 + aRand * 0.014) * (1.0 - y * 0.92);
          if (aRand < 0.05) largeur = 0.006;
          float c = cos(aBlade.z), s = sin(aBlade.z);
          vec3 p = vec3(position.x * largeur * c, y * aBlade.w, position.x * largeur * s);
          vec3 base = vec3(aBlade.x, 0.0, aBlade.y);
          float t = uTime * 1.1;
          float vent = sin(t + base.x * 0.6 + base.z * 0.45) * 0.55 + sin(t * 1.9 + base.x * 1.7 - base.z) * 0.22;
          vec2 courbe = vec2(0.5, 0.22) * vent * uWind + vec2(c, s) * 0.18 * (aRand - 0.5);
          if (aRand < 0.05) courbe = vec2(0.5, 0.22) * vent * uWind * 0.6;
          vec2 loin = base.xz - uLanternPos.xz;
          float dl = length(loin);
          if (aRand >= 0.05) courbe += (loin / max(dl, 0.001)) * smoothstep(1.1, 0.0, dl) * 0.75;
          float yy = y * y;
          p.xz += courbe * yy * aBlade.w;
          p.y -= length(courbe) * yy * aBlade.w * 0.3;
          vec3 w = base + p;
          vW = w;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          vDepth = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL.LUMIERE}
        varying float vY; varying vec3 vW; varying float vDepth; varying float vRand;
        void main(){
          vec3 racine = vec3(0.008, 0.045, 0.01);
          vec3 pointe = mix(vec3(0.04, 0.34, 0.03), vec3(0.15, 0.46, 0.02), vRand);
          vec3 c = mix(racine, pointe, vY);
          vec3 lum = mix(uGround, uSky, 0.6) + uSunColor * (0.5 + 0.5 * vY);
          vec3 col = c * lum + uRim * vY * vY * 0.12;
          vec3 Ld = uLanternPos - vW;
          col += uLanternColor * uLantern * (0.15 + 0.85 * vY) / (1.0 + dot(Ld, Ld) * 2.2) * 0.12;
          float fa = brume(vDepth);
          col = mix(uFogColor, col, fa);
          gl_FragColor = vec4(col, fa);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
      transparent: true,
    })
  );
  herbe.frustumCulled = false;
  herbe.renderOrder = 2;
  scene.add(herbe);

  /* ---------- Créatures ---------- */
  const qualite = petitEcran ? { couches: 18, poils: 7000, segW: 40, segH: 28 } : { couches: 26, poils: 10000 };
  const COTE = { minotaure: -1, gribou: -1, bloop: 1, noki: -1, pipo: -1 };
  const creatures = IDS.map((id) => {
    const c = new Creature(id, L, qualite);
    scene.add(c.groupe);
    c.echelle = 0.3;
    c.trouvee = api.trouvees.has(id);
    c.sortie = c.trouvee ? 1 : 0;
    c.cibleGlow = c.glow.value = c.trouvee ? 0.25 : 0;
    c.bouton = racine.querySelector(`.cachette[data-id="${id}"]`);
    c.prochainSaut = 2 + Math.random() * 4;
    c.cache = new THREE.Vector3();
    c.dehors = new THREE.Vector3();
    c.buisson = new THREE.Vector3();
    return c;
  });
  const parId = Object.fromEntries(creatures.map((c) => [c.id, c]));

  /* ---------- Champignons, pierres et pots ---------- */
  const geoChapeau = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  const geoPied = new THREE.CylinderGeometry(0.22, 0.3, 1, 10);
  geoPied.translate(0, 0.5, 0);
  const NB_CHAMP = 22;
  const chapeaux = new THREE.InstancedMesh(geoChapeau, solide("#ffffff", L, { pois: true, wrap: 0.9, emissive: 0.04 }), NB_CHAMP);
  const pieds = new THREE.InstancedMesh(geoPied, solide("#FFF3DE", L, { wrap: 0.9 }), NB_CHAMP);
  const coulChamp = ["#E8352B", "#E8352B", "#FF7A1F", "#E8352B", "#FFB21F"].map((h) => new THREE.Color(h));
  for (let i = 0; i < NB_CHAMP; i++) chapeaux.setColorAt(i, coulChamp[i % coulChamp.length]);
  scene.add(chapeaux, pieds);

  const geoPierre = new THREE.IcosahedronGeometry(1, 1);
  const pp = geoPierre.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (0.85 + Math.random() * 0.3), pp.getY(i) * (0.85 + Math.random() * 0.3), pp.getZ(i) * (0.85 + Math.random() * 0.3));
  geoPierre.computeVertexNormals();
  const NB_PIERRES = 10;
  const pierres = new THREE.InstancedMesh(geoPierre, solide("#8C8F9E", L, { wrap: 0.5 }), NB_PIERRES);
  scene.add(pierres);

  const profilPot = [[0, 0], [0.1, 0], [0.125, 0.15], [0.15, 0.16], [0.15, 0.2], [0.128, 0.2], [0.11, 0.17], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
  const geoPot = new THREE.LatheGeometry(profilPot, 24);
  const matPot = solide("#D9734E", L, { wrap: 0.6, emissive: 0.02 });
  const matFeuillage = solide("#3DBE5C", L, { wrap: 0.7, emissive: 0.03 });
  const matFleurPot = solide("#FF4F9A", L, { wrap: 0.8, emissive: 0.05 });
  const pots = [0, 1].map((k) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geoPot, matPot));
    const geoF = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(geoF, matFeuillage);
      const a = (i / 5) * Math.PI * 2 + Math.random();
      f.scale.set(0.09, 0.03, 0.05);
      f.position.set(Math.cos(a) * 0.06, 0.22 + Math.random() * 0.06, Math.sin(a) * 0.06);
      f.rotation.set(0, -a, 0.7);
      g.add(f);
    }
    if (k === 1) {
      const fl = new THREE.Mesh(geoF, matFleurPot);
      fl.scale.setScalar(0.045);
      fl.position.set(0, 0.32, 0);
      g.add(fl);
    }
    scene.add(g);
    return g;
  });

  /* ---------- Lucioles ---------- */
  const nbLucioles = petitEcran ? 45 : 90;
  const couleursLuc = ["#FFE58A", "#F2FF8A", "#FFF6C8", "#E5FF9E"];
  const lucioles = nuageDePoints(
    Array.from({ length: nbLucioles }, () => ({
      pos: [(Math.random() * 2 - 1) * 7.5, 0.25 + Math.random() * 2.2, -7 + Math.random() * 10],
      couleur: couleursLuc[(Math.random() * couleursLuc.length) | 0],
      taille: 0.07 + Math.random() * 0.08,
      seed: [Math.random(), Math.random(), Math.random()],
    })),
    matierePoints({ temps: L.uTime, flotte: reduit ? 0 : 1, eclat: 0.9 })
  );
  scene.add(lucioles);

  /* ---------- Luciole guide (suit le pointeur) ---------- */
  const lanterne = new THREE.Group();
  lanterne.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), solide("#FFF2B0", L, { emissive: 2.4 })));
  const halo = nuageDePoints([{ pos: [0, 0, 0], couleur: "#FFE27A", taille: 1.5, alpha: 0.75 }, { pos: [0, 0, 0], couleur: "#FFFBE0", taille: 0.3, alpha: 0.95 }], matierePoints({ temps: L.uTime }));
  lanterne.add(halo);
  scene.add(lanterne);
  const etincelles = new Etincelles(220, L.uTime);
  const feuillesVol = new Etincelles(260, L.uTime, { forme: 2, gravite: -0.55 });
  scene.add(etincelles.points, feuillesVol.points);
  const pointsMats = [lucioles.material, halo.material, etincelles.mat, feuillesVol.mat, ...creatures.filter((c) => c.eclats).map((c) => c.eclats.material)];
  const lueurDom = racine.querySelector(".lanterne-lueur");

  /* ---------- Mise en page (écran → monde) ---------- */
  const CIBLES = {
    large: { minotaure: [0.53, 0.86], gribou: [0.62, 0.66], bloop: [0.74, 0.87], noki: [0.82, 0.67], pipo: [0.93, 0.85] },
    etroit: { minotaure: [0.16, 0.84], gribou: [0.38, 0.74], bloop: [0.6, 0.89], noki: [0.78, 0.75], pipo: [0.88, 0.88] },
  };
  const OFFSETS_CHAMP = { minotaure: [-2.6, -1.0], gribou: [2.4, -1.4], bloop: [-2.7, 0.6], noki: [2.6, -0.9], pipo: [-2.4, -1.6] };
  const camBase = new THREE.Vector3(), cibleBase = new THREE.Vector3();
  const rayon = new THREE.Raycaster(), plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2();
  const bornes = { x0: -3, x1: 3, z0: -2, z1: 2 };
  let W = 1, H = 1, pxParUnite = 1;

  function versSol(nx, ny, cible) {
    ndc.set(nx * 2 - 1, -(ny * 2 - 1));
    rayon.setFromCamera(ndc, camera);
    return rayon.ray.intersectPlane(plan, cible);
  }

  function miseEnPage() {
    W = racine.clientWidth;
    H = racine.clientHeight;
    renderer.setSize(W, H, false);
    const e = etroit();
    camera.fov = e ? 50 : 36;
    camera.aspect = W / H;
    camBase.set(0, e ? 1.4 : 1.25, 6.4);
    cibleBase.set(0, e ? 0.45 : 0.5, 0);
    camera.position.copy(camBase);
    camera.lookAt(cibleBase);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    pxParUnite = H / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    pointsMats.forEach((m) => {
      m.uniforms.uPx.value = dpr;
      m.uniforms.uEchelle.value = pxParUnite;
    });

    const cibles = CIBLES[e ? "etroit" : "large"];
    const base = e ? THREE.MathUtils.clamp(W * 0.15, 48, 72) : THREE.MathUtils.clamp(W * 0.066, 64, 108);
    bornes.x0 = bornes.z0 = Infinity;
    bornes.x1 = bornes.z1 = -Infinity;
    nF = 0;
    creatures.forEach((c, n) => {
      const [nx, ny] = cibles[c.id];
      if (!versSol(nx, ny, tmp)) tmp.set(0, 0, 0);
      const profondeur = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z * -1;
      const px = base * (0.8 + (ny - 0.66) * 1.2);
      c.echelle = px / ((pxParUnite / profondeur) * c.R * 2);
      c.groupe.scale.setScalar(c.echelle);
      const u = (c.rayonMonde = c.R * c.echelle);
      // le buisson-cachette, la créature derrière, puis sa place une fois sortie
      c.buisson.copy(tmp);
      c.cache.set(tmp.x + 0.15 * u, -0.3 * u, tmp.z - 0.95 * u);
      c.dehors.set(tmp.x + 1.6 * u * COTE[c.id], 0, tmp.z + 0.7 * u);
      c.groupe.position.lerpVectors(c.cache, c.dehors, c.sortie);
      const vert = ["#2E9E4A", "#38A852", "#2B9446", "#33A04C", "#2C9A48"][n];
      touffe([[tmp.x, 0.95 * u, tmp.z, 1.15 * u], [tmp.x - 0.95 * u, 0.62 * u, tmp.z + 0.12 * u, 0.82 * u], [tmp.x + 0.95 * u, 0.62 * u, tmp.z + 0.12 * u, 0.82 * u], [tmp.x + 0.25 * u, 1.15 * u, tmp.z - 0.55 * u, 0.9 * u], [tmp.x - 0.35 * u, 0.45 * u, tmp.z + 0.45 * u, 0.6 * u]], vert, "#6BD45E", 0.075 * u / 0.21, 290 / (u * u));
      secousses[n].set(tmp.x, tmp.z, 2.2 * u, 0);
      for (const v of [tmp, c.dehors]) {
        bornes.x0 = Math.min(bornes.x0, v.x);
        bornes.x1 = Math.max(bornes.x1, v.x);
        bornes.z0 = Math.min(bornes.z0, v.z);
        bornes.z1 = Math.max(bornes.z1, v.z);
      }
      if (c.bouton) c.bouton.style.width = Math.round(px * 1.4) + "px";
    });
    bornes.x0 -= 0.9; bornes.x1 += 0.9; bornes.z0 -= 0.9; bornes.z1 += 0.7;

    // buissons décoratifs autour de la prairie
    const u0 = creatures[0].rayonMonde;
    [[-4.2, -2.2, 1.3], [-2.4, -4.5, 1.6], [3.6, -3.8, 1.5], [5.8, -1.8, 1.2], [-6.5, -0.6, 1.4], [0.6, -6.5, 1.9], [-1.2, -1.6, 0.9]].forEach(([x, z, s], k) => {
      const u = u0 * s * 1.3;
      touffe([[x, 0.9 * u, z, 1.1 * u], [x - 0.9 * u, 0.6 * u, z + 0.1 * u, 0.8 * u], [x + 0.85 * u, 0.55 * u, z, 0.78 * u]], k % 3 ? "#2A8F43" : "#2F9A4A", k % 2 ? "#64CC5A" : "#7BD86A", 0.085, 150 / (u * u));
    });
    arbresFeuilles();
    finFeuillage();

    // herbe plus courte autour des cachettes et des places de sortie
    for (let i = 0; i < nbHerbe; i++) {
      const x = lames[i * 4], z = lames[i * 4 + 1];
      let f = 1;
      for (const c of creatures) {
        for (const v of [c.buisson, c.dehors]) {
          const d = Math.hypot(x - v.x, z - v.z) / c.rayonMonde;
          if (d < 3) f = Math.min(f, 0.25 + 0.75 * THREE.MathUtils.smoothstep(d, 1.1, 3));
        }
      }
      lames[i * 4 + 3] = hauteurs[i] * f;
    }
    // pas de fleurs dans les buissons ni sous les créatures
    for (let i = 0; i < nbFleurs; i++) {
      const x = flPos[i * 3], z = flPos[i * 3 + 2];
      let ok = true;
      for (const c of creatures) {
        if (Math.hypot(x - c.buisson.x, z - c.buisson.z) < 1.9 * c.rayonMonde || Math.hypot(x - c.dehors.x, z - c.dehors.z) < 1.1 * c.rayonMonde) { ok = false; break; }
      }
      flVar[i * 4] = ok ? flTaille[i] : 0;
      lames[(nbHerbe + i) * 4 + 3] = ok ? hauteurs[nbHerbe + i] : 0;
    }
    attrFlVar.needsUpdate = true;
    attrLames.needsUpdate = true;

    // champignons, pierres et pots autour des créatures
    let ic = 0, ip = 0;
    creatures.forEach((c, n) => {
      const s = c.echelle, [ox, oz] = OFFSETS_CHAMP[c.id];
      const cx = c.buisson.x + ox * c.rayonMonde, cz = c.buisson.z + oz * c.rayonMonde;
      const nb = n === 4 ? 5 : 4;
      for (let j = 0; j < nb && ic < NB_CHAMP; j++, ic++) {
        const a = j * 2.4 + n, r = j === 0 ? 0 : (0.25 + 0.2 * Math.sin(j * 7)) * c.rayonMonde * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const t = s * (0.3 + ((j * 37) % 10) / 24) * (j === 0 ? 1.25 : 1);
        const hp = 0.3 * t;
        pieds.setMatrixAt(ic, m4.compose(v3.set(x, 0, z), q4.identity(), s3.set(0.11 * t, hp, 0.11 * t)));
        chapeaux.setMatrixAt(ic, m4.compose(v3.set(x, hp * 0.92, z), q4.setFromAxisAngle(tmp.set(Math.sin(a), 0, Math.cos(a)), 0.15), s3.set(0.2 * t, 0.14 * t, 0.2 * t)));
      }
      for (let j = 0; j < 2 && ip < NB_PIERRES; j++, ip++) {
        const a = n * 1.7 + j * 2.9;
        const x = c.buisson.x + Math.cos(a) * c.rayonMonde * 2.8, z = c.buisson.z + Math.sin(a) * c.rayonMonde * 1.6 - c.rayonMonde;
        const t = s * (0.16 + 0.1 * j);
        pierres.setMatrixAt(ip, m4.compose(v3.set(x, t * 0.25, z), q4.setFromAxisAngle(tmp.set(0, 1, 0), a), s3.set(t, t * 0.55, t * 0.8)));
      }
    });
    pieds.count = chapeaux.count = ic;
    pieds.instanceMatrix.needsUpdate = chapeaux.instanceMatrix.needsUpdate = pierres.instanceMatrix.needsUpdate = true;

    const pipo = parId.pipo;
    pots.forEach((g, i) => {
      g.position.set(pipo.buisson.x + (i ? 1.0 : -0.4) * pipo.rayonMonde * 2, 0, pipo.buisson.z - (i ? 1.0 : 1.7) * pipo.rayonMonde * 2);
      g.scale.setScalar(pipo.echelle * (i ? 1.6 : 2.1));
    });
  }

  /* ---------- Luciole : pointeur → sol ---------- */
  const lanternePos = new THREE.Vector3(0, 0.5, 1), lanterneCible = new THREE.Vector3(0, 0.5, 1);
  const parallaxe = new THREE.Vector2(), parallaxeCible = new THREE.Vector2();
  let aBouge = false, illumine = api.illumine;

  function viserEcran(clientX, clientY) {
    const r = racine.getBoundingClientRect();
    const nx = (clientX - r.left) / r.width, ny = (clientY - r.top) / r.height;
    parallaxeCible.set(nx * 2 - 1, ny * 2 - 1);
    if (!versSol(nx, Math.max(ny, 0.42), tmp)) return;
    lanterneCible.set(THREE.MathUtils.clamp(tmp.x, bornes.x0, bornes.x1), 0.5, THREE.MathUtils.clamp(tmp.z, bornes.z0, bornes.z1));
  }
  racine.addEventListener("pointermove", (e) => {
    viserEcran(e.clientX, e.clientY);
    aBouge = true;
    reveiller();
  });
  racine.addEventListener("pointerdown", (e) => {
    viserEcran(e.clientX, e.clientY);
    aBouge = true;
    reveiller();
  });
  creatures.forEach((c) => {
    c.bouton?.addEventListener("focus", () => {
      lanterneCible.set(c.buisson.x, 0.5, c.buisson.z + c.rayonMonde * 1.5);
      reveiller();
    });
  });

  // une créature sort de son buisson : saut, pluie de feuilles et d'étincelles, buisson qui tremble
  const FEUILLES_VERTES = ["#3DBE5C", "#6BD45E", "#2E9E4A", "#A6E05A"];
  function sortir(c, force = 1.25) {
    if (c.trouvee && c.sortie > 0.99) return;
    c.trouvee = true;
    c.cibleGlow = 0.25;
    c.sauter(force);
    const i = creatures.indexOf(c);
    secousses[i].w = 1;
    tmp.set(c.buisson.x, c.rayonMonde * 1.6, c.buisson.z);
    feuillesVol.emettre(tmp.clone(), FEUILLES_VERTES, 26, 1.4 * c.echelle * 3, 0.1 * c.echelle * 3);
    etincelles.emettre(c.centre(tmp).clone(), [PALETTE[c.id].base, "#FFE27A"], 22, 1.2 * c.echelle * 3, 0.08 * c.echelle * 3);
  }
  document.addEventListener("minitaure:trouvee", (e) => {
    const c = parId[e.detail.id];
    if (!c) return;
    sortir(c);
    reveiller();
  });
  document.addEventListener("minitaure:illumine", () => {
    illumine = true;
    creatures.forEach((c, i) => setTimeout(() => { sortir(c, 1); reveiller(); }, i * 170));
    reveiller();
  });

  /* ---------- Boucle ---------- */
  let t = 0, avant = performance.now(), raf = 0, visible = true, mesures = [], cpt = 0;
  const centre = new THREE.Vector3(), pos2 = new THREE.Vector3();

  function image(maintenant) {
    raf = 0;
    const dt = Math.min((maintenant - avant) / 1000, 0.05);
    avant = maintenant;
    if (!reduit) t += dt;
    L.uTime.value = t;

    // promenade automatique de la luciole tant que personne ne bouge
    if (!aBouge && !reduit && !illumine) {
      const cx = (bornes.x0 + bornes.x1) / 2, cz = (bornes.z0 + bornes.z1) / 2;
      lanterneCible.set(cx + (bornes.x1 - bornes.x0) * 0.42 * Math.sin(t * 0.42), 0.5, cz + (bornes.z1 - bornes.z0) * 0.38 * Math.sin(t * 0.83 + 1.2));
    }
    const hauteurCible = illumine ? 1.6 : 0.5 + Math.sin(t * 2.3) * 0.05;
    lanternePos.x += (lanterneCible.x - lanternePos.x) * Math.min(1, dt * 6);
    lanternePos.z += (lanterneCible.z - lanternePos.z) * Math.min(1, dt * 6);
    lanternePos.y += (hauteurCible - lanternePos.y) * Math.min(1, dt * 3);
    lanterne.position.copy(lanternePos);
    L.uLanternPos.value.copy(lanternePos);
    L.uLantern.value = 1.6 * (1 + Math.sin(t * 13) * 0.03 + Math.sin(t * 7.3) * 0.04);

    // caméra : parallaxe du pointeur + défilement (on lève les yeux vers le ciel)
    parallaxe.lerp(parallaxeCible, Math.min(1, dt * 3));
    const r = racine.getBoundingClientRect();
    const defile = THREE.MathUtils.clamp(-r.top / Math.max(r.height, 1), 0, 1);
    camera.position.set(camBase.x + parallaxe.x * 0.3, camBase.y - parallaxe.y * 0.12 + defile * 0.6, camBase.z);
    camera.lookAt(cibleBase.x + parallaxe.x * 0.1, cibleBase.y + defile * 1.6, cibleBase.z);
    camera.updateMatrixWorld();

    // créatures : cachées derrière leur buisson, puis dehors
    creatures.forEach((c) => {
      if (!c.trouvee && aBouge && !illumine) {
        const d = Math.hypot(lanternePos.x - c.buisson.x, lanternePos.z - c.buisson.z);
        if (d < c.rayonMonde * 2.1 + 0.12) api.trouver(c.id);
      }
      const but = c.trouvee ? 1 : 0;
      c.sortie += (but - c.sortie) * Math.min(1, dt * (c.trouvee ? 3.2 : 2));
      c.groupe.position.lerpVectors(c.cache, c.dehors, c.sortie);
      c.prochainSaut -= dt;
      if (!reduit && c.prochainSaut < 0) {
        // cachées, elles pointent le bout des oreilles ; dehors, elles sautillent
        c.sauter(c.trouvee ? 0.5 + Math.random() * 0.3 : 0.55);
        c.prochainSaut = c.trouvee ? 4 + Math.random() * 6 : 2.5 + Math.random() * 3.5;
      }
      if (c.trouvee) {
        const dx = lanternePos.x - c.groupe.position.x, dz = lanternePos.z - c.groupe.position.z;
        c.cibleYaw = Math.atan2(dx, dz) * 0.5;
      }
      if (c.eclats) c.eclats.material.uniforms.uEclat.value = 0.3 + c.sortie * 0.7;
      c.maj(t, reduit ? 0 : dt);
      if (c.bouton) {
        c.centre(centre);
        pos2.copy(centre).project(camera);
        const x = (pos2.x * 0.5 + 0.5) * W, y = (-pos2.y * 0.5 + 0.5) * H;
        c.bouton.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    });
    secousses.forEach((s) => (s.w = Math.max(0, s.w - dt * 1.4)));
    etincelles.maj(dt);
    feuillesVol.maj(dt);

    if (lueurDom) {
      pos2.copy(lanternePos).project(camera);
      lueurDom.style.transform = `translate(${((pos2.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-pos2.y * 0.5 + 0.5) * H).toFixed(1)}px) translate(-50%, -50%)`;
    }

    renderer.render(scene, camera);

    // qualité adaptative : si l'appareil peine, on allège
    if (!forcerQualite && cpt < 150) {
      cpt++;
      if (cpt > 20) mesures.push(dt);
      if (cpt === 150) {
        const moy = mesures.reduce((a, b) => a + b, 0) / mesures.length;
        if (moy > 0.03 && dpr > 1) {
          dpr = 1;
          renderer.setPixelRatio(dpr);
          miseEnPage();
        }
        if (moy > 0.045) {
          gHerbe.instanceCount = Math.floor(nbHerbe * 0.55);
        }
      }
    }
    const bouge = etincelles.actives || feuillesVol.actives || creatures.some((c) => Math.abs(c.sortie - (c.trouvee ? 1 : 0)) > 0.005);
    if (visible && !document.hidden && !couverte() && (!reduit || bouge || animeEncore())) raf = requestAnimationFrame(image);
  }
  // en mouvement réduit, on ne dessine que lorsque quelque chose change
  let finAnimation = 0;
  const animeEncore = () => performance.now() < finAnimation;
  const couverte = () => document.documentElement.classList.contains("page-couverte");
  function reveiller() {
    finAnimation = performance.now() + 1500;
    if (!raf && visible && !document.hidden && !couverte()) {
      avant = performance.now();
      raf = requestAnimationFrame(image);
    }
  }

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) reveiller();
  }).observe(racine);
  document.addEventListener("visibilitychange", () => !document.hidden && reveiller());
  document.addEventListener("minitaure:reprise", reveiller);
  let largeurPrec = 0, hauteurPrec = 0;
  new ResizeObserver(() => {
    // on ne regénère la scène que si la taille change vraiment (pas pour la barre d'adresse mobile)
    if (Math.abs(racine.clientWidth - largeurPrec) < 2 && Math.abs(racine.clientHeight - hauteurPrec) < 80 && largeurPrec) {
      W = racine.clientWidth;
      H = racine.clientHeight;
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      camera.updateProjectionMatrix();
      return reveiller();
    }
    largeurPrec = racine.clientWidth;
    hauteurPrec = racine.clientHeight;
    miseEnPage();
    reveiller();
  }).observe(racine);

  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    canvas.remove();
    api.passer2D?.();
  });

  miseEnPage();
  largeurPrec = racine.clientWidth;
  hauteurPrec = racine.clientHeight;
  lanternePos.set((bornes.x0 + bornes.x1) / 2, 0.5, (bornes.z0 + bornes.z1) / 2);
  lanterneCible.copy(lanternePos);
  api.passer3D?.();
  reveiller();
  requestAnimationFrame(() => racine.classList.add("jardin--pret"));
}
