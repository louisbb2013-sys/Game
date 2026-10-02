import { makeMarble } from './marble.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = window.matchMedia('(hover: none)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

$('#year').textContent = new Date().getFullYear();

// ---------- Hero: wine simulation ----------
let wine = null;
import('./fluid.js')
  .then(({ initFluid }) => { wine = initFluid($('#wine'), { reduced }); })
  .catch((err) => { console.warn('Wine simulation unavailable:', err); document.body.classList.add('no-fluid'); });

// ---------- Story: engraved marble tablet (three.js, loaded when near) ----------
const tabletCanvas = $('#tablet');
const tabletIO = new IntersectionObserver(([e]) => {
  if (!e.isIntersecting) return;
  tabletIO.disconnect();
  import('./tablet.js')
    .then(({ initTablet }) => initTablet(tabletCanvas, { reduced }))
    .catch((err) => { console.warn('Tablet unavailable:', err); document.body.classList.add('no-tablet'); });
}, { rootMargin: '600px 0px' });
tabletIO.observe(tabletCanvas);

// ---------- Experiences: procedural marble panels ----------
$$('[data-marble]').forEach((el, i) => {
  const c = makeMarble(el.dataset.marble, 1200, 900, i + 2);
  c.toBlob((b) => { if (b) el.style.setProperty('--marble', `url(${URL.createObjectURL(b)})`); }, 'image/jpeg', 0.9);
});

// ---------- Headline word masks ----------
function splitWords(el) {
  let i = 0;
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.append(' '); return; }
          const w = document.createElement('span');
          w.className = 'w';
          w.innerHTML = `<span style="--i:${i++}"></span>`;
          w.firstChild.textContent = part;
          frag.append(w);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains('w')) walk(n);
    });
  };
  walk(el);
}
// Capture original French markup before headlines are split into words.
const FR = {};
$$('[data-i18n]').forEach((el) => { FR[el.dataset.i18n] = el.innerHTML; });
$$('[data-words]').forEach(splitWords);

// ---------- Reveal on scroll ----------
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('in');
    // Clipped panels can't be observed directly, so their row triggers them.
    e.target.querySelectorAll(':scope > [data-wipe]').forEach((w) => w.classList.add('in'));
    io.unobserve(e.target);
  });
}, { threshold: 0.2, rootMargin: '0px 0px -6% 0px' });
$$('[data-reveal], [data-words]').forEach((el) => io.observe(el));
$$('[data-wipe]').forEach((el) => io.observe(el.parentElement));

