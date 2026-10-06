/* Minitaure — panier, navigation, jardin lunaire, formulaires */
(() => {
  "use strict";
  document.documentElement.classList.add("js");

  /* ====== CONFIGURATION ====== */
  // Remplacez VOTRE_ID par l'identifiant de votre formulaire Formspree (formspree.io/f/xxxxxx)
  const FORMSPREE_COMMANDE = "https://formspree.io/f/VOTRE_ID";
  const FORMSPREE_CONTACT = "https://formspree.io/f/VOTRE_ID";
  const COURRIEL = "ibrahimkalil2024@gmail.com";

  const CREATURES = [
    { id: "minotaure", num: "001", nom: "Minotaure", prix: 6, lore: "Aime collectionner les siestes dans les poches de manteau." },
    { id: "gribou", num: "002", nom: "Gribou", prix: 6, lore: "Apparaît lorsqu’une personne fredonne très doucement." },
    { id: "bloop", num: "003", nom: "Bloop", prix: 6, lore: "Adore les flaques, mais seulement celles qui ressemblent à des ronds de lune." },
    { id: "noki", num: "004", nom: "Noki", prix: 6, lore: "Rit si fort qu’on l’entend avant de le voir scintiller." },
    { id: "pipo", num: "005", nom: "Pipo", prix: 6, lore: "Connaît le chemin secret derrière chaque pot de fleurs." },
  ];
  const parId = Object.fromEntries(CREATURES.map((c) => [c.id, c]));
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const argent = (n) => `${n.toLocaleString("fr-CA")} $`;
  const img = (id) => `assets/creatures/${id}.svg`;

  /* ====== PANIER (localStorage, protégé) ====== */
  const CLE = "minitaure-panier";
  let panier = {};
  try { panier = JSON.parse(localStorage.getItem(CLE)) || {}; } catch (_) { panier = {}; }
  const nettoyer = () => { for (const k of Object.keys(panier)) if (!parId[k] || !(panier[k] > 0)) delete panier[k]; };
  nettoyer();
  const sauver = () => { nettoyer(); try { localStorage.setItem(CLE, JSON.stringify(panier)); } catch (_) {} majPanier(); };
  const nbArticles = () => Object.values(panier).reduce((a, b) => a + b, 0);
  const totalPanier = () => Object.entries(panier).reduce((t, [k, q]) => t + parId[k].prix * q, 0);
  const fixer = (id, q) => { panier[id] = Math.max(0, Math.min(99, q | 0)); sauver(); };
  const ajouter = (id, q = 1) => fixer(id, (panier[id] || 0) + q);

  /* ====== NAV mobile ====== */
  const header = $(".header");
  const menuBtn = $(".menu-btn");
  menuBtn?.addEventListener("click", () => {
    const ouvert = header.classList.toggle("nav-open");
    menuBtn.setAttribute("aria-expanded", ouvert);
  });

  /* ====== TIROIR ====== */
  const tiroir = $("#tiroir");
  const liste = $("#tiroir-liste");
  let dernierFocus = null;
  function ouvrirTiroir() {
    dernierFocus = document.activeElement;
    document.querySelector(".toast")?.classList.remove("vu");
    tiroir.classList.add("ouvert");
    tiroir.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    setTimeout(() => $(".fermer", tiroir).focus(), 50);
  }
  function fermerTiroir() {
    tiroir.classList.remove("ouvert");
    tiroir.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    dernierFocus?.focus();
  }
  $$("[data-ouvrir-panier]").forEach((b) => b.addEventListener("click", ouvrirTiroir));
  $$("[data-fermer-panier]").forEach((b) => b.addEventListener("click", fermerTiroir));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && tiroir?.classList.contains("ouvert")) fermerTiroir();
    if (e.key === "Tab" && tiroir?.classList.contains("ouvert")) {
      const f = $$("button, a[href], input", $(".tiroir__panneau", tiroir)).filter((el) => !el.disabled);
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
      const li = e.target.closest(".ligne"); if (!li) return;
      const inp = $("input", li);
      if (e.target.closest("[data-plus]")) inp.value = Math.min(99, (+inp.value || 0) + 1);
      else if (e.target.closest("[data-moins]")) inp.value = Math.max(0, (+inp.value || 0) - 1);
      else return;
      surChange(li.dataset.id, +inp.value);
    });
    racine.addEventListener("change", (e) => {
      const li = e.target.closest(".ligne"); if (!li) return;
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
    // ne pas reconstruire si l'utilisateur est en train de taper dans le tiroir
    if (!liste.contains(document.activeElement) || document.activeElement.tagName !== "INPUT") {
      liste.innerHTML = items.length
        ? `<ul class="lignes">${items.map(([k, q]) => ligneHTML(parId[k], q, true)).join("")}</ul>`
        : `<div class="tiroir__vide"><img src="${img("minotaure")}" alt="" width="90" height="90"><p>Ton panier est encore vide.<br>Les créatures attendent dans le jardin.</p></div>`;
    }
    $("#tiroir-total").textContent = argent(totalPanier());
    $("#tiroir-commander").toggleAttribute("aria-disabled", !n);
    $("#tiroir-commander").classList.toggle("btn--desactive", !n);
  }

  /* ====== TOAST ====== */
  const toast = document.createElement("div");
  toast.className = "toast"; toast.setAttribute("role", "status");
  document.body.append(toast);
  let tt;
  function annoncer(msg) {
    toast.innerHTML = `<span>${msg}</span><button type="button">Voir le panier</button>`;
    $("button", toast).onclick = () => { toast.classList.remove("vu"); ouvrirTiroir(); };
    toast.classList.add("vu");
    clearTimeout(tt); tt = setTimeout(() => toast.classList.remove("vu"), 3200);
  }

  /* ====== BOUTONS « AJOUTER » ====== */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ajouter]"); if (!b) return;
    const id = b.dataset.ajouter; if (!parId[id]) return;
    ajouter(id, 1);
    $$(".cart-btn").forEach((c) => { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); });
    const txt = b.querySelector("span");
    if (txt) { b.classList.add("ok"); const t = txt.textContent; txt.textContent = "Ajouté !"; setTimeout(() => { txt.textContent = t; b.classList.remove("ok"); }, 1400); }
    annoncer(`${parId[id].nom} est dans ton panier`);
  });

  /* ====== APPARITIONS AU DÉFILEMENT ====== */
  const els = $$(".apparait");
  if ("IntersectionObserver" in window && !reduit) {
    const io = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("vu"); io.unobserve(en.target); } }), { rootMargin: "0px 0px -8% 0px" });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add("vu"));

  /* ====== JARDIN LUNAIRE (accueil) ====== */
  const jardin = $(".jardin");
  if (jardin) {
    const voile = $(".voile", jardin);
    const lueur = $(".lanterne-lueur", jardin);
    const cachettes = $$(".cachette", jardin);
    const points = $$(".compteur__points i", jardin);
    const etat = $("#compteur-texte");
    const trouvees = new Set();
    const ciel = $(".jardin__ciel", jardin);
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("i");
      s.className = "etoile";
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 55}%;animation-delay:${-Math.random() * 4}s;transform:scale(${0.4 + Math.random()})`;
      ciel.append(s);
    }

    const rayon = () => Math.max(110, Math.min(190, jardin.clientWidth * 0.13));
    let cible = { x: jardin.clientWidth * 0.5, y: jardin.clientHeight * 0.72 }, pos = { ...cible }, raf = 0, bougé = false;

    function trouver(c) {
      const id = c.dataset.id;
      cachettes.forEach((o) => o !== c && o.classList.remove("montre"));
      c.classList.add("montre");
      setTimeout(() => c.classList.remove("montre"), 2600);
      if (trouvees.has(id)) return;
      trouvees.add(id);
      c.classList.add("trouvee");
      points.forEach((p, i) => p.classList.toggle("on", i < trouvees.size));
      etat.textContent = trouvees.size === 5 ? "Collection complète !" : `${trouvees.size} / 5 trouvées`;
      if (trouvees.size === 5) toutIlluminer(true);
    }

    function verifier() {
      const r = rayon() * 0.55;
      const jb = jardin.getBoundingClientRect();
      cachettes.forEach((c) => {
        const b = c.getBoundingClientRect();
        const dx = b.left + b.width / 2 - jb.left - pos.x, dy = b.top + b.height / 2 - jb.top - pos.y;
        if (Math.hypot(dx, dy) < r + b.width * 0.25) trouver(c);
      });
    }

    function boucle() {
      pos.x += (cible.x - pos.x) * 0.16;
      pos.y += (cible.y - pos.y) * 0.16;
      voile.style.setProperty("--x", pos.x + "px");
      voile.style.setProperty("--y", pos.y + "px");
      voile.style.setProperty("--r", rayon() + "px");
      lueur.style.transform = `translate(${pos.x - 150}px, ${pos.y - 150}px)`;
      if (bougé) verifier();
      raf = Math.abs(cible.x - pos.x) + Math.abs(cible.y - pos.y) > 0.5 ? requestAnimationFrame(boucle) : 0;
    }
    const lancer = () => { if (!raf) raf = requestAnimationFrame(boucle); };
    function suivre(e) {
      if (jardin.classList.contains("jardin--illumine")) return;
      const b = jardin.getBoundingClientRect();
      cible = { x: e.clientX - b.left, y: e.clientY - b.top };
      bougé = true; lancer();
    }
    jardin.addEventListener("pointermove", suivre);
    jardin.addEventListener("pointerdown", suivre);
    lancer();

    // la lanterne se promène seule tant que personne ne bouge (sauf mouvement réduit)
    if (!reduit) {
      let t = 0;
      const promenade = setInterval(() => {
        if (bougé) return clearInterval(promenade);
        t += 1;
        cible = { x: jardin.clientWidth * (0.5 + 0.3 * Math.sin(t / 2)), y: jardin.clientHeight * (0.72 + 0.06 * Math.cos(t / 1.3)) };
        lancer();
      }, 900);
    }

    cachettes.forEach((c) => {
      c.addEventListener("click", () => trouver(c));
      c.addEventListener("focus", () => { const jb = jardin.getBoundingClientRect(), b = c.getBoundingClientRect(); cible = { x: b.left - jb.left + b.width / 2, y: b.top - jb.top + b.height / 2 }; lancer(); });
    });

    function toutIlluminer(complet) {
      jardin.classList.add("jardin--illumine");
      cachettes.forEach((c, i) => setTimeout(() => c.classList.add("trouvee"), complet ? 0 : i * 140));
      points.forEach((p) => p.classList.add("on"));
      const btn = $("#illuminer");
      if (complet) { etat.textContent = "Collection complète !"; }
      else etat.textContent = "Le jardin est illuminé";
      btn.textContent = "Voir la collection";
      btn.onclick = () => $("#collection").scrollIntoView({ behavior: reduit ? "auto" : "smooth" });
    }
    $("#illuminer").addEventListener("click", () => toutIlluminer(false));
    if (reduit) toutIlluminer(false);
  }

  /* ====== FORMULAIRE DE COMMANDE ====== */
  const fCommande = $("#form-commande");
  if (fCommande) {
    const zone = $("#commande-lignes");
    // créatures déjà choisies en premier
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

    fCommande.addEventListener("submit", async (e) => {
      e.preventDefault();
      const msg = $("#commande-msg");
      msg.className = "form-msg";
      if (!nbArticles()) { msg.textContent = "Choisis au moins une créature avant d’envoyer ta commande."; msg.classList.add("err"); zone.scrollIntoView({ block: "center" }); return; }
      if (!fCommande.reportValidity()) return;
      if (fCommande._gotcha.value) return; // robot
      majCommande();
      const donnees = new FormData(fCommande);
      donnees.set("_subject", `Nouvelle commande Minitaure — ${donnees.get("nom")}`);
      donnees.set("total", argent(totalPanier()));
      envoyer(FORMSPREE_COMMANDE, donnees, fCommande, msg, () => {
        panier = {}; sauver();
        fCommande.closest(".panneau").innerHTML = `<div class="merci" role="status"><img src="${img("noki")}" alt="" width="120" height="120"><h2>Merci, c’est noté !</h2><p>Ta commande est bien partie. Nous te contactons rapidement pour confirmer la livraison. Le paiement se fait à la livraison.</p><p style="margin-top:1.5rem"><a class="btn btn--plein" href="index.html">Retour au jardin</a></p></div>`;
        $("#commande-recap")?.remove();
        scrollTo({ top: 0, behavior: reduit ? "auto" : "smooth" });
      });
    });
  }

  /* ====== FORMULAIRE DE CONTACT ====== */
  const fContact = $("#form-contact");
  if (fContact) {
    fContact.addEventListener("submit", (e) => {
      e.preventDefault();
      const msg = $("#contact-msg"); msg.className = "form-msg";
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
    const bouton = $("[type=submit]", form);
    // Formspree pas encore configuré : on ouvre le logiciel de courriel avec le contenu
    if (url.includes("VOTRE_ID")) {
      const corps = [...donnees.entries()].filter(([k]) => !k.startsWith("_") && !k.startsWith("qte-")).map(([k, v]) => `${k} : ${v}`).join("\n");
      location.href = `mailto:${COURRIEL}?subject=${encodeURIComponent(donnees.get("_subject"))}&body=${encodeURIComponent(corps)}`;
      msg.textContent = "Ton logiciel de courriel s’ouvre avec ton message prérempli. Il ne reste qu’à l’envoyer.";
      return;
    }
    bouton.disabled = true; const t = bouton.textContent; bouton.textContent = "Envoi en cours…";
    try {
      const r = await fetch(url, { method: "POST", body: donnees, headers: { Accept: "application/json" } });
      if (!r.ok) throw new Error(r.status);
      ok();
    } catch (_) {
      msg.innerHTML = `Oups, l’envoi n’a pas fonctionné. Réessaie ou écris-nous à <a href="mailto:${COURRIEL}">${COURRIEL}</a>.`;
      msg.classList.add("err");
      bouton.disabled = false; bouton.textContent = t;
    }
  }

  majPanier();
  window.addEventListener("storage", (e) => { if (e.key === CLE) { try { panier = JSON.parse(e.newValue) || {}; } catch (_) { panier = {}; } majPanier(); } });
})();
