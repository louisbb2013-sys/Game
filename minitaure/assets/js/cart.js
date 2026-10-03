/* Minitaure — panier (stocké dans le navigateur) et tiroir latéral */
(function () {
  const M = window.MINI;
  const KEY = "minitaure-cart";
  const FREE_SHIP = 35;

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY)) || [];
      return raw.filter((l) => M.produit(l.id) && l.qty > 0);
    } catch (e) { return []; }
  }
  let items = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {}
    document.dispatchEvent(new CustomEvent("cart:change"));
    render();
  }

  const Cart = {
    FREE_SHIP,
    items: () => items.map((l) => ({ ...l, p: M.produit(l.id) })),
    count: () => items.reduce((n, l) => n + l.qty, 0),
    subtotal: () => items.reduce((s, l) => s + M.produit(l.id).prix * l.qty, 0),
    add(id, qty, fromEl) {
      const p = M.produit(id);
      if (!p) return;
      const line = items.find((l) => l.id === id);
      if (line) line.qty = Math.min(99, line.qty + (qty || 1));
      else items.push({ id, qty: qty || 1 });
      save();
      flyToCart(fromEl, p);
      const img = p.type === "creature" && window.Mini3D ? Mini3D.portrait(M.creature(p.creature), 360) : null;
      window.UI && UI.toast(`<b>${p.nom}</b> est dans ton panier!`, img);
    },
    set(id, qty) {
      const line = items.find((l) => l.id === id);
      if (!line) return;
      line.qty = Math.max(0, Math.min(99, qty));
      if (!line.qty) items = items.filter((l) => l !== line);
      save();
    },
    remove(id) { items = items.filter((l) => l.id !== id); save(); },
    clear() { items = []; save(); },
    open() { drawer.classList.add("open"); overlay.classList.add("show"); drawer.setAttribute("aria-hidden", "false"); drawer.querySelector(".icon-btn").focus({ preventScroll: true }); },
    close() { drawer.classList.remove("open"); overlay.classList.remove("show"); drawer.setAttribute("aria-hidden", "true"); },
    thumb(p) {
      const accent = window.UI ? UI.productAccent(p) : "#a98bff";
      if (p.type === "creature") {
        const src = window.Mini3D ? Mini3D.portrait(M.creature(p.creature), 360) : "";
        return `<div class="line-thumb" style="--accent:${accent}">${src ? `<img src="${src}" alt="">` : ""}`;
      }
      return `<div class="line-thumb" style="--accent:${accent}">${UI.productArt(p)}`;
    },
  };
  window.Cart = Cart;

  /* ---------- Tiroir ---------- */
  let drawer, overlay, countEl, btn;
  function build() {
    overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.addEventListener("click", Cart.close);
    drawer = document.createElement("aside");
    drawer.className = "drawer";
    drawer.setAttribute("aria-label", "Panier");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <div class="drawer-head"><h3>Ton panier</h3><button class="icon-btn" aria-label="Fermer le panier">${UI.I.close}</button></div>
      <div class="ship-meter" id="shipMeter"></div>
      <div class="drawer-items" id="drawerItems"></div>
      <div class="drawer-foot" id="drawerFoot"></div>`;
    document.body.append(overlay, drawer);
    drawer.querySelector(".icon-btn").addEventListener("click", Cart.close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) Cart.close(); });
    drawer.addEventListener("click", (e) => {
      const t = e.target.closest("button");
      if (!t) return;
      const id = t.dataset.id;
      if (t.dataset.act === "inc") Cart.set(id, items.find((l) => l.id === id).qty + 1);
      if (t.dataset.act === "dec") Cart.set(id, items.find((l) => l.id === id).qty - 1);
      if (t.dataset.act === "rm") Cart.remove(id);
    });
    btn = document.getElementById("cartBtn");
    countEl = document.getElementById("cartCount");
    btn.addEventListener("click", Cart.open);
    render();
  }

  function render() {
    if (!drawer) return;
    const n = Cart.count(), sub = Cart.subtotal();
    countEl.textContent = n;
    countEl.classList.toggle("show", n > 0);
    const left = Math.max(0, FREE_SHIP - sub);
    drawer.querySelector("#shipMeter").innerHTML = left > 0
      ? `Plus que <b>${M.prix(left)}</b> pour la livraison gratuite! 🚀<div class="bar"><i style="width:${(sub / FREE_SHIP) * 100}%"></i></div>`
      : `🎉 Bravo! La livraison est <b>gratuite</b>.<div class="bar"><i style="width:100%"></i></div>`;
    const list = drawer.querySelector("#drawerItems");
    if (!n) {
      const img = window.Mini3D ? Mini3D.portrait(M.creature("pipo"), 360) : "";
      list.innerHTML = `<div class="empty-state">${img ? `<img src="${img}" alt="">` : ""}<h4>Ton panier est tout vide</h4><p>Un Minitaure attend quelque part de te rencontrer…</p><a class="btn btn-sm" href="boutique.html">Visiter la boutique ${UI.I.arrow}</a></div>`;
      drawer.querySelector("#drawerFoot").style.display = "none";
      return;
    }
    drawer.querySelector("#drawerFoot").style.display = "";
    list.innerHTML = Cart.items().map(({ id, qty, p }) => `
      <div class="line-item">
        ${Cart.thumb(p)}</div>
        <div><h4>${p.nom}</h4><div class="sub">${p.sous}</div>
          <div class="qty"><button data-act="dec" data-id="${id}" aria-label="Retirer un">−</button><span>${qty}</span><button data-act="inc" data-id="${id}" aria-label="Ajouter un">+</button></div>
        </div>
        <div class="line-right"><strong>${M.prix(p.prix * qty)}</strong><button class="remove" data-act="rm" data-id="${id}">Retirer</button></div>
      </div>`).join("") + (items.some((l) => l.id === "cartes") ? "" : `
      <div class="upsell">${UI.cardsSVG().replace('class="svg-art"', "")}<div><b>Ajoute un paquet de cartes?</b>5 cartes pour 3 $ — parfait avec tes créatures.</div><button class="btn btn-sun btn-sm" data-upsell>+ 3 $</button></div>`);
    const up = list.querySelector("[data-upsell]");
    if (up) up.addEventListener("click", (e) => { e.stopPropagation(); Cart.add("cartes", 1); });
    drawer.querySelector("#drawerFoot").innerHTML = `
      <div class="row"><span>Sous-total (${n} article${n > 1 ? "s" : ""})</span><span class="total">${M.prix(sub)}</span></div>
      <small>Taxes et livraison calculées à la caisse.</small>
      <a class="btn btn-block" href="caisse.html">Passer à la caisse ${UI.I.arrow}</a>
      <button class="btn btn-ghost btn-block" style="margin-top:10px" data-keep>Continuer à magasiner</button>`;
    drawer.querySelector("[data-keep]").addEventListener("click", Cart.close);
  }

  function flyToCart(fromEl, p) {
    if (!btn) return;
    btn.classList.remove("bump"); void btn.offsetWidth; btn.classList.add("bump");
    if (!fromEl || (window.UI && UI.reduced)) return;
    const card = fromEl.closest(".card, .modal-card, .reveal-card, .product-hero") || fromEl;
    const src = card.querySelector("img.ready, img[src^='data']");
    const from = (src || fromEl).getBoundingClientRect();
    const to = btn.getBoundingClientRect();
    let f;
    if (src) { f = document.createElement("img"); f.src = src.src; }
    else { f = document.createElement("div"); f.innerHTML = UI.productArt(p); f.firstElementChild.style.width = "100%"; }
    f.className = "fly";
    f.style.left = from.left + from.width / 2 - 45 + "px";
    f.style.top = from.top + from.height / 2 - 45 + "px";
    document.body.appendChild(f);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      f.style.transform = `translate(${dx}px, ${dy}px) scale(0.2) rotate(360deg)`;
      f.style.opacity = "0.4";
    }));
    setTimeout(() => f.remove(), 850);
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]");
    if (a) { e.preventDefault(); Cart.add(a.dataset.add, 1, a); }
  });
  window.addEventListener("storage", (e) => { if (e.key === KEY) { items = load(); render(); document.dispatchEvent(new CustomEvent("cart:change")); } });
  document.addEventListener("ui:ready", build);
})();
