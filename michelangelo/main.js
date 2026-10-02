const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

document.body.classList.add('is-loading');
$('#year').textContent = new Date().getFullYear();

// ---------- 3D scene (loaded lazily; page still works without WebGL) ----------
import('./scene.js')
  .then(({ initScene }) => initScene($('#scene'), { reduced }))
  .catch((err) => {
    console.warn('3D scene unavailable:', err);
    document.body.classList.add('no-webgl');
  });

// ---------- Loader ----------
(function loader() {
  const count = $('#loadCount'), bar = $('#loadBar');
  const duration = reduced ? 200 : 1600;
  const start = performance.now();
  function step(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    count.textContent = Math.round(eased * 100);
    bar.style.width = eased * 100 + '%';
    if (p < 1) requestAnimationFrame(step);
    else {
      document.body.classList.remove('is-loading');
      document.body.classList.add('loaded');
    }
  }
  requestAnimationFrame(step);
})();

// ---------- Split hero title into letters ----------
$$('[data-split]').forEach((el) => {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.innerHTML = [...text].map((c, i) =>
    `<span class="ch" aria-hidden="true"><span style="--i:${i}">${c === ' ' ? '&nbsp;' : c}</span></span>`
  ).join('');
});

// ---------- Reveal on scroll ----------
const revealIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
  });
}, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
$$('[data-reveal]').forEach((el) => revealIO.observe(el));

// ---------- Counters ----------
const countIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, end = +el.dataset.count, noFmt = 'nofmt' in el.dataset;
    const from = noFmt ? Math.max(0, end - 60) : 0;
    const t0 = performance.now(), dur = reduced ? 1 : 2000;
    (function step(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      el.textContent = Math.round(from + (end - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    })(t0);
  });
}, { threshold: 0.6 });
$$('[data-count]').forEach((el) => countIO.observe(el));

// ---------- Scroll-driven: nav, progress, horizontal track, parallax ----------
const nav = $('#nav'), progress = $('#progressBar');
const hSection = $('.hscroll'), hTrack = $('#hTrack'), hCount = $('#hCount');
const parallax = $$('[data-speed]');
let lastY = window.scrollY;
let hX = 0;

function onFrame() {
  const y = window.scrollY, vh = window.innerHeight;
  const max = document.documentElement.scrollHeight - vh;
  progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;

  nav.classList.toggle('is-scrolled', y > 40);
  if (!document.body.classList.contains('menu-open')) {
    nav.classList.toggle('is-hidden', y > lastY && y > vh * 0.8);
  }
  lastY = y;

  // Horizontal scroll: pinned section translates its track sideways.
  const rect = hSection.getBoundingClientRect();
  const total = hSection.offsetHeight - vh;
  const p = clamp(-rect.top / total, 0, 1);
  const dist = Math.max(0, hTrack.scrollWidth - window.innerWidth);
  hX += (-p * dist - hX) * (reduced ? 1 : 0.12);
  hTrack.style.transform = `translate3d(${hX}px,0,0)`;
  const n = hTrack.children.length;
  hCount.textContent = String(Math.min(n, Math.floor(p * n * 0.999) + 1)).padStart(2, '0');

  parallax.forEach((el) => {
    const r = el.getBoundingClientRect();
    const off = (r.top + r.height / 2 - vh / 2) * +el.dataset.speed;
    el.style.transform = `translate3d(${off}px,0,0)`;
  });

  requestAnimationFrame(onFrame);
}
requestAnimationFrame(onFrame);

// ---------- Custom cursor ----------
if (finePointer && !reduced) {
  document.body.classList.add('has-cursor');
  const cursor = $('.cursor'), dot = $('.cursor__dot'), ring = $('.cursor__ring');
  let mx = -100, my = -100, rx = -100, ry = -100;
  window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; }, { passive: true });
  (function loop() {
    rx += (mx - rx) * 0.16; ry += (my - ry) * 0.16;
    dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
    ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    requestAnimationFrame(loop);
  })();
  document.addEventListener('pointerover', (e) => {
    cursor.classList.toggle('is-hover', !!e.target.closest('a, button, [data-hover], [data-tilt]'));
  });
}

// ---------- Magnetic buttons ----------
if (finePointer && !reduced) {
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
      el.style.transform = `translate(${x * 0.3}px, ${y * 0.4}px)`;
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1), color .4s';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; }, 600);
    });
  });
}

