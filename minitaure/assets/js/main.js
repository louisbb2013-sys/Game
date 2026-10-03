/* Minitaure — interface commune à toutes les pages */
(function () {
  const M = window.MINI;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- Icônes ---------- */
  const I = {
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="14" rx="3"/><path d="M8.5 7V6a3.5 3.5 0 0 1 7 0v1M9 12a3 3 0 0 0 6 0"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    sparkle: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" opacity=".7"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"><path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.3 4 4 7.4 4c2 0 3.4 1.1 4.6 2.7C13.2 5.1 14.6 4 16.6 4 20 4 22.4 7.3 21.2 10.7 19.5 15.4 12 20 12 20z"/></svg>',
    hand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-4.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.6a6 6 0 0 1-4.6-2.2L3.5 15a1.6 1.6 0 0 1 2.4-2.1L9 15"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    moon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>',
    insta: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  };

  const LOGO = `<svg class="logo-mark" viewBox="0 0 40 40" aria-hidden="true">
    <circle cx="20" cy="23" r="13" fill="none" stroke="currentColor" stroke-width="3"/>
    <path d="M20 10c0-4 2-6.5 5.5-7-0.5 3.5-2.5 6-5.5 7z" fill="#3ee0b5"/>
    <path d="M20 10c-1-2.5-3-3.8-5.5-3.8 0.8 2.4 2.7 3.6 5.5 3.8z" fill="#3ee0b5"/>
    <circle cx="15.5" cy="22" r="1.8" fill="currentColor"/><circle cx="24.5" cy="22" r="1.8" fill="currentColor"/>
    <path d="M17.5 27q2.5 2 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  </svg>`;

  /* ---------- Illustrations SVG des produits non-créatures ---------- */
  function bagSVG(id, hue) {
    const a = hue || "#b9a6ff", b = "#8a72f0";
    return `<svg class="svg-art" viewBox="0 0 200 220" aria-hidden="true">
      <defs>
        <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
        <linearGradient id="sh${id}" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".45" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <ellipse cx="100" cy="206" rx="70" ry="9" fill="#2b1d8f" opacity=".25"/>
      <path d="M38 34 L162 34 L170 190 Q100 204 30 190 Z" fill="url(#bg${id})"/>
      <path d="M38 34 L162 34 L163 50 L37 50 Z" fill="#6b4fe0"/>
      <path d="M38 34 l6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8 6 -8 6 8" fill="#6b4fe0"/>
      <path d="M38 34 L162 34 L170 190 Q100 204 30 190 Z" fill="url(#sh${id})"/>
      <g fill="#fff" opacity=".9">
        <path d="M60 80l3 8 8 3-8 3-3 8-3-8-8-3 8-3z"/><path d="M140 120l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>
        <path d="M70 160l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/><path d="M145 70l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"/>
      </g>
      <path d="M150 182a10 10 0 1 1-5-18 7.5 7.5 0 0 0 5 18z" fill="#fff" opacity=".85"/>
      <circle cx="100" cy="112" r="24" fill="none" stroke="#fff" stroke-width="3"/>
      <text x="100" y="121" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-size="26" fill="#fff">m</text>
      <text x="100" y="158" text-anchor="middle" font-family="Space Mono, monospace" font-size="12" fill="#fff" letter-spacing="1">mystère!</text>
    </svg>`;
  }
  function trioSVG() {
    return `<svg class="svg-art" viewBox="0 0 260 220" aria-hidden="true">
      <g transform="translate(0 20) rotate(-10 60 110) scale(.62)">${bagSVG("t1", "#9fe8d6").replace(/<\/?svg[^>]*>/g, "")}</g>
      <g transform="translate(140 10) rotate(10 60 110) scale(.62)">${bagSVG("t2", "#ffb8dd").replace(/<\/?svg[^>]*>/g, "")}</g>
      <g transform="translate(65 0) scale(.72)">${bagSVG("t3").replace(/<\/?svg[^>]*>/g, "")}</g>
    </svg>`;
  }
  function cardsSVG() {
    const card = (rot, x, c1, c2, s) => `<g transform="rotate(${rot} ${x + 50} 190)">
      <rect x="${x}" y="40" width="100" height="140" rx="12" fill="${c1}" stroke="#fff" stroke-width="5"/>
      <rect x="${x + 10}" y="50" width="80" height="80" rx="8" fill="${c2}"/>
      <circle cx="${x + 50}" cy="94" r="24" fill="#fff" opacity=".9"/>
      <circle cx="${x + 43}" cy="92" r="3.5" fill="#1d1650"/><circle cx="${x + 57}" cy="92" r="3.5" fill="#1d1650"/>
      <rect x="${x + 14}" y="140" width="60" height="8" rx="4" fill="#fff" opacity=".8"/>
      <rect x="${x + 14}" y="154" width="40" height="6" rx="3" fill="#fff" opacity=".5"/>
      <text x="${x + 82}" y="165" font-size="16" fill="#ffd23f">${s}</text>
    </g>`;
    return `<svg class="svg-art" viewBox="0 0 240 220" aria-hidden="true">
      <ellipse cx="120" cy="206" rx="80" ry="8" fill="#2b1d8f" opacity=".2"/>
      ${card(-16, 40, "#3ee0b5", "#2b9d84", "★")}${card(0, 70, "#ff8fcf", "#d65aa0", "★")}${card(16, 100, "#6b3fd6", "#4524a6", "✦")}
    </svg>`;
  }
  function albumSVG() {
    return `<svg class="svg-art" viewBox="0 0 220 220" aria-hidden="true">
      <ellipse cx="110" cy="204" rx="78" ry="8" fill="#2b1d8f" opacity=".22"/>
      <rect x="40" y="30" width="140" height="170" rx="14" fill="#2b2496"/>
      <rect x="40" y="30" width="22" height="170" rx="10" fill="#1d1650"/>
      <rect x="70" y="44" width="98" height="142" rx="10" fill="#3b2fb8"/>
      <g stroke="#ffd23f" stroke-width="1.5" opacity=".8" fill="none"><path d="M85 80 L110 65 L140 85 L155 70 M110 65 L118 110 L150 130"/></g>
      <g fill="#fff"><circle cx="85" cy="80" r="3"/><circle cx="110" cy="65" r="3.5"/><circle cx="140" cy="85" r="3"/><circle cx="155" cy="70" r="2.5"/><circle cx="118" cy="110" r="3"/><circle cx="150" cy="130" r="3.5"/></g>
      <text x="119" y="166" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="700" font-style="italic" font-size="20" fill="#ffd23f">ma bande</text>
    </svg>`;
  }
  function productArt(p) {
    if (p.type === "creature") return `<img alt="${p.nom}" data-portrait="${p.creature}" data-size="360">`;
    if (p.id === "trio") return trioSVG();
    if (p.id === "cartes") return cardsSVG();
    if (p.id === "album") return albumSVG();
    return bagSVG(p.id);
  }
  function productAccent(p) {
    if (p.type === "creature") return M.creature(p.creature).accent;
    return { sachet: "#a98bff", trio: "#ff8fcf", cartes: "#3ee0b5", album: "#ffd23f" }[p.id] || "#a98bff";
  }

  /* ---------- Cartes ---------- */
  function productCard(p, opts) {
    opts = opts || {};
    const c = p.type === "creature" ? M.creature(p.creature) : null;
    const badge = !c && p.badge ? `<span class="badge">${p.badge}</span>` : "";
    return `<article class="card tilt ${opts.cls || ""}" style="--accent:${productAccent(p)};--d:${opts.d || 0}s" data-id="${p.id}">
      ${badge}
      <div class="card-media" ${c ? `data-open="${c.id}" role="button" tabindex="0" aria-label="Voir ${c.nom} en 3D"` : ""}>${productArt(p)}</div>
      <div class="card-body">
        <div class="card-kicker">${c ? "Créature à l'unité" : p.type === "sachet" ? "Surprise" : "Collection"}</div>
        <h3>${p.nom}</h3>
        <p class="sub">${p.sous}</p>
        <div class="card-foot">
          <span class="price">${p.prix} $</span>
          <button class="btn btn-dark btn-sm" data-add="${p.id}">Ajouter ${I.bag}</button>
        </div>
      </div>
    </article>`;
  }

  /* ---------- En-tête & pied de page ---------- */
  const PAGES = [
    ["index.html", "Accueil", "accueil"],
    ["boutique.html", "Boutique", "boutique"],
    ["creatures.html", "Les créatures", "creatures"],
    ["a-propos.html", "À propos", "apropos"],
    ["contact.html", "Contact", "contact"],
  ];
  function header() {
    const page = document.body.dataset.page;
    const el = document.createElement("header");
    el.className = "site-header" + (document.body.dataset.dark ? " on-dark" : " solid");
    el.innerHTML = `<div class="container">
      <a class="logo" href="index.html" aria-label="Minitaure, accueil">${LOGO}<span>minitaure</span></a>
      <nav class="nav" id="nav" aria-label="Navigation principale">
        ${PAGES.map(([h, l, k]) => `<a href="${h}" class="${k === page ? "active" : ""}" ${k === page ? 'aria-current="page"' : ""}>${l}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="cart-btn" id="cartBtn" aria-label="Ouvrir le panier">${I.bag}<span class="label">Panier</span><span class="cart-count" id="cartCount">0</span></button>
        <button class="burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav"><span></span></button>
      </div>
    </div>`;
    document.body.prepend(el);
    const burger = el.querySelector("#burger");
    burger.addEventListener("click", () => {
      const open = document.body.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", open);
    });
    el.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => document.body.classList.remove("menu-open")));
    const onScroll = () => el.classList.toggle("scrolled", window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }
  function footer() {
    const el = document.createElement("footer");
    el.className = "site-footer";
    let stars = "";
    for (let i = 0; i < 40; i++) stars += `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 3}s;opacity:${0.3 + Math.random() * 0.7}"></i>`;
    el.innerHTML = `
      <svg class="wave-top" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1440v20c-120 30-240 40-360 20S840 0 720 20 480 60 360 40 120 0 0 30z" fill="var(--sky)"/></svg>
      <div class="footer-stars" aria-hidden="true">${stars}</div>
      <img class="footer-creature" data-portrait="lumy" data-size="240" alt="">
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="logo" href="index.html" style="color:#fff">${LOGO}<span>minitaure</span></a>
            <p style="margin-top:14px">Des petites créatures à découvrir, échanger et aimer très fort.</p>
            <span class="footer-tag">${I.moon} Imaginé avec tendresse au Québec</span>
          </div>
          <div>
            <h4>Explorer</h4>
            <ul><li><a href="boutique.html">La boutique</a></li><li><a href="creatures.html">Les créatures</a></li><li><a href="a-propos.html">Notre histoire</a></li><li><a href="caisse.html">Mon panier</a></li></ul>
          </div>
          <div>
            <h4>Un petit mot?</h4>
            <ul><li><a href="contact.html">Nous écrire</a></li><li><a href="mailto:bonjour@minitaure.ca">bonjour@minitaure.ca</a></li><li><a href="https://instagram.com/minitaure.ca" rel="noopener" target="_blank">${I.insta} @minitaure.ca</a></li></ul>
          </div>
        </div>
        <div class="footer-bottom"><span>© ${new Date().getFullYear()} Minitaure</span><span>Fait de poussière d'étoiles ✦</span></div>
      </div>`;
    document.body.appendChild(el);
  }

  /* ---------- Toasts ---------- */
  function toast(html, img) {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) { wrap = document.createElement("div"); wrap.className = "toast-wrap"; wrap.setAttribute("aria-live", "polite"); document.body.appendChild(wrap); }
    const t = document.createElement("div");
    t.className = "toast";
    t.innerHTML = (img ? `<img src="${img}" alt="">` : `<span class="t-ico">✦</span>`) + `<span>${html}</span>`;
    wrap.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 2600);
  }

  /* ---------- Révélations au défilement ---------- */
  function reveals(root) {
    const els = (root || document).querySelectorAll(".reveal:not(.in), .reveal-pop:not(.in)");
    if (!("IntersectionObserver" in window) || reduced) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- Inclinaison 3D des cartes ---------- */
  function tilt(root) {
    if (reduced || matchMedia("(hover: none)").matches) return;
    (root || document).querySelectorAll(".tilt:not([data-tilt])").forEach((card) => {
      card.dataset.tilt = "1";
      card.addEventListener("pointermove", (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateY(${x * 10}deg) rotateX(${-y * 10}deg) translateY(-6px)`;
      });
      card.addEventListener("pointerleave", () => { card.style.transform = ""; });
    });
  }

  /* ---------- Étincelles qui suivent le curseur ---------- */
  function sparkles() {
    if (reduced || matchMedia("(hover: none)").matches) return;
    const colors = ["#ffd23f", "#ff8fcf", "#3ee0b5", "#8f6bff", "#ff6b57"];
    let last = 0;
    window.addEventListener("pointermove", (e) => {
      const now = performance.now();
      if (now - last < 45) return;
      last = now;
      const s = document.createElement("i");
      s.className = "spark";
      s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px";
      s.style.setProperty("--x", (Math.random() - 0.5) * 50 + "px");
      s.style.setProperty("--y", 20 + Math.random() * 30 + "px");
      s.style.setProperty("--c", colors[(Math.random() * colors.length) | 0]);
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 900);
    }, { passive: true });
  }

  /* ---------- Explosion de confettis ---------- */
  function burst(target, n) {
    const b = document.createElement("div");
    b.className = "burst";
    const colors = ["#ffd23f", "#ff8fcf", "#3ee0b5", "#8f6bff", "#ff6b57", "#ffffff"];
    for (let i = 0; i < (n || 36); i++) {
      const p = document.createElement("i");
      const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 180;
      p.style.setProperty("--x", Math.cos(a) * d + "px");
      p.style.setProperty("--y", Math.sin(a) * d + "px");
      p.style.setProperty("--r", Math.random() * 720 + "deg");
      p.style.background = colors[i % colors.length];
      if (i % 3 === 0) p.style.borderRadius = "50%";
      b.appendChild(p);
    }
    target.appendChild(b);
    setTimeout(() => b.remove(), 1200);
  }
  function confetti() {
    if (reduced) return;
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    const colors = ["#ffd23f", "#ff8fcf", "#3ee0b5", "#8f6bff", "#ff6b57"];
    for (let i = 0; i < 120; i++) {
      const c = document.createElement("i");
      c.style.left = Math.random() * 100 + "%";
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2 + Math.random() * 2.5 + "s";
      c.style.animationDelay = Math.random() * 0.8 + "s";
      layer.appendChild(c);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 5500);
  }

  /* ---------- Ma collection (cœurs) ---------- */
  const COL_KEY = "minitaure-collection";
  function getCollection() { try { return JSON.parse(localStorage.getItem(COL_KEY)) || []; } catch (e) { return []; } }
  function toggleCollection(id) {
    const c = getCollection();
    const i = c.indexOf(id);
    if (i >= 0) c.splice(i, 1); else c.push(id);
    try { localStorage.setItem(COL_KEY, JSON.stringify(c)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("collection:change"));
    return i < 0;
  }

  /* ---------- Modale créature (visionneuse 3D) ---------- */
  let modal, viewerInst;
  function openCreature(id) {
    const c = M.creature(id);
    if (!c) return;
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeCreature(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("open")) closeCreature(); });
    }
    const meter = (n) => Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? "on" : ""}" style="animation-delay:${i * 0.08}s"></i>`).join("");
    const owned = getCollection().includes(c.id);
    let stars = "";
    for (let i = 0; i < 30; i++) stars += `<i style="left:${Math.random() * 100}%;top:${Math.random() * 100}%;animation-delay:${Math.random() * 2.5}s"></i>`;
    modal.innerHTML = `<div class="modal-backdrop" data-close></div>
      <div class="modal-card" style="--accent:${c.accent}" aria-labelledby="mTitle">
        <button class="icon-btn close" data-close aria-label="Fermer">${I.close}</button>
        <div class="modal-3d" id="m3d"><div class="mini-stars">${stars}</div><div class="hint">Glisse pour tourner · clique pour écraser</div></div>
        <div class="modal-info">
          <div class="card-kicker">N° ${c.num} · ${c.habitat}</div>
          <h2 id="mTitle">${c.nom}</h2>
          <div class="species">${c.espece}</div>
          <div class="facts">
            <div class="fact"><span>Humeur</span><strong>${c.humeur}</strong></div>
            <div class="fact"><span>Habitat</span><strong>${c.habitat}</strong></div>
            <div class="fact wide"><span>Étrange habitude</span><strong>${c.habitude}</strong></div>
          </div>
          <div class="stat"><span>Douceur</span><div class="meter">${meter(c.stats.douceur)}</div></div>
          <div class="stat"><span>Rebond</span><div class="meter">${meter(c.stats.rebond)}</div></div>
          <div class="stat"><span>Mystère</span><div class="meter">${meter(c.stats.mystere)}</div></div>
          <div class="modal-actions">
            <span class="price" style="font-size:2rem">6 $</span>
            <button class="btn" data-add="${c.id}">Ajouter au panier ${I.bag}</button>
            <button class="btn btn-ghost btn-sm" data-own="${c.id}">${owned ? "✓ Dans ma collection" : "♡ Je l'ai déjà!"}</button>
          </div>
        </div>
      </div>`;
    modal.querySelector("[data-own]").addEventListener("click", (e) => {
      const on = toggleCollection(c.id);
      e.currentTarget.textContent = on ? "✓ Dans ma collection" : "♡ Je l'ai déjà!";
      if (on) toast(`${c.nom} rejoint ta collection!`, window.Mini3D && Mini3D.portrait(c, 360));
    });
    requestAnimationFrame(() => modal.classList.add("open"));
    document.documentElement.style.overflow = "hidden";
    if (window.Mini3D) {
      viewerInst = Mini3D.viewer(modal.querySelector("#m3d"), c, {
        hops: true,
        onSquish() { burst(modal.querySelector("#m3d"), 14); },
      });
    }
    modal.querySelector(".close").focus({ preventScroll: true });
  }
  function closeCreature() {
    modal.classList.remove("open");
    document.documentElement.style.overflow = "";
    setTimeout(() => { if (viewerInst) { viewerInst.dispose(); viewerInst = null; } }, 300);
  }
  document.addEventListener("click", (e) => {
    const o = e.target.closest("[data-open]");
    if (o) { e.preventDefault(); openCreature(o.dataset.open); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-open]")) { e.preventDefault(); openCreature(e.target.dataset.open); }
  });

  window.UI = {
    I, LOGO, productCard, productArt, productAccent, bagSVG, cardsSVG,
    toast, reveals, tilt, burst, confetti, openCreature, getCollection, toggleCollection, reduced,
  };

  /* ---------- Démarrage ---------- */
  document.addEventListener("DOMContentLoaded", () => {
    header();
    footer();
    document.dispatchEvent(new CustomEvent("ui:ready"));
    reveals();
    tilt();
    sparkles();
    if (window.Mini3D) Mini3D.fillPortraits();
  });
})();
