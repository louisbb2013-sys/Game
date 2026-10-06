/* Minitaure — panier, ciel étoilé, apparitions, cartes holographiques, scènes au défilement,
   jardin lunaire (version 2D de secours + interface pour la 3D), son et formulaires. */
(() => {
  "use strict";
  document.documentElement.classList.add("js");

  /* ====== CONFIGURATION ====== */
  // Remplacez VOTRE_ID par l'identifiant de votre formulaire Formspree (formspree.io/f/xxxxxx)
  const FORMSPREE_COMMANDE = "https://formspree.io/f/VOTRE_ID";
  const FORMSPREE_CONTACT = "https://formspree.io/f/VOTRE_ID";
  const COURRIEL = "ibrahimkalil2024@gmail.com";

  const CREATURES = [
    { id: "minotaure", num: "001", nom: "Minotaure", prix: 6, couleur: "#8C6CF0", lore: "Aime collectionner les siestes dans les poches de manteau." },
    { id: "gribou", num: "002", nom: "Gribou", prix: 6, couleur: "#FF8F7E", lore: "Apparaît lorsqu’une personne fredonne très doucement." },
    { id: "bloop", num: "003", nom: "Bloop", prix: 6, couleur: "#8FC8FF", lore: "Adore les flaques, mais seulement celles qui ressemblent à des ronds de lune." },
    { id: "noki", num: "004", nom: "Noki", prix: 6, couleur: "#FFD46B", lore: "Rit si fort qu’on l’entend avant de le voir scintiller." },
    { id: "pipo", num: "005", nom: "Pipo", prix: 6, couleur: "#8EDDBE", lore: "Connaît le chemin secret derrière chaque pot de fleurs." },
  ];
  const parId = Object.fromEntries(CREATURES.map((c) => [c.id, c]));
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointeurFin = matchMedia("(pointer: fine)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const borne = (v, a, b) => Math.min(b, Math.max(a, v));
  const lisse = (a, b, x) => { const t = borne((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const argent = (n) => `${n.toLocaleString("fr-CA")} $`;
  const img = (id) => `assets/creatures/${id}.svg`;
  const lire = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const ecrire = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const signaler = (nom, detail) => document.dispatchEvent(new CustomEvent(nom, { detail }));
  // quand le panier ou le menu couvre la page : défilement bloqué et 3D en pause
  const couvrir = () => {
    const oui = !!(document.querySelector("#tiroir.ouvert") || document.querySelector(".header.nav-open"));
    if (oui === document.documentElement.classList.contains("page-couverte")) return;
    document.documentElement.classList.toggle("page-couverte", oui);
    document.body.style.overflow = oui ? "hidden" : "";
    signaler(oui ? "minitaure:pause" : "minitaure:reprise");
  };

  /* ====== SON (désactivé par défaut) ====== */
  const son = (() => {
    let ctx = null, actif = lire("minitaure-son") === "1";
    const NOTES = [523.25, 587.33, 659.25, 783.99, 880];
    const contexte = () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    };
    function note(i, delai = 0, volume = 0.14) {
      if (!actif) return;
      const c = contexte();
      if (!c) return;
      const t0 = c.currentTime + delai, f = NOTES[((i % 5) + 5) % 5];
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(volume, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
      const o1 = c.createOscillator(), o2 = c.createOscillator(), g2 = c.createGain();
      o1.type = "sine"; o1.frequency.value = f;
      o2.type = "triangle"; o2.frequency.value = f * 2.005; g2.gain.value = 0.22;
      o1.connect(g); o2.connect(g2).connect(g); g.connect(c.destination);
      o1.start(t0); o2.start(t0); o1.stop(t0 + 1.7); o2.stop(t0 + 1.7);
    }
    const boutons = $$("[data-son]");
    function maj() {
      boutons.forEach((b) => {
        b.setAttribute("aria-pressed", String(actif));
        const s = b.querySelector("span");
        if (s) s.textContent = actif ? "Son du jardin : activé" : "Son du jardin : coupé";
        else b.setAttribute("aria-label", actif ? "Couper le son du jardin" : "Activer le son du jardin");
      });
    }
    boutons.forEach((b) => b.addEventListener("click", () => {
      actif = !actif;
      ecrire("minitaure-son", actif ? "1" : "0");
      maj();
      note(2, 0, 0.1);
    }));
    maj();
    return { note, arpege: () => [0, 1, 2, 3, 4].forEach((i, k) => note(i, k * 0.12, 0.1)) };
  })();

  /* ====== PANIER (localStorage, protégé) ====== */
  const CLE = "minitaure-panier";
  let panier = {};
  try { panier = JSON.parse(lire(CLE)) || {}; } catch (_) { panier = {}; }
  const nettoyer = () => { for (const k of Object.keys(panier)) if (!parId[k] || !(panier[k] > 0)) delete panier[k]; };
  nettoyer();
  const sauver = () => { nettoyer(); ecrire(CLE, JSON.stringify(panier)); majPanier(); };
  const nbArticles = () => Object.values(panier).reduce((a, b) => a + b, 0);
  const totalPanier = () => Object.entries(panier).reduce((t, [k, q]) => t + parId[k].prix * q, 0);
  const fixer = (id, q) => { panier[id] = Math.max(0, Math.min(99, q | 0)); sauver(); };
  const ajouter = (id, q = 1) => fixer(id, (panier[id] || 0) + q);

  /* ====== NAVIGATION MOBILE ====== */
  const header = $(".header");
  const menuBtn = $(".menu-btn");
  menuBtn?.addEventListener("click", () => {
    const ouvert = header.classList.toggle("nav-open");
    menuBtn.setAttribute("aria-expanded", String(ouvert));
    couvrir();
  });

  /* ====== TIROIR ====== */
  const tiroir = $("#tiroir");
  const liste = $("#tiroir-liste");
  let dernierFocus = null;
  function ouvrirTiroir() {
    dernierFocus = document.activeElement;
    toast.classList.remove("vu");
    tiroir.classList.add("ouvert");
    tiroir.setAttribute("aria-hidden", "false");
    couvrir();
    setTimeout(() => $(".fermer", tiroir).focus(), 60);
  }
  function fermerTiroir() {
    tiroir.classList.remove("ouvert");
    tiroir.setAttribute("aria-hidden", "true");
    couvrir();
    dernierFocus?.focus();
  }
  $$("[data-ouvrir-panier]").forEach((b) => b.addEventListener("click", ouvrirTiroir));
  $$("[data-fermer-panier]").forEach((b) => b.addEventListener("click", fermerTiroir));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && header?.classList.contains("nav-open")) menuBtn.click();
    if (!tiroir?.classList.contains("ouvert")) return;
    if (e.key === "Escape") fermerTiroir();
    if (e.key === "Tab") {
      const f = $$("button, a[href], input", $(".tiroir__panneau", tiroir)).filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });

  function ligneHTML(c, q, petit) {
    return `<li class="ligne ${q > 0 ? "active" : ""} t-${c.id}" data-id="${c.id}">
      <img src="${img(c.id)}" alt="" width="56" height="56">
      <div class="ligne__nom">${c.nom}<small>N° ${c.num} · ${argent(c.prix)}${petit ? "" : " l’unité"}</small></div>
      <div class="qte" role="group" aria-label="Quantité de ${c.nom}">
        <button type="button" data-moins aria-label="Retirer un ${c.nom}">−</button>
        <input type="number" inputmode="numeric" min="0" max="99" value="${q}" aria-label="Quantité de ${c.nom}" name="qte-${c.id}">
        <button type="button" data-plus aria-label="Ajouter un ${c.nom}">+</button>
      </div></li>`;
  }

  function brancherLignes(racine, surChange) {
    racine.addEventListener("click", (e) => {
      const li = e.target.closest(".ligne");
      if (!li) return;
      const inp = $("input", li);
      if (e.target.closest("[data-plus]")) inp.value = Math.min(99, (+inp.value || 0) + 1);
      else if (e.target.closest("[data-moins]")) inp.value = Math.max(0, (+inp.value || 0) - 1);
      else return;
      surChange(li.dataset.id, +inp.value);
    });
    racine.addEventListener("change", (e) => {
      const li = e.target.closest(".ligne");
      if (!li) return;
      const v = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0));
      e.target.value = v;
      surChange(li.dataset.id, v);
    });
  }
  if (liste) brancherLignes(liste, (id, q) => fixer(id, q));

  function majPanier() {
    const n = nbArticles();
    $$(".cart-btn__n").forEach((el) => (el.textContent = n));
    $$(".cart-btn").forEach((b) => b.setAttribute("aria-label", `Ouvrir le panier, ${n} article${n > 1 ? "s" : ""}`));
    if (!liste) return;
    const items = Object.entries(panier);
    // on ne reconstruit pas la liste pendant la saisie d'une quantité
    if (!liste.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") {
      liste.innerHTML = items.length
        ? `<ul class="lignes">${items.map(([k, q]) => ligneHTML(parId[k], q, true)).join("")}</ul>`
        : `<div class="tiroir__vide"><img src="${img("minotaure")}" alt="" width="90" height="90"><p>Ton panier est encore vide.<br>Les créatures attendent dans le jardin.</p></div>`;
    }
    $("#tiroir-total").textContent = argent(totalPanier());
    const cmd = $("#tiroir-commander");
    cmd.toggleAttribute("aria-disabled", !n);
    cmd.classList.toggle("btn--desactive", !n);
  }

  /* ====== TOAST ====== */
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  document.body.append(toast);
  let tt;
  function annoncer(msg) {
    toast.innerHTML = `<span>${msg}</span><button type="button">Voir le panier</button>`;
    $("button", toast).onclick = ouvrirTiroir;
    toast.classList.add("vu");
    clearTimeout(tt);
    tt = setTimeout(() => toast.classList.remove("vu"), 3400);
  }

  /* ====== AJOUT AU PANIER : petite orbe qui vole jusqu'au panier ====== */
  function rebondPanier() {
    $$(".cart-btn").forEach((c) => { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); });
  }
  function voler(depuis, couleur) {
    const cible = $(".cart-btn");
    if (reduit || !cible || !depuis.animate) return rebondPanier();
    const a = depuis.getBoundingClientRect(), b = cible.getBoundingClientRect();
    const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2;
    const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 140;
    const orbe = document.createElement("div");
    orbe.className = "vol";
    orbe.style.setProperty("--teinte", couleur);
    document.body.append(orbe);
    const images = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      images.push({ transform: `translate(${u * u * x0 + 2 * u * t * mx + t * t * x1}px, ${u * u * y0 + 2 * u * t * my + t * t * y1}px) scale(${1.2 - t * 0.6})`, opacity: t > 0.92 ? 0 : 1 });
    }
    orbe.animate(images, { duration: 780, easing: "cubic-bezier(.45,0,.2,1)" }).onfinish = () => { orbe.remove(); rebondPanier(); };
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ajouter]");
    if (!b) return;
    const c = parId[b.dataset.ajouter];
    if (!c) return;
    ajouter(c.id, 1);
    voler(b, c.couleur);
    son.note(CREATURES.indexOf(c), 0, 0.1);
    signaler("minitaure:ajout", { id: c.id });
    const txt = b.querySelector("span");
    if (txt && !b.classList.contains("ok")) {
      const t = txt.textContent;
      b.classList.add("ok");
      txt.textContent = "Ajouté !";
      setTimeout(() => { txt.textContent = t; b.classList.remove("ok"); }, 1400);
    }
    annoncer(`${c.nom} est dans ton panier`);
  });

  /* ====== TEXTE DÉCOUPÉ EN MOTS ====== */
  $$("[data-split]").forEach((el) => {
    let i = 0;
    const parcourir = (noeud) => {
      [...noeud.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((m) => {
            if (!m) return;
            if (/^\s+$/.test(m)) return frag.append(m);
            const s = document.createElement("span");
            s.className = "mot";
            s.textContent = m;
            s.style.setProperty("--i", i++);
            frag.append(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) parcourir(n);
      });
    };
    parcourir(el);
  });

  /* ====== APPARITIONS AU DÉFILEMENT ====== */
  const aReveler = $$(".apparait, [data-split]");
  if ("IntersectionObserver" in window && !reduit) {
    const io = new IntersectionObserver(
      (ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("vu"); io.unobserve(en.target); } }),
      { rootMargin: "0px 0px -8% 0px" }
    );
    aReveler.forEach((el) => io.observe(el));
  } else aReveler.forEach((el) => el.classList.add("vu"));

  /* ====== FOND ANIMÉ : pétales et feuilles qui tombent, lucioles ====== */
  (function fond() {
    const c = document.createElement("canvas");
    c.className = "ciel-gl";
    c.setAttribute("aria-hidden", "true");
    document.body.prepend(c);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let w = 0, h = 0, dpr = 1, chutes = [], lucioles = [], raf = 0, avant = 0;
    const PETALES = ["#FF8FC0", "#FFC1DB", "#FFD84D", "#FFFFFF", "#FF9F6B", "#C9B2FF"];
    const FEUILLES = ["#3FBF5C", "#6BD45E", "#A6E05A", "#2E9E4A"];
    const sprite = (couleur) => {
      const s = document.createElement("canvas");
      s.width = s.height = 64;
      const g = s.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      r.addColorStop(0, "rgba(255,255,255,1)");
      r.addColorStop(0.12, couleur.replace("A", "0.95"));
      r.addColorStop(0.4, couleur.replace("A", "0.25"));
      r.addColorStop(1, couleur.replace("A", "0"));
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
      return s;
    };
    const sprites = [sprite("rgba(255,236,120,A)"), sprite("rgba(214,255,130,A)"), sprite("rgba(255,246,190,A)")];
    const nouvelle = (partout) => {
      const feuille = Math.random() < 0.45;
      const palette = feuille ? FEUILLES : PETALES;
      return {
        x: Math.random() * w, y: partout ? Math.random() * h : -20,
        s: (feuille ? 7 : 5) + Math.random() * 6, vy: 0.012 + Math.random() * 0.02, p: Math.random() * 6.28,
        rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.003, feuille,
        c: palette[(Math.random() * palette.length) | 0], a: 0.5 + Math.random() * 0.4, prof: 0.5 + Math.random() * 0.8,
      };
    };
    function taille() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = innerWidth;
      h = innerHeight;
      c.width = w * dpr;
      c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      chutes = Array.from({ length: Math.round(Math.min(34, (w * h) / 40000) + 6) }, () => nouvelle(true));
      lucioles = Array.from({ length: Math.round(Math.min(18, w / 70)) }, (_, i) => ({ x: Math.random() * w, y: Math.random() * h, p: Math.random() * 6.28, v: 0.4 + Math.random() * 0.6, r: 9 + Math.random() * 12, s: sprites[i % 3] }));
    }
    function dessinerChute(o, t) {
      const sy = scrollY * 0.06 * o.prof;
      let y = (o.y - sy) % (h + 40);
      if (y < -20) y += h + 40;
      ctx.save();
      ctx.translate(o.x, y);
      ctx.rotate(o.rot);
      ctx.scale(reduit ? 1 : Math.cos(t * 0.0018 + o.p) * 0.85 + 0.15 * Math.sign(Math.cos(t * 0.0018 + o.p) || 1), 1);
      ctx.globalAlpha = o.a;
      ctx.fillStyle = o.c;
      const s = o.s;
      ctx.beginPath();
      if (o.feuille) {
        ctx.moveTo(0, -s);
        ctx.quadraticCurveTo(s * 0.75, 0, 0, s);
        ctx.quadraticCurveTo(-s * 0.75, 0, 0, -s);
        ctx.fill();
        ctx.globalAlpha = o.a * 0.5;
        ctx.strokeStyle = "#1E7A3A";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.8);
        ctx.lineTo(0, s * 0.8);
        ctx.stroke();
      } else {
        ctx.moveTo(0, -s * 0.6);
        ctx.bezierCurveTo(s * 0.7, -s * 0.6, s * 0.6, s * 0.5, 0, s * 0.6);
        ctx.bezierCurveTo(-s * 0.6, s * 0.5, -s * 0.7, -s * 0.6, 0, -s * 0.6);
        ctx.fill();
      }
      ctx.restore();
    }
    function image(t) {
      raf = 0;
      const dt = Math.min(t - avant, 50);
      avant = t;
      ctx.clearRect(0, 0, w, h);
      for (const o of chutes) {
        if (!reduit) {
          o.y += o.vy * dt * o.prof;
          o.x += Math.sin(t * 0.0009 + o.p) * 0.35;
          o.rot += o.vr * dt;
          if (o.y > h + 20) Object.assign(o, nouvelle(false));
        }
        dessinerChute(o, t);
      }
      ctx.globalCompositeOperation = "lighter";
      for (const l of lucioles) {
        if (!reduit) {
          l.p += dt * 0.0006 * l.v;
          l.x += Math.sin(l.p * 1.3) * 0.32 + Math.cos(l.p * 0.7) * 0.18;
          l.y += Math.cos(l.p * 0.9) * 0.24 - 0.1 * l.v;
          if (l.y < -30) { l.y = h + 20; l.x = Math.random() * w; }
          if (l.x < -30) l.x = w + 20;
          if (l.x > w + 30) l.x = -20;
        }
        ctx.globalAlpha = reduit ? 0.5 : 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.0021 * l.v + l.p * 4));
        ctx.drawImage(l.s, l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      if (!reduit && !document.hidden) raf = requestAnimationFrame(image);
    }
    taille();
    const relancer = () => { if (!raf) raf = requestAnimationFrame(image); };
    addEventListener("resize", () => { taille(); relancer(); });
    document.addEventListener("visibilitychange", relancer);
    if (reduit) addEventListener("scroll", relancer, { passive: true });
    relancer();
  })();

  /* ====== LUCIOLE QUI SUIT LE CURSEUR ====== */
  if (pointeurFin && !reduit) {
    const l = document.createElement("div");
    l.className = "luciole";
    l.setAttribute("aria-hidden", "true");
    document.body.append(l);
    let x = -100, y = -100, tx = -100, ty = -100, raf = 0;
    const suivre = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      l.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 ? requestAnimationFrame(suivre) : 0;
    };
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      tx = e.clientX;
      ty = e.clientY;
      if (x < -50) { x = tx; y = ty; }
      l.classList.add("vue");
      l.classList.toggle("sur", !!e.target.closest("a, button, [data-tilt], label, select, .curieuse"));
      if (!raf) raf = requestAnimationFrame(suivre);
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => l.classList.remove("vue"));
  }

  /* ====== BOUTONS AIMANTÉS ====== */
  if (pointeurFin && !reduit) {
    $$("[data-aimant]").forEach((b) => {
      b.addEventListener("pointermove", (e) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--ax", ((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1) + "px");
        b.style.setProperty("--ay", ((e.clientY - (r.top + r.height / 2)) * 0.32).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--ax", "0px"); b.style.setProperty("--ay", "0px"); });
    });
  }

  /* ====== CARTES HOLOGRAPHIQUES (inclinaison + reflets) ====== */
  $$("[data-tilt]").forEach((hote) => {
    const face = $(".carte__face", hote) || hote;
    let raf = 0, ev = null;
    const appliquer = () => {
      raf = 0;
      if (!ev) return;
      const r = hote.getBoundingClientRect();
      const px = borne((ev.clientX - (r.left + face.offsetLeft)) / face.offsetWidth, 0, 1);
      const py = borne((ev.clientY - (r.top + face.offsetTop)) / face.offsetHeight, 0, 1);
      face.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
      face.style.setProperty("--my", (py * 100).toFixed(1) + "%");
      face.style.setProperty("--rx", (reduit ? 0 : (0.5 - py) * 14).toFixed(2) + "deg");
      face.style.setProperty("--ry", (reduit ? 0 : (px - 0.5) * 18).toFixed(2) + "deg");
      face.style.setProperty("--o", "1");
    };
    hote.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch") return;
      ev = e;
      face.classList.add("actif");
      if (!raf) raf = requestAnimationFrame(appliquer);
    });
    hote.addEventListener("pointerleave", () => {
      ev = null;
      face.classList.remove("actif");
      face.style.setProperty("--rx", "0deg");
      face.style.setProperty("--ry", "0deg");
      face.style.setProperty("--mx", "50%");
      face.style.setProperty("--my", "50%");
      face.style.setProperty("--o", "0");
    });
  });

  /* ====== PROGRESSION AU DÉFILEMENT (--p de 0 à 1) ====== */
  const suivis = $$("[data-progress]").map((el) => ({ el, colle: el.dataset.progress === "colle", p: -1, fn: null }));
  function majProgress() {
    const vh = innerHeight;
    for (const s of suivis) {
      const r = s.el.getBoundingClientRect();
      if (r.bottom < -vh || r.top > vh * 2) continue;
      const p = s.colle ? borne(-r.top / Math.max(1, r.height - vh), 0, 1) : borne((vh - r.top) / (vh + r.height), 0, 1);
      if (Math.abs(p - s.p) < 0.0004) continue;
      s.p = p;
      s.el.style.setProperty("--p", p.toFixed(4));
      s.fn?.(p);
    }
  }
  let rafP = 0;
  const demanderProgress = () => { if (!rafP) rafP = requestAnimationFrame(() => { rafP = 0; majProgress(); }); };
  addEventListener("scroll", demanderProgress, { passive: true });
  addEventListener("resize", demanderProgress);

  /* ====== ODYSSÉE : la créature rétrécit, la carte du ciel se dessine ====== */
  const ody = $(".odyssee");
  if (ody) {
    const textes = $$(".odyssee__t", ody).map((el) => ({ el, f: el.dataset.fenetre.split(",").map(Number) }));
    const traces = $$("[data-trace]", ody);
    const reperes = $$("[data-repere]", ody);
    const creature = $(".odyssee__creature", ody);
    const cta = $(".odyssee__cta", ody);
    const rendre = (p) => {
      creature.style.setProperty("--s", (1.15 - 0.82 * lisse(0.04, 0.6, p)).toFixed(4));
      textes.forEach(({ el, f: [a, b] }) => el.style.setProperty("--vis", (lisse(a, a + 0.07, p) * (1 - lisse(b, b + 0.07, p))).toFixed(3)));
      cta?.classList.toggle("actif", p > 0.72);
      traces.forEach((tr, i) => {
        tr.style.strokeDashoffset = (1 - lisse(0.3 + i * 0.045, 0.6 + i * 0.045, p)).toFixed(4);
        reperes[i]?.style.setProperty("--vis", lisse(0.46 + i * 0.045, 0.62 + i * 0.045, p).toFixed(3));
      });
    };
    if (reduit) {
      creature.style.setProperty("--s", "0.42");
      textes.forEach(({ el }) => el.style.setProperty("--vis", "1"));
      reperes.forEach((r) => r.style.setProperty("--vis", "1"));
      traces.forEach((t) => (t.style.strokeDashoffset = "0"));
      cta?.classList.add("actif");
    } else {
      const s = suivis.find((x) => x.el === ody);
      if (s) s.fn = rendre;
      rendre(0);
    }
  }
  majProgress();

  /* ====== JARDIN LUNAIRE ====== */
  const jardin = $(".jardin");
  if (jardin) {
    const lueur = $(".lanterne-lueur", jardin);
    const cachettes = $$(".cachette", jardin);
    const points = $$(".compteur__points i", jardin);
    const etat = $("#compteur-texte");
    const btnIllum = $("#illuminer");
    const API = (window.MinitaureJardin = { trouvees: new Set(), illumine: false, mode3D: false, trouver, illuminer: () => toutIlluminer(false), passer3D, passer2D });

    function majCompteur() {
      points.forEach((p, i) => p.classList.toggle("on", i < API.trouvees.size));
      etat.textContent = API.trouvees.size === 5 ? "Collection complète !" : `${API.trouvees.size} / 5 trouvées`;
    }
    // la bulle s'aligne sur le bord quand la créature est près d'un côté de l'écran
    function alignerBulle(c) {
      const jb = jardin.getBoundingClientRect(), b = c.getBoundingClientRect();
      const cx = b.left + b.width / 2 - jb.left;
      c.classList.toggle("bord-g", cx < 130);
      c.classList.toggle("bord-d", cx > jb.width - 130);
    }
    function trouver(id) {
      const c = cachettes.find((b) => b.dataset.id === id);
      if (!c) return;
      cachettes.forEach((o) => o !== c && o.classList.remove("montre"));
      alignerBulle(c);
      c.classList.add("montre");
      clearTimeout(c._t);
      c._t = setTimeout(() => c.classList.remove("montre"), 2800);
      if (API.trouvees.has(id)) return;
      API.trouvees.add(id);
      c.classList.add("trouvee");
      majCompteur();
      son.note(CREATURES.findIndex((x) => x.id === id));
      if (!pointeurFin && navigator.userActivation?.isActive) navigator.vibrate?.(12);
      signaler("minitaure:trouvee", { id });
      if (API.trouvees.size === 5) setTimeout(() => toutIlluminer(true), 900);
    }
    function toutIlluminer(complet) {
      if (API.illumine) return;
      API.illumine = true;
      jardin.classList.add("jardin--illumine");
      cachettes.forEach((c, i) => { API.trouvees.add(c.dataset.id); setTimeout(() => c.classList.add("trouvee"), complet ? 0 : i * 140); });
      points.forEach((p) => p.classList.add("on"));
      etat.textContent = complet ? "Collection complète !" : "Tout le monde est sorti !";
      btnIllum.textContent = "Voir la collection";
      son.arpege();
      signaler("minitaure:illumine");
    }
    btnIllum.addEventListener("click", () => {
      if (API.illumine) $("#collection").scrollIntoView({ behavior: reduit ? "auto" : "smooth" });
      else toutIlluminer(false);
    });
    cachettes.forEach((c) => c.addEventListener("click", () => trouver(c.dataset.id)));

    // ---- lanterne 2D (sans WebGL) ----
    const rayon = () => Math.max(110, Math.min(190, jardin.clientWidth * 0.13));
    let cible = { x: jardin.clientWidth * 0.5, y: jardin.clientHeight * 0.72 }, pos = { ...cible }, raf = 0, bouge = false, promenade = 0;
    function verifier() {
      const r = rayon() * 0.55, jb = jardin.getBoundingClientRect();
      cachettes.forEach((c) => {
        const b = c.getBoundingClientRect();
        if (Math.hypot(b.left + b.width / 2 - jb.left - pos.x, b.top + b.height / 2 - jb.top - pos.y) < r + b.width * 0.25) trouver(c.dataset.id);
      });
    }
    function boucle() {
      raf = 0;
      if (API.mode3D) return;
      pos.x += (cible.x - pos.x) * 0.16;
      pos.y += (cible.y - pos.y) * 0.16;

      lueur.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -50%)`;
      if (bouge && !API.illumine) verifier();
      if (Math.abs(cible.x - pos.x) + Math.abs(cible.y - pos.y) > 0.5) raf = requestAnimationFrame(boucle);
    }
    const lancer = () => { if (!raf && !API.mode3D) raf = requestAnimationFrame(boucle); };
    function suivre(e) {
      if (API.mode3D || API.illumine) return;
      const b = jardin.getBoundingClientRect();
      cible = { x: e.clientX - b.left, y: e.clientY - b.top };
      bouge = true;
      lancer();
    }
    jardin.addEventListener("pointermove", suivre);
    jardin.addEventListener("pointerdown", suivre);
    function demarrerPromenade() {
      if (reduit) return;
      let t = 0;
      clearInterval(promenade);
      promenade = setInterval(() => {
        if (bouge || API.mode3D) return clearInterval(promenade);
        t += 1;
        cible = { x: jardin.clientWidth * (0.5 + 0.3 * Math.sin(t / 2)), y: jardin.clientHeight * (0.72 + 0.06 * Math.cos(t / 1.3)) };
        lancer();
      }, 900);
    }
    cachettes.forEach((c) => c.addEventListener("focus", () => {
      alignerBulle(c);
      if (API.mode3D) return;
      const jb = jardin.getBoundingClientRect(), b = c.getBoundingClientRect();
      cible = { x: b.left - jb.left + b.width / 2, y: b.top - jb.top + b.height / 2 };
      lancer();
    }));
    function passer3D() {
      API.mode3D = true;
      jardin.classList.add("jardin--3d");
      cancelAnimationFrame(raf);
      raf = 0;
      clearInterval(promenade);
    }
    function passer2D() {
      API.mode3D = false;
      jardin.classList.remove("jardin--3d", "jardin--pret");
      cachettes.forEach((c) => { c.style.transform = ""; c.style.width = ""; });
      lancer();
      demarrerPromenade();
    }
    lancer();
    demarrerPromenade();
    if (reduit) toutIlluminer(false);
  }

  /* ====== FORMULAIRE DE COMMANDE ====== */
  const fCommande = $("#form-commande");
  if (fCommande) {
    const zone = $("#commande-lignes");
    const ordre = [...CREATURES].sort((a, b) => (panier[b.id] > 0) - (panier[a.id] > 0));
    zone.innerHTML = `<ul class="lignes">${ordre.map((c) => ligneHTML(c, panier[c.id] || 0)).join("")}</ul>`;
    const out = $("#commande-total");
    const resume = $("#commande-resume");
    function majCommande() {
      const lignes = CREATURES.filter((c) => panier[c.id] > 0);
      $$(".ligne", zone).forEach((li) => li.classList.toggle("active", (panier[li.dataset.id] || 0) > 0));
      out.value = argent(totalPanier());
      out.textContent = argent(totalPanier());
      resume.value = lignes.map((c) => `${c.num} ${c.nom} × ${panier[c.id]} = ${argent(c.prix * panier[c.id])}`).join("\n") + `\nTotal : ${argent(totalPanier())}`;
    }
    brancherLignes(zone, (id, q) => { fixer(id, q); majCommande(); });
    majCommande();

    fCommande.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = $("#commande-msg");
      msg.className = "form-msg";
      if (!nbArticles()) {
        msg.textContent = "Choisis au moins une créature avant d’envoyer ta commande.";
        msg.classList.add("err");
        zone.scrollIntoView({ block: "center" });
        return;
      }
      if (!fCommande.reportValidity()) return;
      if (fCommande._gotcha.value) return; // robot
      majCommande();
      const donnees = new FormData(fCommande);
      donnees.set("_subject", `Nouvelle commande Minitaure — ${donnees.get("nom")}`);
      donnees.set("total", argent(totalPanier()));
      envoyer(FORMSPREE_COMMANDE, donnees, fCommande, msg, () => {
        panier = {};
        sauver();
        fCommande.closest(".panneau").innerHTML = `<div class="merci" role="status"><img src="${img("noki")}" alt="" width="120" height="120"><h2>Merci, c’est noté !</h2><p>Ta commande est bien partie. Nous te contactons rapidement pour confirmer la livraison. Le paiement se fait à la livraison.</p><p style="margin-top:1.5rem"><a class="btn btn--plein" href="index.html">Retour au jardin</a></p></div>`;
        $("#commande-recap")?.remove();
        son.arpege();
        scrollTo({ top: 0, behavior: reduit ? "auto" : "smooth" });
      });
    });
  }

  /* ====== FORMULAIRE DE CONTACT ====== */
  const fContact = $("#form-contact");
  if (fContact) {
    fContact.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = $("#contact-msg");
      msg.className = "form-msg";
      if (!fContact.reportValidity()) return;
      if (fContact._gotcha.value) return;
      const d = new FormData(fContact);
      d.set("_subject", `Minitaure — ${d.get("sujet")}`);
      envoyer(FORMSPREE_CONTACT, d, fContact, msg, () => {
        fContact.innerHTML = `<div class="merci" role="status"><img src="${img("gribou")}" alt="" width="120" height="120"><h2>Message reçu !</h2><p>Nous te répondons sous 48 heures.</p></div>`;
      });
    });
  }

  async function envoyer(url, donnees, form, msg, ok) {
    const bouton = $("[type=submit]", form) || $("[type=submit]");
    // Formspree pas encore configuré : on ouvre le logiciel de courriel avec le contenu
    if (url.includes("VOTRE_ID")) {
      const corps = [...donnees.entries()].filter(([k]) => !k.startsWith("_") && !k.startsWith("qte-")).map(([k, v]) => `${k} : ${v}`).join("\n");
      location.href = `mailto:${COURRIEL}?subject=${encodeURIComponent(donnees.get("_subject"))}&body=${encodeURIComponent(corps)}`;
      msg.textContent = "Ton logiciel de courriel s’ouvre avec ton message prérempli. Il ne reste qu’à l’envoyer.";
      return;
    }
    bouton.disabled = true;
    const t = bouton.textContent;
    bouton.textContent = "Envoi en cours…";
    try {
      const r = await fetch(url, { method: "POST", body: donnees, headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(r.status);
      ok();
    } catch (_) {
      msg.innerHTML = `Oups, l’envoi n’a pas fonctionné. Réessaie ou écris-nous à <a href="mailto:${COURRIEL}">${COURRIEL}</a>.`;
      msg.classList.add("err");
      bouton.disabled = false;
      bouton.textContent = t;
    }
  }

  majPanier();
  addEventListener("storage", (e) => {
    if (e.key !== CLE) return;
    try { panier = JSON.parse(e.newValue) || {}; } catch (_) { panier = {}; }
    majPanier();
  });
})();
