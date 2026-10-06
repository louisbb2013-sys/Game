/* Minitaure — créatures 3D dans les cartes, les portails et la scène « odyssée ».
   Un seul canevas WebGL couvre la fenêtre ; chaque élément [data-c3d] reçoit sa propre petite scène,
   dessinée exactement dans son rectangle (technique des « multiples éléments »). */
import { THREE, PALETTE, lumieres, Creature, Etincelles, webgl2Dispo } from "./commun.js";

const elements = [...document.querySelectorAll("[data-c3d]")];
const economie = navigator.connection && navigator.connection.saveData;
if (elements.length && webgl2Dispo() && !economie) {
  // on laisse d'abord le texte s'animer : la 3D démarre juste après la première image
  requestAnimationFrame(() => setTimeout(lancer3D, 250));
}

function lancer3D() {
  try {
    demarrer();
  } catch (e) {
    console.warn("Vitrine 3D indisponible :", e);
  }
}

function demarrer() {
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tactile = matchMedia("(pointer: coarse)").matches;
  const FOV = 28;
  const canvas = document.createElement("canvas");
  canvas.className = "vitrine-gl";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);
  const dpr = Math.min(window.devicePixelRatio || 1, tactile ? 1.75 : 2);
  renderer.setPixelRatio(dpr);

  const vues = elements.map(creerVue);
  const parEl = new Map(vues.map((v) => [v.el, v]));

  function creerVue(el) {
    const id = el.dataset.c3d;
    const mode = el.dataset.c3dMode || "carte";
    const scene = new THREE.Scene();
    const L = lumieres();
    L.uMoonDir.value.set(-0.45, 0.75, 0.6).normalize();
    L.uMoonColor.value.set("#C9C6F2");
    L.uAmbient.value.set("#34326A");
    L.uLanternPos.value.set(1.0, 1.25, 1.5);
    L.uLanternColor.value.set("#FFD9B0");
    L.uLantern.value = mode === "odyssee" ? 7 : 6;
    L.uRim.value.set("#7A6AE0");
    const c = new Creature(id, L, {
      couches: tactile ? 20 : mode === "odyssee" ? 34 : 30,
      poils: mode === "odyssee" ? 26000 : 16000,
      segW: tactile ? 44 : 64,
      segH: tactile ? 30 : 40,
      glow: 0.42,
    });
    scene.add(c.groupe);
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 30);
    camera.position.set(0, 0.64, 3.45);
    camera.lookAt(0, 0.56, 0);
    const etincelles = new Etincelles(90, L.uTime);
    scene.add(etincelles.points);
    const v = { el, id, mode, scene, camera, L, c, etincelles, visible: false, apparu: false, pop: reduit ? 1 : 0, mats: [etincelles.mat, c.eclats && c.eclats.material].filter(Boolean) };

    const hote = el.closest("[data-tilt], .fiche, .odyssee__scene") || el;
    hote.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / Math.max(r.width / 2, 1);
      const ny = (e.clientY - (r.top + r.height / 2)) / Math.max(r.height / 2, 1);
      c.cibleYaw = THREE.MathUtils.clamp(nx, -1.6, 1.6) * 0.55;
      c.ciblePitch = THREE.MathUtils.clamp(ny, -1.2, 1.2) * 0.22;
      demander();
    });
    hote.addEventListener("pointerenter", () => {
      if (!reduit) c.sauter(0.7);
      demander();
    });
    hote.addEventListener("pointerleave", () => {
      c.cibleYaw = c.ciblePitch = 0;
      demander();
    });
    return v;
  }

  // une créature ajoutée au panier saute de joie
  document.addEventListener("minitaure:ajout", (e) => {
    vues.forEach((v) => {
      if (v.id !== e.detail.id || !v.visible) return;
      if (!reduit) v.c.sauter(0.9);
      v.etincelles.emettre(v.c.centre(new THREE.Vector3()), PALETTE[v.id].base, 30, 1.5, 0.08);
      demander();
    });
  });

  const io = new IntersectionObserver(
    (ents) => {
      ents.forEach((en) => {
        const v = parEl.get(en.target);
        if (v) v.visible = en.isIntersecting;
      });
      demander();
    },
    { rootMargin: "200px 0px" }
  );
  vues.forEach((v) => io.observe(v.el));

  let raf = 0, t = 0, avant = performance.now(), cw = 0, ch = 0, jusqua = 0;
  const centre = new THREE.Vector3();
  const tanDemi = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);

  const couverte = () => document.documentElement.classList.contains("page-couverte");
  function demander(duree = 1200) {
    jusqua = Math.max(jusqua, performance.now() + duree);
    if (!raf && !document.hidden && !couverte()) {
      avant = performance.now();
      raf = requestAnimationFrame(image);
    }
  }

  // la créature n'apparaît qu'une fois sa carte révélée (classe .vu des apparitions)
  const revele = (v) => {
    if (v.apparu) return true;
    const a = v.el.closest(".apparait");
    return !a || (a.classList.contains("vu") && parseFloat(getComputedStyle(a).opacity) > 0.45);
  };

  function image(maintenant) {
    raf = 0;
    const dt = Math.min((maintenant - avant) / 1000, 0.05);
    avant = maintenant;
    if (!reduit) t += dt;
    const w = document.documentElement.clientWidth, h = window.innerHeight;
    if (w !== cw || h !== ch) {
      cw = w;
      ch = h;
      renderer.setSize(w, h, false);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    canvas.style.transform = `translate3d(${window.scrollX}px, ${window.scrollY}px, 0)`;
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);

    let occupe = false;
    for (const v of vues) {
      if (!v.visible) continue;
      if (!revele(v)) {
        occupe = true;
        continue;
      }
      const r = v.el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w || r.width < 4 || r.height < 4) continue;
      if (!v.apparu) {
        v.apparu = true;
        v.el.classList.add("c3d-actif");
        if (!reduit) {
          v.c.sauter(0.8);
          v.etincelles.emettre(v.c.centre(centre).clone(), PALETTE[v.id].base, 22, 1.2, 0.07);
        }
      }
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 2.2);
        occupe = true;
      }
      const s = v.pop >= 1 ? 1 : 1 - Math.pow(1 - v.pop, 3) * Math.cos(v.pop * 9);
      v.c.groupe.scale.setScalar(Math.max(0.001, s));
      v.L.uTime.value = t;
      v.c.maj(t, reduit ? 0 : dt);
      v.etincelles.maj(dt);
      if (v.etincelles.actives || Math.abs(v.c.yaw - v.c.cibleYaw) > 0.002 || v.c.y > 0) occupe = true;
      v.camera.aspect = r.width / r.height;
      v.camera.updateProjectionMatrix();
      const echelle = r.height / (2 * tanDemi);
      v.mats.forEach((m) => {
        m.uniforms.uPx.value = dpr;
        m.uniforms.uEchelle.value = echelle;
      });
      renderer.setViewport(r.left, h - r.bottom, r.width, r.height);
      renderer.setScissor(r.left, h - r.bottom, r.width, r.height);
      renderer.render(v.scene, v.camera);
      if (!reduit) occupe = true;
    }
    if (!document.hidden && !couverte() && (occupe || performance.now() < jusqua)) raf = requestAnimationFrame(image);
  }

  addEventListener("scroll", () => demander(300), { passive: true });
  addEventListener("resize", () => demander(300));
  document.addEventListener("visibilitychange", () => !document.hidden && demander());
  document.addEventListener("minitaure:reprise", () => demander());
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    canvas.remove();
    vues.forEach((v) => v.el.classList.remove("c3d-actif"));
  });
  demander();
}
