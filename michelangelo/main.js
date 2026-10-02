import { makeMarble } from './marble.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = window.matchMedia('(hover: none)').matches;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

$('#year').textContent = new Date().getFullYear();

// ---------- Hero: wine simulation ----------
import('./fluid.js')
  .then(({ initFluid }) => initFluid($('#wine'), { reduced }))
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

// ---------- Scroll: nav state + marble sheen ----------
const nav = $('#nav');
const slabs = $$('.slab');
let lastY = window.scrollY, ticking = false;
function onScroll() {
  const y = window.scrollY, vh = window.innerHeight;
  nav.classList.toggle('is-scrolled', y > 40);
  if (!document.body.classList.contains('menu-open')) nav.classList.toggle('is-hidden', y > lastY && y > vh * 0.9);
  lastY = y;
  if (!reduced) slabs.forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) return;
    const p = 1 - (r.top + r.height) / (vh + r.height);
    s.style.setProperty('--sheen', `${-80 + p * 160}%`);
  });
  ticking = false;
}
window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
onScroll();

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