// ---------- 3D tilt cards ----------
if (finePointer && !reduced) {
  $$('[data-tilt]').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.transition = 'transform .15s ease-out, border-color .4s';
      el.style.transform = `perspective(1000px) rotateX(${(0.5 - py) * 14}deg) rotateY(${(px - 0.5) * 18}deg) scale(1.02)`;
      el.style.setProperty('--gx', px * 100 + '%');
      el.style.setProperty('--gy', py * 100 + '%');
    });
    el.addEventListener('pointerleave', () => {
      el.style.transition = '';
      el.style.transform = '';
    });
  });
}

// ---------- Mobile menu ----------
$('#burger').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

// ---------- FR / EN ----------
const EN = {
  'nav.story': 'Story', 'nav.exp': 'Experiences', 'nav.events': 'Events', 'nav.awards': 'Awards', 'nav.visit': 'Contact',
  'cta.book': 'Book', 'cta.table': 'Book a table', 'cta.discover': 'Discover', 'cta.event': 'Plan an event', 'cta.call': 'Call to reserve',
  'hero.eyebrow': 'Ristorante · Québec City · since 1973',
  'hero.sub': 'Half a century of authentic Italian cuisine, in the heart of Sillery.',
  'hero.scroll': 'Scroll',
  'mq.auth': 'Authentic Italian restaurant outside Italy', 'mq.years': '50 years of passion',
  'story.label': '01 — Our story',
  'story.title': 'One table, one family,<br><em>fifty years</em> of Italy.',
  'story.p1': 'In 1973, Nicola Cortina rented a space in downtown Québec City and opened a demanding Italian table. Twenty years later, to own his own walls, he moved Le Michelangelo to 3111 chemin Saint-Louis — a building designed with architect Giovanni Maur.',
  'story.p2': 'Under one roof: a dining room, a lounge with bar, semi-private alcoves, private rooms, a reception hall and a wine cellar. The creativity in the kitchen, the rigour of the service and the passion for great wines have never stopped.',
  'stat.years': 'years of fine dining', 'stat.diamonds': 'CAA/AAA diamonds', 'stat.guests': 'guests for receptions', 'stat.since': 'year founded',
  'tl.1973': 'Nicola Cortina opens Le Michelangelo in downtown Québec City.',
  'tl.1993': 'The move to 3111 chemin Saint-Louis, into a building by Giovanni Maur.',
  'tl.nowY': 'Today', 'tl.now': 'More than fifty years on, a landmark of Italian cuisine in Québec City.',
  'exp.label': '02 — Experiences', 'exp.title': 'Four ways to<br><em>live Italy.</em>',
  'c1.t': 'The dining room', 'c1.p': 'House-made fresh pasta, seafood and Italian classics, served with exceptional care.',
  'c2.t': 'The wine cellar', 'c2.p': 'A Wine Spectator award-winning list, rich in great French and Italian vintages.',
  'c3.t': 'Private rooms', 'c3.p': 'Semi-private alcoves and closed salons for business meals and special occasions.',
  'c4.t': 'The pasta counter', 'c4.p': 'Fresh pasta to cook at home, lasagnas, sauces, pizzas and fine imported Italian products.',
  'ev.label': '03 — Private events', 'ev.title': 'From family dinners to grand receptions of <em>nearly 150 guests.</em>',
  'f1': 'Personalised menus', 'f2': 'Audiovisual equipment', 'f3': 'Decoration service', 'f4': 'Dance floor',
  'aw.label': '04 — Awards', 'aw.title': 'Recognised, <em>year after year.</em>',
  'aw1.t': 'Four Diamonds', 'aw3.p': 'Distinguished Restaurants of North America',
  'aw4.t': 'Authentic Italian', 'aw4.p': 'Recognised outside Italy by the President of the Italian Republic',
  'v.label': '05 — Contact', 'v.title': 'To the table.', 'v.addr': 'Address', 'v.map': 'Directions →',
  'v.hours': 'Hours', 'v.hoursTxt': 'Tuesday to Friday<br>11 am – 2 pm · 5:30 – 10 pm', 'v.hoursNote': 'Hours subject to change — please call to confirm.',
  'ft.top': 'Back to top ↑',
};
const FR = {};
$$('[data-i18n]').forEach((el) => { FR[el.dataset.i18n] = el.innerHTML; });
let lang = 'fr';
try { if (localStorage.getItem('lang') === 'en') setLang('en'); } catch {}
$('#langBtn').addEventListener('click', () => setLang(lang === 'fr' ? 'en' : 'fr'));
function setLang(l) {
  lang = l;
  const dict = l === 'en' ? EN : FR;
  $$('[data-i18n]').forEach((el) => { const v = dict[el.dataset.i18n]; if (v != null) el.innerHTML = v; });
  document.documentElement.lang = l;
  $('#langBtn').textContent = l === 'fr' ? 'EN' : 'FR';
  try { localStorage.setItem('lang', l); } catch {}
}