// ---------- Manifesto: split into words that light up with scroll ----------
const GOLD_WORDS = /^(1973|artiste|artist|famille|family|vins|wines)/i;
function splitFill(el) {
  el.innerHTML = el.textContent.split(/\s+/).filter(Boolean)
    .map((w) => `<span class="fw${GOLD_WORDS.test(w) ? ' gold' : ''}">${w.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join(' ');
}
$$('[data-fill]').forEach(splitFill);

// ---------- Text roll on nav links and buttons ----------
function roll(el) {
  const html = el.innerHTML;
  el.innerHTML = `<span class="roll"><span>${html}</span><span aria-hidden="true">${html}</span></span>`;
}
const rollEls = $$('.nav__links a, .btn');
if (!touch && !reduced) rollEls.forEach(roll);

// ---------- Timeline years count up when revealed ----------
const yearIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    yearIO.unobserve(e.target);
    const end = +e.target.dataset.year, start = end - 40, t0 = performance.now();
    (function tick(now) {
      const k = Math.min(1, (now - t0) / 1400), v = Math.round(start + (end - start) * (1 - Math.pow(1 - k, 4)));
      e.target.textContent = v;
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  });
}, { threshold: 0.8 });
if (!reduced) $$('[data-year]').forEach((el) => yearIO.observe(el));

// ---------- Marble panels: pointer-following polish highlight ----------
$$('.slab').forEach((s) => {
  const light = document.createElement('span');
  light.className = 'slab__light';
  s.append(light);
  s.addEventListener('pointermove', (e) => {
    const r = s.getBoundingClientRect();
    s.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    s.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
});

// ---------- Smooth (inertial) wheel scrolling on desktop ----------
const smooth = !touch && !reduced;
let target = window.scrollY, current = window.scrollY, lastSet = window.scrollY;
const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;
if (smooth) {
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || document.body.classList.contains('menu-open')) return;
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1;
    target = Math.max(0, Math.min(maxScroll(), target + e.deltaY * unit));
  }, { passive: false });
}

// ---------- Pointer glow ----------
const glow = $('.glow');
let gx = innerWidth / 2, gy = innerHeight / 2, gtx = gx, gty = gy;
window.addEventListener('pointermove', (e) => { gtx = e.clientX; gty = e.clientY; document.body.classList.add('glow-on'); }, { passive: true });

// ---------- The frame loop: everything that moves with scroll ----------
const nav = $('#nav');
const heroContent = $('.hero__content'), heroHint = $('.hero__hint');
const bands = $$('.band');
const slabs = $$('.slab');
const rowTexts = $$('.row__text');
const manifesto = $('.manifesto'), fillWords = () => $$('.manifesto__text .fw');
const bgSections = $$('[data-bg]');
let lastY = window.scrollY, vel = 0, bandX = 0, currentBg = '';

function frame() {
  requestAnimationFrame(frame);
  const vh = window.innerHeight;

  if (smooth) {
    // Any scroll we didn't cause (scrollbar, keys, anchor links) resyncs the target.
    if (Math.abs(window.scrollY - lastSet) > 1) { target = current = window.scrollY; }
    current += (target - current) * 0.1;
    if (Math.abs(target - current) < 0.3) current = target;
    if (Math.abs(current - window.scrollY) >= 0.5) window.scrollTo({ top: current, behavior: 'instant' });
    lastSet = window.scrollY;
  }
  const y = window.scrollY;
  vel += ((y - lastY) - vel) * 0.2;

  nav.classList.toggle('is-scrolled', y > 40);
  if (!document.body.classList.contains('menu-open')) {
    if (y - lastY > 1 && y > vh * 0.9) nav.classList.add('is-hidden');
    else if (y - lastY < -1 || y < vh * 0.9) nav.classList.remove('is-hidden');
  }
  lastY = y;

  if (!reduced) {
    // Hero text lifts, fades and softens as you leave.
    if (y < vh * 1.2) {
      const k = Math.min(1, y / (vh * 0.75));
      heroContent.style.transform = `translate3d(0, ${-y * 0.35}px, 0)`;
      heroContent.style.opacity = 1 - k;
      heroContent.style.filter = k > 0.01 ? `blur(${k * 8}px)` : '';
      heroHint.style.opacity = 1 - k * 2;
      if (wine) wine.slosh(vel);
    }

    // Word bands: constant drift plus scroll, opposite directions, skew with speed.
    bandX += 0.35 + Math.abs(vel) * 0.6;
    bands.forEach((b) => {
      const span = b.firstElementChild;
      if (!b._filled) { b.innerHTML = span.outerHTML.repeat(4); b._filled = true; }
      const w = b.firstElementChild.offsetWidth || 1;
      const dir = +b.dataset.dir;
      const x = dir > 0 ? -(bandX % w) : -w + (bandX % w);
      b.style.transform = `translate3d(${x}px,0,0) skewX(${Math.max(-12, Math.min(12, -vel * 0.4 * dir))}deg)`;
    });

    // Marble panels: inner parallax + slight skew from scroll speed.
    const skew = Math.max(-4, Math.min(4, vel * 0.12));
    slabs.forEach((s, i) => {
      const r = s.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      const off = (r.top + r.height / 2 - vh / 2) / vh;
      s.style.setProperty('--py', `${off * -60}px`);
      s.style.setProperty('--skew', `${skew}deg`);
      s.style.setProperty('--sheen', `${-80 + (1 - (r.top + r.height) / (vh + r.height)) * 160}%`);
      rowTexts[i].style.transform = `translate3d(0, ${off * 70}px, 0)`;
    });

    // Manifesto: light words in sequence across the pinned scroll.
    const mr = manifesto.getBoundingClientRect();
    if (mr.top < vh && mr.bottom > 0) {
      const p = Math.min(1, Math.max(0, -mr.top / (mr.height - vh)));
      const words = fillWords();
      const lit = Math.floor(p * 1.15 * words.length);
      words.forEach((w, i) => w.classList.toggle('lit', i < lit));
    }
  }

  // Background colour follows the section in the middle of the screen.
  for (const sec of bgSections) {
    const r = sec.getBoundingClientRect();
    if (r.top < vh * 0.5 && r.bottom > vh * 0.5) {
      if (sec.dataset.bg !== currentBg) { currentBg = sec.dataset.bg; document.body.style.backgroundColor = currentBg; }
      break;
    }
  }

  if (!touch) {
    gx += (gtx - gx) * 0.08; gy += (gty - gy) * 0.08;
    glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
  }
}
requestAnimationFrame(frame);
if (reduced) $$('.manifesto__text .fw').forEach((w) => w.classList.add('lit'));

// ---------- Mobile menu ----------
$('#burger').addEventListener('click', () => document.body.classList.toggle('menu-open'));
$$('#navLinks a').forEach((a) => a.addEventListener('click', () => document.body.classList.remove('menu-open')));

// ---------- FR / EN ----------
const EN = {
  'nav.story': 'Story', 'nav.exp': 'Experiences', 'nav.events': 'Events', 'nav.awards': 'Awards', 'nav.visit': 'Contact',
  'cta.book': 'Book', 'cta.table': 'Book a table', 'cta.discover': 'Discover', 'cta.event': 'Plan an event',
  'hero.eyebrow': 'Ristorante · Québec City · since 1973',
  'hero.sub': 'Half a century of authentic Italian cuisine, in the heart of Sillery.',
  'hero.hint': 'Swirl the wine — move your cursor', 'hero.hintTouch': 'Swirl the wine — drag your finger',
  'story.label': 'Our story',
  'story.title': 'One table, one family, <em>fifty years</em> of Italy.',
  'story.p1': 'In 1973, Nicola Cortina rented a space in downtown Québec City and opened a demanding Italian table. Twenty years later, to own his own walls, he moved Le Michelangelo to 3111 chemin Saint-Louis — a building designed with architect Giovanni Maur.',
  'story.p2': 'Under one roof: a dining room, a lounge with bar, semi-private alcoves, private rooms, a reception hall and a wine cellar. The creativity in the kitchen, the rigour of the service and the passion for great wines have never stopped.',
  'tl.1973': 'Nicola Cortina opens Le Michelangelo in downtown Québec City.',
  'tl.1993': 'The move to 3111 chemin Saint-Louis, into a building by Giovanni Maur.',
  'tl.nowY': 'Today', 'tl.now': 'More than fifty years on, a landmark of Italian cuisine in Québec City.',
  'exp.label': 'Experiences', 'exp.title': 'Four ways to <em>live Italy.</em>',
  'c1.t': 'The dining room', 'c1.p': 'House-made fresh pasta, seafood and Italian classics, served with exceptional care.',
  'c2.t': 'The wine cellar', 'c2.p': 'A Wine Spectator award-winning list, rich in great French and Italian vintages.',
  'c3.t': 'Private rooms', 'c3.p': 'Semi-private alcoves and closed salons for business meals and special occasions.',
  'c4.t': 'The pasta counter', 'c4.p': 'Fresh pasta to cook at home, lasagnas, sauces, pizzas and fine imported Italian products.',
  'ev.label': 'Private events', 'ev.title': 'From family dinners to grand receptions of <em>nearly 150 guests.</em>',
  'f1': 'Personalised menus', 'f2': 'Audiovisual equipment', 'f3': 'Decoration service', 'f4': 'Dance floor',
  'aw.label': 'Awards', 'aw.title': 'Recognised, <em>year after year.</em>',
  'aw1.t': 'Four Diamonds', 'aw3.p': 'Distinguished Restaurants of North America',
  'aw4.t': 'Authentic Italian restaurant', 'aw4.p': 'Distinction from the President of the Italian Republic',
  'v.label': 'Contact', 'v.title': 'To the table.', 'v.addr': 'Address', 'v.map': 'Directions →',
  'v.hours': 'Hours', 'v.hoursTxt': 'Tuesday to Friday<br>11 am – 2 pm · 5:30 – 10 pm', 'v.hoursNote': 'Hours subject to change — please call to confirm.',
  'ft.top': 'Back to top ↑',
  'man.label': 'Our conviction',
  'man.text': 'Since 1973, one conviction: Italian cuisine deserves the creativity of an artist, the rigour of great service and the generosity of a family — paired with the finest wines in the world.',
};
FR['hero.hintTouch'] = 'Remuez le vin — glissez le doigt';

let lang = 'fr';
function setLang(l) {
  lang = l;
  const dict = l === 'en' ? EN : FR;
  $$('[data-i18n]').forEach((el) => {
    let key = el.dataset.i18n;
    if (key === 'hero.hint' && touch) key = 'hero.hintTouch';
    const v = dict[key];
    if (v == null) return;
    el.innerHTML = v;
    if ('words' in el.dataset) splitWords(el);
    if ('fill' in el.dataset) splitFill(el);
    if (!touch && !reduced && rollEls.includes(el)) roll(el);
  });
  document.documentElement.lang = l;
  $('#langBtn').textContent = l === 'fr' ? 'EN' : 'FR';
  try { localStorage.setItem('lang', l); } catch {}
}
$('#langBtn').addEventListener('click', () => setLang(lang === 'fr' ? 'en' : 'fr'));
let saved = null;
try { saved = localStorage.getItem('lang'); } catch {}
if (saved === 'en') setLang('en');
else if (touch) $('[data-i18n="hero.hint"]').textContent = FR['hero.hintTouch'];
