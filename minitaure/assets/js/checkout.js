/* Minitaure — caisse en 4 étapes : panier, coordonnées, livraison, paiement */
(function () {
  const M = window.MINI;
  const TAXES = {
    QC: [["TPS", 0.05], ["TVQ", 0.09975]], ON: [["TVH", 0.13]], NB: [["TVH", 0.15]], NL: [["TVH", 0.15]],
    NS: [["TVH", 0.14]], PE: [["TVH", 0.15]], BC: [["TPS", 0.05], ["TVP", 0.07]], MB: [["TPS", 0.05], ["TVD", 0.07]],
    SK: [["TPS", 0.05], ["TVP", 0.06]], AB: [["TPS", 0.05]], NT: [["TPS", 0.05]], NU: [["TPS", 0.05]], YT: [["TPS", 0.05]],
  };
  const PROVINCES = { QC: "Québec", ON: "Ontario", NB: "Nouveau-Brunswick", NS: "Nouvelle-Écosse", PE: "Île-du-Prince-Édouard", NL: "Terre-Neuve-et-Labrador", MB: "Manitoba", SK: "Saskatchewan", AB: "Alberta", BC: "Colombie-Britannique", YT: "Yukon", NT: "Territoires du Nord-Ouest", NU: "Nunavut" };
  const SHIP = {
    standard: { label: "Standard", sub: "3 à 5 jours ouvrables", price: 5.99 },
    express: { label: "Express fusée 🚀", sub: "1 à 2 jours ouvrables", price: 11.99 },
    pickup: { label: "Cueillette à l'atelier", sub: "Prêt en 24 h · Québec", price: 0 },
  };
  const PROMOS = {
    ETOILE10: { label: "10 % de rabais", calc: (s) => s * 0.1 },
    BIENVENUE: { label: "5 $ de rabais (dès 15 $)", calc: (s) => (s >= 15 ? 5 : 0), min: 15 },
    COSMIQUE: { label: "Livraison gratuite", calc: () => 0, ship: true },
  };
  const GIFT = 2;

  const state = { step: 1, ship: "standard", gift: false, promo: null, prov: "QC" };
  let root;

  function totals() {
    const sub = Cart.subtotal();
    const promo = state.promo && PROMOS[state.promo];
    const disc = promo ? Math.min(sub, promo.calc(sub)) : 0;
    let ship = SHIP[state.ship].price;
    if (state.ship === "standard" && sub - disc >= Cart.FREE_SHIP) ship = 0;
    if (promo && promo.ship) ship = 0;
    const gift = state.gift ? GIFT : 0;
    const base = Math.max(0, sub - disc) + ship + gift;
    const taxes = (TAXES[state.prov] || TAXES.QC).map(([n, r]) => [n, r, Math.round(base * r * 100) / 100]);
    const total = base + taxes.reduce((s, t) => s + t[2], 0);
    return { sub, disc, ship, gift, taxes, total };
  }

  /* ---------- Résumé (colonne de droite) ---------- */
  function renderSummary() {
    const el = document.getElementById("summary");
    if (!el) return;
    const t = totals();
    const pct = (r) => (r * 100).toFixed(3).replace(/\.?0+$/, "").replace(".", ",") + " %";
    el.innerHTML = `<div class="panel">
      <h3 style="margin:0">Ta commande</h3>
      <div class="sum-items">${Cart.items().map(({ qty, p }) => `<div class="sum-item">${Cart.thumb(p)}<b>${qty}</b></div><span>${p.nom}<br><small style="color:var(--muted)">${p.sous}</small></span><strong>${M.prix(p.prix * qty)}</strong></div>`).join("")}</div>
      <div class="promo"><input id="promoIn" placeholder="Code promo" aria-label="Code promo" value="${state.promo || ""}"><button class="btn btn-violet btn-sm" id="promoBtn" type="button">${state.promo ? "Retirer" : "Appliquer"}</button></div>
      <div class="promo-msg ${state.promo ? "ok" : ""}" id="promoMsg">${state.promo ? "✓ " + PROMOS[state.promo].label : "Essaie le code <b>ETOILE10</b> ✦"}</div>
      <div class="totals">
        <div class="row"><span>Sous-total</span><span>${M.prix(t.sub)}</span></div>
        ${t.disc ? `<div class="row" style="color:#12946f"><span>Rabais (${state.promo})</span><span>− ${M.prix(t.disc)}</span></div>` : ""}
        <div class="row"><span>Livraison · ${SHIP[state.ship].label.replace(" 🚀", "")}</span><span>${t.ship ? M.prix(t.ship) : "Gratuite"}</span></div>
        ${t.gift ? `<div class="row"><span>Emballage cadeau</span><span>${M.prix(t.gift)}</span></div>` : ""}
        ${t.taxes.map(([n, r, v]) => `<div class="row"><span>${n} (${pct(r)})</span><span>${M.prix(v)}</span></div>`).join("")}
        <div class="row grand"><span>Total</span><span>${M.prix(t.total)}</span></div>
      </div>
      <div class="secure">${UI.I.lock} Paiement sécurisé · Taxes de ${PROVINCES[state.prov]}</div>
    </div>`;
    el.querySelector("#promoBtn").addEventListener("click", applyPromo);
    el.querySelector("#promoIn").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyPromo(); } });
    const pay = document.getElementById("payAmount");
    if (pay) pay.textContent = M.prix(t.total);
  }
  function applyPromo() {
    if (state.promo) { state.promo = null; renderSummary(); return; }
    const code = document.getElementById("promoIn").value.trim().toUpperCase();
    const p = PROMOS[code];
    if (!p) { const m = document.getElementById("promoMsg"); m.className = "promo-msg bad"; m.textContent = "Ce code n'existe pas… encore!"; return; }
    if (p.min && Cart.subtotal() < p.min) { const m = document.getElementById("promoMsg"); m.className = "promo-msg bad"; m.textContent = `Ce code demande un panier de ${p.min} $ et plus.`; return; }
    state.promo = code;
    renderSummary();
    UI.toast(`Code <b>${code}</b> appliqué!`);
  }

  /* ---------- Étape 1 : panier ---------- */
  function renderCartPane() {
    const el = document.getElementById("pane1list");
    el.innerHTML = Cart.items().map(({ id, qty, p }) => `
      <div class="line-item">${Cart.thumb(p)}</div>
        <div><h4>${p.nom}</h4><div class="sub">${p.sous} · ${p.prix} $</div>
          <div class="qty"><button type="button" data-act="dec" data-id="${id}" aria-label="Retirer un">−</button><span>${qty}</span><button type="button" data-act="inc" data-id="${id}" aria-label="Ajouter un">+</button></div></div>
        <div class="line-right"><strong>${M.prix(p.prix * qty)}</strong><button type="button" class="remove" data-act="rm" data-id="${id}">Retirer</button></div>
      </div>`).join("");
  }

  /* ---------- Validation ---------- */
  function luhn(num) {
    let s = 0, dbl = false;
    for (let i = num.length - 1; i >= 0; i--) {
      let d = +num[i];
      if (dbl) { d *= 2; if (d > 9) d -= 9; }
      s += d; dbl = !dbl;
    }
    return s % 10 === 0;
  }
  const RULES = {
    email: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
    prenom: (v) => v.trim().length > 0,
    nom: (v) => v.trim().length > 0,
    adresse: (v) => v.trim().length > 3,
    ville: (v) => v.trim().length > 1,
    postal: (v) => /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z] ?\d[ABCEGHJ-NPRSTV-Z]\d$/i.test(v.trim()),
    tel: (v) => !v.trim() || v.replace(/\D/g, "").length >= 10,
    carte: (v) => { const d = v.replace(/\D/g, ""); return d.length >= 13 && d.length <= 19 && luhn(d); },
    titulaire: (v) => v.trim().length > 2,
    exp: (v) => {
      const m = v.match(/^(\d{2})\s?\/\s?(\d{2})$/);
      if (!m) return false;
      const mo = +m[1], yr = 2000 + +m[2], now = new Date();
      return mo >= 1 && mo <= 12 && (yr > now.getFullYear() || (yr === now.getFullYear() && mo >= now.getMonth() + 1));
    },
    cvc: (v) => /^\d{3,4}$/.test(v.trim()),
  };
  function validate(pane) {
    let first = null;
    pane.querySelectorAll("[data-rule]").forEach((el) => {
      const ok = RULES[el.dataset.rule](el.value);
      el.closest(".field").classList.toggle("invalid", !ok);
      if (!ok && !first) first = el;
    });
    if (first) first.focus();
    return !first;
  }

  /* ---------- Navigation entre étapes ---------- */
  function go(n) {
    if (n > state.step) {
      for (let s = state.step; s < n; s++) {
        const pane = root.querySelector(`[data-pane="${s}"]`);
        if (s === 1 && !Cart.count()) return;
        if (!validate(pane)) return;
      }
    }
    state.step = n;
    root.querySelectorAll(".step-pane").forEach((p) => p.classList.toggle("active", +p.dataset.pane === n));
    root.querySelectorAll(".stepper button").forEach((b) => {
      const k = +b.dataset.go;
      b.classList.toggle("current", k === n);
      b.classList.toggle("done", k < n);
      b.disabled = k > n;
      b.setAttribute("aria-current", k === n ? "step" : "false");
    });
    if (n === 3) document.getElementById("pickupNote").textContent = state.prov === "QC" ? "" : "La cueillette est offerte seulement au Québec.";
    const top = root.getBoundingClientRect().top + window.scrollY - 100;
    if (window.scrollY > top) window.scrollTo({ top, behavior: "smooth" });
  }

  function emptyState() {
    const img = Mini3D.portrait(M.creature("pipo"), 360);
    root.innerHTML = `<div class="panel" style="grid-column:1/-1"><div class="empty-state">${img ? `<img src="${img}" alt="">` : ""}<h4>Ton panier est tout vide</h4><p>Pipo a cherché partout… aucune créature ici!</p><a class="btn" href="boutique.html">Visiter la boutique ${UI.I.arrow}</a></div></div>`;
  }

  /* ---------- Confirmation ---------- */
  function confirmOrder() {
    const pane = root.querySelector('[data-pane="4"]');
    if (!validate(pane)) return;
    const btn = document.getElementById("payBtn");
    btn.disabled = true;
    btn.innerHTML = "Les étoiles s'alignent…";
    setTimeout(() => {
      const t = totals();
      const items = Cart.items();
      const no = "MT-" + Date.now().toString(36).toUpperCase().slice(-6);
      const firstCreature = items.find((l) => l.p.type === "creature");
      const hero = M.creature(firstCreature ? firstCreature.p.creature : "lumy");
      const email = document.getElementById("email").value;
      const prenom = document.getElementById("prenom").value.trim();
      const hasMystery = items.some((l) => l.p.type === "sachet");
      try { localStorage.setItem("minitaure-last-order", JSON.stringify({ no, total: t.total, date: new Date().toISOString(), items: items.map((l) => ({ id: l.id, qty: l.qty })) })); } catch (e) {}
      Cart.clear();
      root.innerHTML = `<div class="panel confirm" style="grid-column:1/-1">
        <img src="${Mini3D.portrait(hero, 360) || ""}" alt="${hero.nom}">
        <div class="eyebrow" style="justify-content:center;margin-top:10px">${UI.I.sparkle} Commande confirmée</div>
        <h2>Merci ${prenom}! Ta bande est en <em class="accent">route.</em></h2>
        <div class="order-no">N° ${no}</div>
        <p class="lead" style="margin-inline:auto">Un courriel de confirmation sera envoyé à <b>${email.replace(/</g, "&lt;")}</b>. Total payé : <b>${M.prix(t.total)}</b> · Livraison ${SHIP[state.ship].label.toLowerCase().replace(" 🚀", "")} (${SHIP[state.ship].sub.toLowerCase()}).</p>
        ${hasMystery ? `<p style="color:var(--muted)">Psst… tes sachets mystère gardent leur secret jusqu'à l'ouverture. Bonne chance! ✦</p>` : ""}
        <div class="hero-ctas" style="justify-content:center"><a class="btn" href="creatures.html">Cocher ma collection ${UI.I.arrow}</a><a class="btn btn-ghost" href="index.html">Retour à l'accueil</a></div>
      </div>`;
      UI.confetti();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 1400);
  }

  /* ---------- Construction ---------- */
  function build() {
    root = document.getElementById("checkout");
    if (!Cart.count()) { emptyState(); return; }
    const provOpts = Object.entries(PROVINCES).map(([k, v]) => `<option value="${k}" ${k === "QC" ? "selected" : ""}>${v}</option>`).join("");
    const f = (id, label, rule, attrs, err) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${rule ? `data-rule="${rule}"` : ""} ${attrs || ""}><span class="err">${err || "Ce champ est requis."}</span></div>`;
    root.innerHTML = `
      <div>
        <div class="stepper" role="list">
          ${["Panier", "Coordonnées", "Livraison", "Paiement"].map((l, i) => `<button type="button" data-go="${i + 1}" role="listitem"><span class="n">${i + 1}</span><span class="lbl">${l}</span></button>`).join("")}
        </div>
        <div class="panel">
          <section class="step-pane" data-pane="1">
            <h2>Ton <em class="accent">panier</em></h2>
            <div class="drawer-items" style="padding:0" id="pane1list"></div>
            <div class="pane-nav"><a class="link-arrow" href="boutique.html">${UI.I.left} Continuer à magasiner</a><button class="btn" type="button" data-next="2">Mes coordonnées ${UI.I.arrow}</button></div>
          </section>
          <section class="step-pane" data-pane="2">
            <h2>Où vit ta <em class="accent">bande?</em></h2>
            ${f("email", "Courriel", "email", 'type="email" autocomplete="email" placeholder="toi@exemple.ca"', "Entre un courriel valide.")}
            <div class="field-row">${f("prenom", "Prénom", "prenom", 'autocomplete="given-name"')}${f("nom", "Nom", "nom", 'autocomplete="family-name"')}</div>
            ${f("adresse", "Adresse", "adresse", 'autocomplete="street-address" placeholder="123, rue des Étoiles"')}
            <div class="field-row three">${f("ville", "Ville", "ville", 'autocomplete="address-level2"')}
              <div class="field"><label for="prov">Province</label><select id="prov" autocomplete="address-level1">${provOpts}</select></div>
              ${f("postal", "Code postal", "postal", 'autocomplete="postal-code" placeholder="H2X 1Y4" maxlength="7"', "Ex. : H2X 1Y4")}</div>
            ${f("tel", "Téléphone (facultatif)", "tel", 'type="tel" autocomplete="tel"', "Au moins 10 chiffres.")}
            <div class="pane-nav"><button class="btn btn-ghost btn-sm" type="button" data-next="1">${UI.I.left} Retour</button><button class="btn" type="button" data-next="3">Choisir la livraison ${UI.I.arrow}</button></div>
          </section>
          <section class="step-pane" data-pane="3">
            <h2>Comment voyage ta <em class="accent">bande?</em></h2>
            ${Object.entries(SHIP).map(([k, s]) => `<label class="choice"><input type="radio" name="ship" value="${k}" ${k === state.ship ? "checked" : ""}><span class="grow"><b>${s.label}</b><small>${s.sub}</small></span><span class="tag" data-ship-price="${k}"></span></label>`).join("")}
            <small id="pickupNote" style="color:var(--coral);font-weight:600"></small>
            <label class="choice" style="margin-top:18px"><input type="checkbox" id="gift"><span class="grow"><b>🎁 Emballage cadeau étoilé</b><small>Papier de nuit, ruban doré et petit mot</small></span><span class="tag">+2 $</span></label>
            <div class="field" id="giftMsgWrap" style="display:none"><label for="giftMsg">Petit mot pour le cadeau</label><input id="giftMsg" maxlength="120" placeholder="Bonne fête, petite étoile!"></div>
            <div class="pane-nav"><button class="btn btn-ghost btn-sm" type="button" data-next="2">${UI.I.left} Retour</button><button class="btn" type="button" data-next="4">Passer au paiement ${UI.I.arrow}</button></div>
          </section>
          <section class="step-pane" data-pane="4">
            <h2>Dernière <em class="accent">étape!</em></h2>
            <div class="demo-note">🔒 <span><b>Boutique de démonstration</b> — aucun paiement réel n'est effectué. Essaie la carte <b>4242 4242 4242 4242</b>.</span></div>
            <div class="card-preview" id="cardPreview"><div class="row"><span class="chip-ico"></span><span style="font-family:var(--f-display);font-size:1.3rem;font-weight:700">minitaure</span></div>
              <div class="num" id="cpNum">•••• •••• •••• ••••</div>
              <div class="meta"><span id="cpName">TON NOM</span><span id="cpExp">MM/AA</span></div></div>
            ${f("carte", "Numéro de carte", "carte", 'inputmode="numeric" autocomplete="cc-number" placeholder="1234 5678 9012 3456" maxlength="23"', "Ce numéro de carte n'est pas valide.")}
            ${f("titulaire", "Nom sur la carte", "titulaire", 'autocomplete="cc-name"')}
            <div class="field-row">${f("exp", "Expiration", "exp", 'inputmode="numeric" autocomplete="cc-exp" placeholder="MM/AA" maxlength="5"', "Date invalide ou expirée.")}${f("cvc", "CVC", "cvc", 'inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4"', "3 ou 4 chiffres.")}</div>
            <div class="pane-nav"><button class="btn btn-ghost btn-sm" type="button" data-next="3">${UI.I.left} Retour</button><button class="btn btn-mint" type="button" id="payBtn">${UI.I.lock} Payer <span id="payAmount"></span></button></div>
          </section>
        </div>
      </div>
      <aside class="summary" id="summary" aria-label="Résumé de la commande"></aside>`;

    renderCartPane();
    renderSummary();
    updateShipPrices();

    root.addEventListener("click", (e) => {
      const nx = e.target.closest("[data-next]");
      if (nx) go(+nx.dataset.next);
      const st = e.target.closest(".stepper button");
      if (st && !st.disabled) go(+st.dataset.go);
      const a = e.target.closest("[data-act]");
      if (a) {
        const id = a.dataset.id, line = Cart.items().find((l) => l.id === id);
        if (a.dataset.act === "inc") Cart.set(id, line.qty + 1);
        if (a.dataset.act === "dec") Cart.set(id, line.qty - 1);
        if (a.dataset.act === "rm") Cart.remove(id);
      }
    });
    root.querySelector("#payBtn").addEventListener("click", confirmOrder);
    root.querySelectorAll('input[name="ship"]').forEach((r) => r.addEventListener("change", () => { state.ship = r.value; renderSummary(); }));
    root.querySelector("#gift").addEventListener("change", (e) => { state.gift = e.target.checked; root.querySelector("#giftMsgWrap").style.display = state.gift ? "" : "none"; renderSummary(); });
    root.querySelector("#prov").addEventListener("change", (e) => {
      state.prov = e.target.value;
      if (state.prov !== "QC" && state.ship === "pickup") { state.ship = "standard"; root.querySelector('input[value="standard"]').checked = true; }
      root.querySelector('input[value="pickup"]').disabled = state.prov !== "QC";
      renderSummary();
    });
    root.querySelectorAll("[data-rule]").forEach((el) => el.addEventListener("input", () => {
      if (el.closest(".field").classList.contains("invalid") && RULES[el.dataset.rule](el.value)) el.closest(".field").classList.remove("invalid");
    }));

    // mise en forme des champs de carte + aperçu
    const num = root.querySelector("#carte"), exp = root.querySelector("#exp"), name = root.querySelector("#titulaire"), cvc = root.querySelector("#cvc");
    num.addEventListener("input", () => {
      const d = num.value.replace(/\D/g, "").slice(0, 19);
      num.value = d.replace(/(.{4})/g, "$1 ").trim();
      root.querySelector("#cpNum").textContent = (d + "•".repeat(Math.max(0, 16 - d.length))).replace(/(.{4})/g, "$1 ").trim();
    });
    exp.addEventListener("input", (e) => {
      let d = exp.value.replace(/\D/g, "").slice(0, 4);
      if (d.length >= 3 || (d.length === 2 && e.inputType !== "deleteContentBackward")) d = d.slice(0, 2) + "/" + d.slice(2);
      exp.value = d;
      root.querySelector("#cpExp").textContent = d || "MM/AA";
    });
    name.addEventListener("input", () => { root.querySelector("#cpName").textContent = name.value.toUpperCase() || "TON NOM"; });
    cvc.addEventListener("input", () => { cvc.value = cvc.value.replace(/\D/g, "").slice(0, 4); });
    cvc.addEventListener("focus", () => { root.querySelector("#cardPreview").style.transform = "rotateY(12deg) scale(.98)"; });
    cvc.addEventListener("blur", () => { root.querySelector("#cardPreview").style.transform = ""; });
    root.querySelector("#postal").addEventListener("blur", (e) => {
      const v = e.target.value.replace(/\s/g, "").toUpperCase();
      if (v.length === 6) e.target.value = v.slice(0, 3) + " " + v.slice(3);
    });

    go(1);
  }

  function updateShipPrices() {
    if (!root) return;
    const sub = Cart.subtotal();
    root.querySelectorAll("[data-ship-price]").forEach((el) => {
      const k = el.dataset.shipPrice;
      const free = k === "pickup" || (k === "standard" && sub >= Cart.FREE_SHIP);
      el.textContent = free ? "Gratuit" : SHIP[k].price.toFixed(2).replace(".", ",") + " $";
    });
  }

  document.addEventListener("cart:change", () => {
    if (!root || !document.getElementById("summary")) return;
    if (!Cart.count()) { emptyState(); return; }
    renderCartPane(); renderSummary(); updateShipPrices();
  });
  document.addEventListener("ui:ready", build);
})();
