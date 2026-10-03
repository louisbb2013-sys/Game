/* Minitaure — page d'accueil : scène 3D spatiale, bande, sachet mystère */
(function () {
  const M = window.MINI;

  /* ================= Scène 3D du héros ================= */
  function heroScene() {
    const hero = document.querySelector(".hero");
    const canvas = hero && hero.querySelector("canvas.scene");
    if (!canvas || !window.Mini3D || !Mini3D.supported()) { hero && hero.classList.add("no-webgl"); return; }
    const T = THREE;
    const small = window.innerWidth < 760;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.outputEncoding = T.sRGBEncoding;
    const scene = new T.Scene();
    Mini3D.addLights(scene);
    const glow = new T.PointLight("#ff8fcf", 1.2, 20); glow.position.set(4, 1, 4); scene.add(glow);
    const camera = new T.PerspectiveCamera(38, 1, 0.1, 200);
    camera.position.set(0, 0.4, 13);

    const world = new T.Group(); scene.add(world);

    // --- étoiles scintillantes ---
    const N = small ? 700 : 1400;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N), size = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const r = 30 + Math.random() * 60, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
      pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 5;
      seed[i] = Math.random() * 10; size[i] = 1 + Math.random() * 2.6;
    }
    const sg = new T.BufferGeometry();
    sg.setAttribute("position", new T.BufferAttribute(pos, 3));
    sg.setAttribute("aSeed", new T.BufferAttribute(seed, 1));
    sg.setAttribute("aSize", new T.BufferAttribute(size, 1));
    const starMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending,
      uniforms: { uTime: Mini3D.shared.time, uPR: { value: renderer.getPixelRatio() } },
      vertexShader: `attribute float aSeed; attribute float aSize; uniform float uTime; uniform float uPR; varying float vA; varying float vS;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
        vA = 0.45 + 0.55 * sin(uTime * (1.0 + mod(aSeed, 2.0)) + aSeed * 6.0); vS = aSeed;
        gl_PointSize = aSize * uPR * (60.0 / -mv.z) * 2.2; }`,
      fragmentShader: `varying float vA; varying float vS; void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float cross = max(0.0, 1.0 - abs(c.x) * 14.0) * max(0.0, 1.0 - abs(c.y) * 2.2) + max(0.0, 1.0 - abs(c.y) * 14.0) * max(0.0, 1.0 - abs(c.x) * 2.2);
        float a = smoothstep(0.5, 0.0, d) * 0.9 + cross * 0.6; vec3 col = mix(vec3(1.0,0.95,0.8), vec3(0.75,0.85,1.0), step(5.0, vS));
        gl_FragColor = vec4(col, a * vA); }`,
    });
    const stars = new T.Points(sg, starMat);
    scene.add(stars);

    // --- planète mousse ---
    const planetPivot = new T.Group();
    world.add(planetPivot);
    planetPivot.position.set(0, -2.6, 0);
    const planet = Mini3D.furMesh(new T.SphereGeometry(2.6, 64, 48), {
      a: "#1f7a4d", b: "#7ad35c", belly: "#7ad35c", len: 0.14, shells: small ? 10 : 16,
      density: 16, spots: 0.7, rim: "#9fffcf", gravity: new T.Vector3(0, 0, 0),
    });
    planetPivot.add(planet);
    const rotor = new T.Group(); planet.add(rotor);
    const std = Mini3D.std;
    function onPlanet(obj, lat, lon, lift) {
      const d = new T.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon));
      obj.position.copy(d.clone().multiplyScalar(2.6 + (lift || 0)));
      obj.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
      rotor.add(obj);
    }
    function mushroom(color) {
      const g = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(0.07, 0.1, 0.35, 12), std("#fff3e0"));
      stem.position.y = 0.17;
      const cg = new T.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const cap = new T.Mesh(cg, std(color, { roughness: 0.4 }));
      cap.position.y = 0.32; cap.scale.y = 0.75;
      g.add(stem, cap);
      for (let i = 0; i < 4; i++) {
        const dot = new T.Mesh(new T.SphereGeometry(0.03, 8, 6), std("#ffffff"));
        const a = (i / 4) * Math.PI * 2;
        dot.position.set(Math.cos(a) * 0.12, 0.42, Math.sin(a) * 0.12);
        g.add(dot);
      }
      return g;
    }
    function crystal(color) {
      const m = new T.Mesh(new T.OctahedronGeometry(0.18, 0), std(color, { emissive: new T.Color(color), emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 }));
      m.scale.set(0.7, 1.6, 0.7); m.position.y = 0.2;
      const g = new T.Group(); g.add(m); return g;
    }
    function flower(color) {
      const g = new T.Group();
      const stem = new T.Mesh(new T.CylinderGeometry(0.015, 0.02, 0.35, 6), std("#2f8f4e"));
      stem.position.y = 0.17; g.add(stem);
      const head = new T.Group(); head.position.y = 0.36; g.add(head);
      head.add(new T.Mesh(new T.SphereGeometry(0.05, 10, 8), std("#ffd23f")));
      for (let i = 0; i < 6; i++) {
        const pg = new T.SphereGeometry(0.06, 10, 8); pg.scale(1, 0.35, 1.6);
        const p = new T.Mesh(pg, std(color));
        const a = (i / 6) * Math.PI * 2;
        p.position.set(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08); p.rotation.y = -a + Math.PI / 2;
        head.add(p);
      }
      return g;
    }
    const deco = ["#ff6b57", "#ff8fcf", "#8f6bff", "#ffd23f", "#3ee0b5"];
    for (let i = 0; i < 26; i++) {
      const lat = -0.2 + Math.random() * 1.5, lon = Math.random() * Math.PI * 2;
      const kind = i % 3;
      const o = kind === 0 ? mushroom(deco[i % 2]) : kind === 1 ? crystal(deco[(i % 3) + 2]) : flower(deco[i % 5]);
      o.scale.setScalar(0.9 + Math.random() * 0.6);
      onPlanet(o, lat, lon, 0.02);
    }

    // --- anneau d'étincelles autour de la planète ---
    const rn = 260, rpos = new Float32Array(rn * 3);
    for (let i = 0; i < rn; i++) {
      const a = Math.random() * Math.PI * 2, r = 3.6 + Math.random() * 0.9;
      rpos[i * 3] = Math.cos(a) * r; rpos[i * 3 + 1] = (Math.random() - 0.5) * 0.15; rpos[i * 3 + 2] = Math.sin(a) * r;
    }
    const rg = new T.BufferGeometry(); rg.setAttribute("position", new T.BufferAttribute(rpos, 3));
    const ring = new T.Points(rg, new T.PointsMaterial({ color: "#ffe9a8", size: 0.07, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false }));
    ring.rotation.set(0.35, 0, -0.18);
    planetPivot.add(ring);

    // --- planète à anneaux et lune au loin ---
    const sat = new T.Group();
    const satBall = new T.Mesh(new T.SphereGeometry(1, 40, 30), std("#ff8a5c", { roughness: 0.7, emissive: new T.Color("#5b1a6b"), emissiveIntensity: 0.25 }));
    const satRing = new T.Mesh(new T.RingGeometry(1.35, 2.0, 64), std("#ffd23f", { side: T.DoubleSide, transparent: true, opacity: 0.8 }));
    satRing.rotation.x = Math.PI / 2 - 0.4;
    sat.add(satBall, satRing);
    sat.position.set(0.4, 5.2, -14);
    world.add(sat);
    const moon = new T.Mesh(new T.SphereGeometry(0.7, 32, 24), std("#fff0b8", { emissive: new T.Color("#ffd23f"), emissiveIntensity: 0.35 }));
    moon.position.set(6.5, -0.2, -10);
    world.add(moon);

    // --- étoiles flottantes ---
    const floaters = [];
    for (let i = 0; i < 9; i++) {
      const s = new T.Mesh(new T.OctahedronGeometry(0.12 + Math.random() * 0.1), std(deco[i % 5], { emissive: new T.Color(deco[i % 5]), emissiveIntensity: 0.8 }));
      s.position.set(-3 + Math.random() * 7.5, Math.random() * 4.2 - 1, (Math.random() - 0.5) * 4);
      s.userData.base = s.position.clone(); s.userData.ph = Math.random() * 6;
      world.add(s); floaters.push(s);
    }

    // --- créatures ---
    const shells = small ? 14 : 22;
    const cast = [
      { id: "noki", lat: 1.05, lon: -0.62, s: 0.6 },
      { id: "lapinou", lat: 1.12, lon: 0.55, s: 0.58 },
      { id: "minotaure", lat: 1.5, lon: 0.0, s: 0.68 },
      { id: "bloop", lat: 0.7, lon: 1.25, s: 0.52 },
      { id: "pipo", lat: 0.72, lon: -1.3, s: 0.5 },
    ];
    const creatures = [];
    const hitSpheres = [];
    const hitGeo = new T.SphereGeometry(1.25, 12, 10);
    const hitMat = new T.MeshBasicMaterial({ visible: false });
    function addCreature(id, scale, parent, position) {
      const c = Mini3D.createCreature(M.creature(id), { shells, segments: small ? 40 : 56 });
      c.group.scale.setScalar(scale);
      c.group.position.copy(position);
      c.hops = true;
      parent.add(c.group);
      const hit = new T.Mesh(hitGeo, hitMat);
      hit.userData.creature = c;
      c.group.add(hit);
      hitSpheres.push(hit);
      creatures.push(c);
      return c;
    }
    cast.forEach((k) => {
      const d = new T.Vector3(Math.cos(k.lat) * Math.sin(k.lon), Math.sin(k.lat), Math.cos(k.lat) * Math.cos(k.lon));
      const c = addCreature(k.id, k.s, planetPivot, d.multiplyScalar(2.6 + k.s * 0.92));
      c.group.lookAt(new T.Vector3(c.group.position.x * 0.3, c.group.position.y, 12));
    });
    const flyers = [
      { c: addCreature("lumy", 0.55, world, new T.Vector3(-2.8, 2.2, 0.5)), r: 0.5, sp: 0.8 },
      { c: addCreature("nebula", 0.5, world, new T.Vector3(3.2, 2.4, -0.5)), r: 0.4, sp: 0.6 },
      { c: addCreature("croq", 0.42, world, new T.Vector3(-3.4, -1.2, 1.4)), r: 0.35, sp: 1.1 },
    ];
    flyers.forEach((f) => { f.base = f.c.group.position.clone(); f.c.hops = false; });

    // --- disposition responsive ---
    function layout() {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const a = w / h;
      if (a > 1.15) { world.position.set(Math.min(4.4, 2.0 + (a - 1.15) * 3.2), -0.6, 0); world.scale.setScalar(0.86); }
      else { world.position.set(0, -3.2, 0); world.scale.setScalar(Math.max(0.62, a * 0.95)); }
    }
    window.addEventListener("resize", layout);
    layout();

    // --- interactions ---
    const ray = new T.Raycaster(), ptr = new T.Vector2(), look = new T.Vector2();
    let hover = null;
    const sayings = ["Squish!", "Boing!", "Encore!", "Trop doux.", "Rare? Peut-être…", "Échange-moi!", "+1 pour ta bande", "Attrape-moi!"];
    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ptr, camera);
      const hit = ray.intersectObjects(hitSpheres, false)[0];
      return hit ? hit.object.userData.creature : null;
    }
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      look.set(((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
      hover = pick(e);
      canvas.classList.toggle("pointer", !!hover);
    });
    canvas.addEventListener("pointerleave", () => look.set(0, 0));
    canvas.addEventListener("click", (e) => {
      const c = pick(e);
      if (!c) return;
      c.squish(10);
      c.hop();
      const bubble = document.createElement("div");
      bubble.style.cssText = `position:absolute;left:${e.clientX - hero.getBoundingClientRect().left}px;top:${e.clientY - hero.getBoundingClientRect().top}px;z-index:4;pointer-events:none`;
      bubble.innerHTML = `<span style="display:inline-block;transform:translate(-50%,-160%);background:#fff;color:#1d1650;font-weight:800;padding:6px 14px;border-radius:999px;font-family:var(--f-display);font-size:1.1rem;box-shadow:0 8px 20px -6px rgba(0,0,0,.4);animation:pop-in .5s cubic-bezier(.3,1.7,.5,1)">${c.data.nom} : ${sayings[(Math.random() * sayings.length) | 0]}</span>`;
      hero.appendChild(bubble);
      UI.burst(bubble, 22);
      setTimeout(() => bubble.remove(), 1400);
    });

    // --- boucle ---
    const clock = new T.Clock();
    let visible = true, scrollY = 0;
    new IntersectionObserver(([en]) => { visible = en.isIntersecting; }).observe(hero);
    window.addEventListener("scroll", () => { scrollY = window.scrollY; }, { passive: true });
    const lookCur = new T.Vector2();
    function loop() {
      requestAnimationFrame(loop);
      if (!visible || document.hidden) { clock.getDelta(); return; }
      const dt = clock.getDelta(), t = clock.elapsedTime;
      Mini3D.shared.time.value = t;
      lookCur.lerp(look, 0.05);
      planet.rotation.y += dt * 0.12;
      planet.rotation.x = Math.sin(t * 0.2) * 0.05;
      ring.rotation.y += dt * 0.15;
      sat.rotation.y += dt * 0.2;
      stars.rotation.y = t * 0.004 + lookCur.x * 0.03;
      stars.rotation.x = -lookCur.y * 0.02;
      floaters.forEach((s) => {
        s.position.y = s.userData.base.y + Math.sin(t + s.userData.ph) * 0.3;
        s.rotation.y = t * 1.5 + s.userData.ph;
      });
      flyers.forEach((f, i) => {
        f.c.group.position.set(f.base.x + Math.cos(t * f.sp + i) * f.r, f.base.y + Math.sin(t * f.sp * 1.3 + i) * f.r * 0.8, f.base.z);
      });
      creatures.forEach((c) => { c.lookAt(lookCur.x * 0.8, lookCur.y * 0.6); c.update(t, dt); });
      const sp = Math.min(1, scrollY / window.innerHeight);
      camera.position.x = lookCur.x * 0.5;
      camera.position.y = 0.4 + lookCur.y * 0.3 - sp * 2.5;
      camera.lookAt(0, -sp * 2.0, 0);
      world.rotation.y = lookCur.x * 0.08 + sp * 0.3;
      renderer.render(scene, camera);
    }
    loop();
  }

  /* ---------- Étoiles filantes (CSS) ---------- */
  function shootingStars() {
    const hero = document.querySelector(".hero");
    if (!hero || UI.reduced) return;
    setInterval(() => {
      if (document.hidden) return;
      const s = document.createElement("i");
      s.className = "shooting-star go";
      s.style.left = 30 + Math.random() * 70 + "%";
      s.style.top = Math.random() * 40 + "%";
      hero.appendChild(s);
      setTimeout(() => s.remove(), 1300);
    }, 2600);
  }

  /* ---------- Bande de créatures ---------- */
  function band() {
    const el = document.getElementById("band");
    if (!el) return;
    el.innerHTML = M.PRODUITS.filter((p) => p.type === "creature").map((p) => UI.productCard(p)).join("");
    const step = () => el.querySelector(".card").getBoundingClientRect().width + 22;
    document.getElementById("bandPrev").addEventListener("click", () => el.scrollBy({ left: -step(), behavior: "smooth" }));
    document.getElementById("bandNext").addEventListener("click", () => el.scrollBy({ left: step(), behavior: "smooth" }));
  }

  /* ---------- Sachet mystère ---------- */
  function mystery() {
    const bag = document.getElementById("mysteryBag");
    if (!bag) return;
    const out = document.getElementById("mysteryReveal");
    bag.innerHTML = `<span class="mystery-blob"></span>${UI.bagSVG("m")}`;
    // On tire d'abord la rareté, puis une créature de cette rareté.
    function draw() {
      let r = Math.random() * 100, tier = "commun";
      for (const k of Object.keys(M.RARETES)) { r -= M.RARETES[k].chance; if (r < 0) { tier = k; break; } }
      const pool = M.CREATURES.filter((c) => c.rarete === tier);
      return pool[(Math.random() * pool.length) | 0];
    }
    let busy = false;
    function open() {
      if (busy) return;
      busy = true;
      bag.classList.add("shake");
      setTimeout(() => {
        bag.classList.add("opened");
        const c = draw();
        const img = window.Mini3D ? Mini3D.portrait(c, 360) : "";
        out.innerHTML = `<div>
          ${img ? `<img src="${img}" alt="${c.nom}">` : ""}
          <div class="card-kicker" style="margin-top:6px">${"★".repeat(M.RARETES[c.rarete].stars)} ${M.RARETES[c.rarete].label} · N° ${c.num}</div>
          <h3>C'est ${c.nom}!</h3>
          <p style="margin:4px 0 0;color:var(--ink-2)">${c.habitude}</p>
          <div class="actions">
            <button class="btn btn-sm" data-add="sachet">Acheter un sachet · 7 $</button>
            <button class="btn btn-ghost btn-sm" data-open="${c.id}">Voir en 3D</button>
            <button class="btn btn-ghost btn-sm" id="again">↻ Rejouer</button>
          </div></div>`;
        out.classList.add("show");
        UI.burst(out, 48);
        out.querySelector("#again").addEventListener("click", () => {
          out.classList.remove("show"); out.innerHTML = "";
          bag.classList.remove("shake", "opened");
          busy = false;
        });
      }, 900);
    }
    bag.addEventListener("click", open);
  }

  document.addEventListener("ui:ready", () => {
    band();
    mystery();
    heroScene();
    shootingStars();
  });
})();
