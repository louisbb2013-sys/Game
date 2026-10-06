/* Minitaure — le jardin lunaire en 3D (accueil).
   Herbe animée, champignons lumineux, lucioles et cinq créatures en fourrure cachées dans la nuit.
   La lanterne (pointeur ou doigt) éclaire réellement la scène. Sans WebGL 2, la version 2D reste en place. */
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
  const L = lumieres();
  L.uMoonColor.value.set("#3C4580");
  L.uAmbient.value.set("#0A0A1C");
  L.uRim.value.set("#2A2466");
  L.uFogColor.value.set("#100E2D");
  L.uFogDensity.value = 0.07;
  L.uLantern.value = 2.4;

  const etroit = () => racine.clientWidth / Math.max(1, racine.clientHeight) < 0.9;
  const petitEcran = racine.clientWidth < 700 || tactile;

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
          vec3 base = mix(vec3(0.010, 0.016, 0.034), vec3(0.020, 0.044, 0.058), n);
          base = mix(base, vec3(0.028, 0.07, 0.058), smoothstep(0.55, 0.8, fbm(vW.xz * 0.9 + 3.0)) * 0.8);
          vec3 col = eclairer(base, vec3(0.0, 1.0, 0.0), vW, 0.2);
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

  /* ---------- Collines et arbres lointains (silhouettes dans la brume) ---------- */
  const geoColline = new THREE.SphereGeometry(1, 32, 16);
  const collines = new THREE.InstancedMesh(geoColline, solide("#1A1745", L, { fondu: true, wrap: 0.9, brume: 0.019 }), 5);
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3();
  [[-20, -30, 13, 3.2], [-6, -34, 12, 2.6], [8, -31, 14, 3.6], [22, -33, 12, 2.8], [0, -40, 22, 4]].forEach(([x, z, w, h], i) => {
    collines.setMatrixAt(i, m4.compose(v3.set(x, -0.6, z), q4.identity(), s3.set(w, h, 6)));
  });
  collines.renderOrder = 0;
  scene.add(collines);

  const geoCone = new THREE.ConeGeometry(1, 1, 10);
  geoCone.translate(0, 0.5, 0);
  const matArbre = solide("#0C1826", L, { fondu: true, wrap: 0.4, brume: 0.026 });
  const arbresPos = [[-9, -10, 3.4], [-6.5, -13, 4.2], [-11.5, -15, 3.8], [-4.2, -16, 2.8], [-2, -20, 2.4], [8.8, -11, 3.0], [12.5, -15, 3.4], [4.6, -17, 2.5], [15, -19, 3.6]];
  const arbres = new THREE.InstancedMesh(geoCone, matArbre, arbresPos.length * 3);
  let k = 0;
  arbresPos.forEach(([x, z, h]) => {
    for (let e = 0; e < 3; e++) {
      const w = h * (0.34 - e * 0.07), y = h * (0.12 + e * 0.24);
      arbres.setMatrixAt(k++, m4.compose(v3.set(x, y, z), q4.identity(), s3.set(w, h * 0.5, w)));
    }
  });
  arbres.renderOrder = 0;
  scene.add(arbres);

  /* ---------- Herbe ---------- */
  const nbHerbe = petitEcran ? 11000 : 24000;
  const lame = new THREE.PlaneGeometry(1, 1, 1, 5);
  lame.translate(0, 0.5, 0);
  const gHerbe = new THREE.InstancedBufferGeometry();
  gHerbe.index = lame.index;
  gHerbe.setAttribute("position", lame.attributes.position);
  const lames = new Float32Array(nbHerbe * 4), hasard = new Float32Array(nbHerbe), hauteurs = new Float32Array(nbHerbe);
  for (let i = 0; i < nbHerbe; i++) {
    const pres = i < nbHerbe * 0.66;
    const x = pres ? (Math.random() * 2 - 1) * 7.5 : (Math.random() * 2 - 1) * 14;
    const z = pres ? -3.6 + Math.random() * 6.9 : -15 + Math.random() * 11.4;
    hauteurs[i] = pres ? 0.06 + Math.random() * 0.12 : 0.1 + Math.random() * 0.16;
    lames.set([x, z, Math.random() * Math.PI, hauteurs[i]], i * 4);
    hasard[i] = Math.random();
  }
  const attrLames = new THREE.InstancedBufferAttribute(lames, 4);
  gHerbe.setAttribute("aBlade", attrLames);
  gHerbe.setAttribute("aRand", new THREE.InstancedBufferAttribute(hasard, 1));
  gHerbe.instanceCount = nbHerbe;
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
          float c = cos(aBlade.z), s = sin(aBlade.z);
          vec3 p = vec3(position.x * largeur * c, y * aBlade.w, position.x * largeur * s);
          vec3 base = vec3(aBlade.x, 0.0, aBlade.y);
          float t = uTime * 1.1;
          float vent = sin(t + base.x * 0.6 + base.z * 0.45) * 0.55 + sin(t * 1.9 + base.x * 1.7 - base.z) * 0.22;
          vec2 courbe = vec2(0.5, 0.22) * vent * uWind + vec2(c, s) * 0.18 * (aRand - 0.5);
          vec2 loin = base.xz - uLanternPos.xz;
          float dl = length(loin);
          courbe += (loin / max(dl, 0.001)) * smoothstep(1.1, 0.0, dl) * 0.75;
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
          vec3 racine = vec3(0.003, 0.006, 0.016);
          vec3 pointe = mix(vec3(0.010, 0.040, 0.045), vec3(0.026, 0.024, 0.085), vRand);
          vec3 col = mix(racine, pointe, vY);
          col += uMoonColor * 0.22 * vY * vY;
          vec3 Ld = uLanternPos - vW;
          col += uLanternColor * uLantern * (0.15 + 0.85 * vY) / (1.0 + dot(Ld, Ld) * 2.2) * 0.32;
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
  const creatures = IDS.map((id) => {
    const c = new Creature(id, L, qualite);
    scene.add(c.groupe);
    c.echelle = 0.3;
    c.trouvee = api.trouvees.has(id);
    if (c.trouvee) c.cibleGlow = c.glow.value = 0.9;
    c.bouton = racine.querySelector(`.cachette[data-id="${id}"]`);
    c.prochainSaut = 3 + Math.random() * 5;
    return c;
  });
  const parId = Object.fromEntries(creatures.map((c) => [c.id, c]));

  /* ---------- Champignons, pierres et pots ---------- */
  const geoChapeau = new THREE.SphereGeometry(1, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const geoPied = new THREE.CylinderGeometry(0.22, 0.3, 1, 8);
  geoPied.translate(0, 0.5, 0);
  const NB_CHAMP = 26;
  const chapeaux = new THREE.InstancedMesh(geoChapeau, solide("#ffffff", L, { emissive: 0.42, pulse: true, wrap: 1 }), NB_CHAMP);
  const pieds = new THREE.InstancedMesh(geoPied, solide("#9C97C9", L, { emissive: 0.15, wrap: 1 }), NB_CHAMP);
  const coulChamp = ["#7CF5D2", "#8FC8FF", "#B9A6FF", "#7CF5D2", "#FFB3A6"].map((h) => new THREE.Color(h));
  for (let i = 0; i < NB_CHAMP; i++) chapeaux.setColorAt(i, coulChamp[i % coulChamp.length]);
  scene.add(chapeaux, pieds);
  const lueursChamp = nuageDePoints(
    Array.from({ length: NB_CHAMP }, (_, i) => ({ pos: [0, -50, 0], couleur: "#" + coulChamp[i % coulChamp.length].getHexString(), taille: 0.4, alpha: 0.22 })),
    matierePoints({ temps: L.uTime })
  );
  scene.add(lueursChamp);

  const geoPierre = new THREE.IcosahedronGeometry(1, 1);
  const pp = geoPierre.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setXYZ(i, pp.getX(i) * (0.85 + Math.random() * 0.3), pp.getY(i) * (0.85 + Math.random() * 0.3), pp.getZ(i) * (0.85 + Math.random() * 0.3));
  geoPierre.computeVertexNormals();
  const NB_PIERRES = 10;
  const pierres = new THREE.InstancedMesh(geoPierre, solide("#262A4E", L, { wrap: 0.5 }), NB_PIERRES);
  scene.add(pierres);

  const profilPot = [[0, 0], [0.1, 0], [0.125, 0.15], [0.15, 0.16], [0.15, 0.2], [0.128, 0.2], [0.11, 0.17], [0, 0.17]].map(([x, y]) => new THREE.Vector2(x, y));
  const geoPot = new THREE.LatheGeometry(profilPot, 24);
  const matPot = solide("#B9665A", L, { wrap: 0.6, emissive: 0.03 });
  const matFeuillage = solide("#3F9C7C", L, { wrap: 0.7, emissive: 0.05 });
  const pots = [0, 1].map(() => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geoPot, matPot));
    const geoF = new THREE.SphereGeometry(1, 12, 8);
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(geoF, matFeuillage);
      const a = (i / 4) * Math.PI * 2 + Math.random();
      f.scale.set(0.09, 0.03, 0.05);
      f.position.set(Math.cos(a) * 0.06, 0.22 + Math.random() * 0.06, Math.sin(a) * 0.06);
      f.rotation.set(0, -a, 0.7);
      g.add(f);
    }
    scene.add(g);
    return g;
  });

  /* ---------- Lucioles ---------- */
  const nbLucioles = petitEcran ? 55 : 110;
  const couleursLuc = ["#FFE7A3", "#FFD46B", "#C9FFE9", "#FFF6D8"];
  const lucioles = nuageDePoints(
    Array.from({ length: nbLucioles }, () => ({
      pos: [(Math.random() * 2 - 1) * 7.5, 0.25 + Math.random() * 2.2, -7 + Math.random() * 10],
      couleur: couleursLuc[(Math.random() * couleursLuc.length) | 0],
      taille: 0.07 + Math.random() * 0.09,
      seed: [Math.random(), Math.random(), Math.random()],
    })),
    matierePoints({ temps: L.uTime, flotte: reduit ? 0 : 1, eclat: 0.85 })
  );
  scene.add(lucioles);

  /* ---------- Lanterne ---------- */
  const lanterne = new THREE.Group();
  const coeurLanterne = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 12), solide("#FFE2A6", L, { emissive: 2.2 }));
  lanterne.add(coeurLanterne);
  const halo = nuageDePoints([{ pos: [0, 0, 0], couleur: "#FFC98A", taille: 1.7, alpha: 0.7 }, { pos: [0, 0, 0], couleur: "#FFF3D6", taille: 0.32, alpha: 0.9 }], matierePoints({ temps: L.uTime }));
  lanterne.add(halo);
  scene.add(lanterne);
  const etincelles = new Etincelles(320, L.uTime);
  scene.add(etincelles.points);
  const pointsMats = [lucioles.material, lueursChamp.material, halo.material, etincelles.mat, ...creatures.filter((c) => c.eclats).map((c) => c.eclats.material)];

  const lueurDom = racine.querySelector(".lanterne-lueur");

  /* ---------- Mise en page (écran → monde) ---------- */
  const CIBLES = {
    large: { minotaure: [0.5, 0.85], gribou: [0.61, 0.66], bloop: [0.72, 0.86], noki: [0.83, 0.67], pipo: [0.93, 0.84] },
    etroit: { minotaure: [0.15, 0.83], gribou: [0.36, 0.74], bloop: [0.56, 0.88], noki: [0.76, 0.75], pipo: [0.87, 0.87] },
  };
  const OFFSETS_CHAMP = { minotaure: [-1.5, -0.8], gribou: [1.4, -1.0], bloop: [-1.6, 0.4], noki: [1.5, -0.7], pipo: [-1.3, -1.2] };
  const camBase = new THREE.Vector3(), cibleBase = new THREE.Vector3();
  const rayon = new THREE.Raycaster(), plan = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), ndc = new THREE.Vector2(), tmp = new THREE.Vector3();
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
    const base = e ? THREE.MathUtils.clamp(W * 0.17, 54, 80) : THREE.MathUtils.clamp(W * 0.075, 72, 122);
    bornes.x0 = bornes.z0 = Infinity;
    bornes.x1 = bornes.z1 = -Infinity;
    creatures.forEach((c) => {
      const [nx, ny] = cibles[c.id];
      if (!versSol(nx, ny, tmp)) tmp.set(0, 0, 0);
      c.groupe.position.copy(tmp);
      const profondeur = tmp.clone().applyMatrix4(camera.matrixWorldInverse).z * -1;
      const px = base * (0.8 + (ny - 0.66) * 1.2);
      c.echelle = px / ((pxParUnite / profondeur) * c.R * 2);
      c.groupe.scale.setScalar(c.echelle);
      c.rayonMonde = c.R * c.echelle;
      bornes.x0 = Math.min(bornes.x0, tmp.x);
      bornes.x1 = Math.max(bornes.x1, tmp.x);
      bornes.z0 = Math.min(bornes.z0, tmp.z);
      bornes.z1 = Math.max(bornes.z1, tmp.z);
      if (c.bouton) {
        c.bouton.style.width = Math.round(px * 1.15) + "px";
      }
    });
    bornes.x0 -= 0.9; bornes.x1 += 0.9; bornes.z0 -= 0.9; bornes.z1 += 0.7;

    // herbe plus courte autour des créatures
    for (let i = 0; i < nbHerbe; i++) {
      const x = lames[i * 4], z = lames[i * 4 + 1];
      let f = 1;
      for (const c of creatures) {
        const d = Math.hypot(x - c.groupe.position.x, z - c.groupe.position.z) / c.rayonMonde;
        if (d < 3) f = Math.min(f, 0.25 + 0.75 * THREE.MathUtils.smoothstep(d, 1.1, 3));
      }
      lames[i * 4 + 3] = hauteurs[i] * f;
    }
    attrLames.needsUpdate = true;

    // champignons, pierres et pots autour des créatures
    let ic = 0, ip = 0;
    creatures.forEach((c, n) => {
      const s = c.echelle, [ox, oz] = OFFSETS_CHAMP[c.id];
      const cx = c.groupe.position.x + ox * c.rayonMonde, cz = c.groupe.position.z + oz * c.rayonMonde;
      const nb = n === 4 ? 6 : 5;
      for (let j = 0; j < nb && ic < NB_CHAMP; j++, ic++) {
        const a = j * 2.4 + n, r = j === 0 ? 0 : (0.25 + 0.2 * Math.sin(j * 7)) * c.rayonMonde * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const t = s * (0.32 + ((j * 37) % 10) / 22) * (j === 0 ? 1.2 : 1);
        const hp = 0.32 * t;
        pieds.setMatrixAt(ic, m4.compose(v3.set(x, 0, z), q4.identity(), s3.set(0.12 * t, hp, 0.12 * t)));
        chapeaux.setMatrixAt(ic, m4.compose(v3.set(x, hp * 0.92, z), q4.setFromAxisAngle(tmp.set(Math.sin(a), 0, Math.cos(a)), 0.15), s3.set(0.2 * t, 0.15 * t, 0.2 * t)));
        lueursChamp.geometry.attributes.position.setXYZ(ic, x, hp + 0.04 * t, z);
        lueursChamp.geometry.attributes.aSize.setX(ic, 0.9 * t);
      }
      for (let j = 0; j < 2 && ip < NB_PIERRES; j++, ip++) {
        const a = n * 1.7 + j * 2.9;
        const x = c.groupe.position.x + Math.cos(a) * c.rayonMonde * 2.6, z = c.groupe.position.z + Math.sin(a) * c.rayonMonde * 1.6 - c.rayonMonde;
        const t = s * (0.18 + 0.12 * j);
        pierres.setMatrixAt(ip, m4.compose(v3.set(x, t * 0.25, z), q4.setFromAxisAngle(tmp.set(0, 1, 0), a), s3.set(t, t * 0.55, t * 0.8)));
      }
    });
    pieds.count = chapeaux.count = ic;
    pieds.instanceMatrix.needsUpdate = chapeaux.instanceMatrix.needsUpdate = pierres.instanceMatrix.needsUpdate = true;
    lueursChamp.geometry.attributes.position.needsUpdate = lueursChamp.geometry.attributes.aSize.needsUpdate = true;

    const pipo = parId.pipo;
    pots.forEach((g, i) => {
      g.position.set(pipo.groupe.position.x + (i ? 0.95 : -0.85) * pipo.rayonMonde * 2, 0, pipo.groupe.position.z - (i ? 1.2 : 1.6) * pipo.rayonMonde * 2);
      g.scale.setScalar(pipo.echelle * (i ? 1.6 : 2.1));
    });
  }

  /* ---------- Lanterne : pointeur → sol ---------- */
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
      lanterneCible.set(c.groupe.position.x, 0.5, c.groupe.position.z + c.rayonMonde * 1.5);
      reveiller();
    });
  });

  document.addEventListener("minitaure:trouvee", (e) => {
    const c = parId[e.detail.id];
    if (!c) return;
    c.trouvee = true;
    c.cibleGlow = 0.9;
    c.sauter(1.25);
    etincelles.emettre(c.centre(tmp).clone(), PALETTE[c.id].base, 34, 1.3 * c.echelle * 3, 0.09 * c.echelle * 3);
    reveiller();
  });
  document.addEventListener("minitaure:illumine", () => {
    illumine = true;
    creatures.forEach((c, i) =>
      setTimeout(() => {
        c.trouvee = true;
        c.cibleGlow = 0.9;
        c.sauter(1);
        etincelles.emettre(c.centre(tmp).clone(), PALETTE[c.id].base, 18, c.echelle * 3, 0.08 * c.echelle * 3);
      }, i * 160)
    );
    reveiller();
  });

  /* ---------- Boucle ---------- */
  const couleurs = {
    lune: [new THREE.Color("#3C4580"), new THREE.Color("#8590DE")],
    ambiance: [new THREE.Color("#0A0A1C"), new THREE.Color("#1D1B45")],
    rim: [new THREE.Color("#2A2466"), new THREE.Color("#5446AE")],
  };
  let lumiere = illumine ? 1 : 0;
  let t = 0, avant = performance.now(), raf = 0, visible = true, mesures = [], cpt = 0;
  const centre = new THREE.Vector3(), pos2 = new THREE.Vector3();

  function image(maintenant) {
    raf = 0;
    const dt = Math.min((maintenant - avant) / 1000, 0.05);
    avant = maintenant;
    if (!reduit) t += dt;
    L.uTime.value = t;

    // lanterne : promenade automatique tant que personne ne bouge
    if (!aBouge && !reduit && !illumine) {
      const cx = (bornes.x0 + bornes.x1) / 2, cz = (bornes.z0 + bornes.z1) / 2;
      lanterneCible.set(cx + (bornes.x1 - bornes.x0) * 0.42 * Math.sin(t * 0.42), 0.5, cz + (bornes.z1 - bornes.z0) * 0.38 * Math.sin(t * 0.83 + 1.2));
    }
    const hauteurCible = illumine ? 2.6 : 0.5 + Math.sin(t * 2.3) * 0.04;
    lanternePos.x += (lanterneCible.x - lanternePos.x) * Math.min(1, dt * 6);
    lanternePos.z += (lanterneCible.z - lanternePos.z) * Math.min(1, dt * 6);
    lanternePos.y += (hauteurCible - lanternePos.y) * Math.min(1, dt * 3);
    lanterne.position.copy(lanternePos);
    L.uLanternPos.value.copy(lanternePos);
    const flamme = 1 + Math.sin(t * 13) * 0.03 + Math.sin(t * 7.3) * 0.04;
    lumiere += ((illumine ? 1 : 0) - lumiere) * Math.min(1, dt * 1.5);
    L.uLantern.value = (2.4 + lumiere * 1.6) * flamme;
    L.uMoonColor.value.lerpColors(couleurs.lune[0], couleurs.lune[1], lumiere);
    L.uAmbient.value.lerpColors(couleurs.ambiance[0], couleurs.ambiance[1], lumiere);
    L.uRim.value.lerpColors(couleurs.rim[0], couleurs.rim[1], lumiere);
    halo.material.uniforms.uEclat.value = 0.85 + lumiere * 0.4;
    lucioles.material.uniforms.uEclat.value = 0.8 + lumiere * 0.6;

    // caméra : parallaxe du pointeur + défilement
    parallaxe.lerp(parallaxeCible, Math.min(1, dt * 3));
    const r = racine.getBoundingClientRect();
    const defile = THREE.MathUtils.clamp(-r.top / Math.max(r.height, 1), 0, 1);
    camera.position.set(camBase.x + parallaxe.x * 0.3, camBase.y - parallaxe.y * 0.12 + defile * 0.6, camBase.z);
    camera.lookAt(cibleBase.x + parallaxe.x * 0.1, cibleBase.y + defile * 1.6, cibleBase.z);
    camera.updateMatrixWorld();

    // créatures
    creatures.forEach((c) => {
      if (!c.trouvee && aBouge && !illumine) {
        const d = Math.hypot(lanternePos.x - c.groupe.position.x, lanternePos.z - c.groupe.position.z);
        if (d < c.rayonMonde * 2.3 + 0.12) api.trouver(c.id);
      }
      if (c.trouvee && !reduit) {
        c.prochainSaut -= dt;
        if (c.prochainSaut < 0) {
          c.sauter(0.55 + Math.random() * 0.3);
          c.prochainSaut = 4 + Math.random() * 6;
        }
        const dx = lanternePos.x - c.groupe.position.x, dz = lanternePos.z - c.groupe.position.z;
        c.cibleYaw = Math.atan2(dx, dz) * 0.5;
      }
      if (c.eclats) c.eclats.material.uniforms.uEclat.value = 0.18 + c.glow.value;
      c.maj(t, reduit ? 0 : dt);
      // le bouton HTML suit la créature à l'écran (clic, clavier, bulle)
      if (c.bouton) {
        c.centre(centre);
        pos2.copy(centre).project(camera);
        const x = (pos2.x * 0.5 + 0.5) * W, y = (-pos2.y * 0.5 + 0.5) * H;
        c.bouton.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    });
    etincelles.maj(dt);

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
        if (moy > 0.045) gHerbe.instanceCount = Math.floor(nbHerbe * 0.55);
      }
    }
    if (visible && !document.hidden && !couverte() && (!reduit || etincelles.actives || Math.abs(lumiere - (illumine ? 1 : 0)) > 0.01 || animeEncore())) raf = requestAnimationFrame(image);
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
  new ResizeObserver(() => {
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
  lanternePos.set((bornes.x0 + bornes.x1) / 2, 0.5, (bornes.z0 + bornes.z1) / 2);
  lanterneCible.copy(lanternePos);
  api.passer3D?.();
  reveiller();
  requestAnimationFrame(() => racine.classList.add("jardin--pret"));
}
