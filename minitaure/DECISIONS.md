# Minitaure — design & engineering decisions

This file is the design plan (phase 1) plus every assumption made while
building. It is kept current as the site evolves.

## 1. Concept: "l'Observatoire"

A generic shop template sells *products*. Minitaure presents *specimens*.
The site is framed as a small, soft observatory that catalogues creatures
drifting in from a gentle nebula:

- Every creature has a catalogue number (N° 001), a collection
  ("constellation"), and a specimen card listing colour, fur and size, like
  a naturalist's plate crossed with a star catalogue.
- Thin orbit rings, star dust, and numbered labels are the recurring
  graphic language. No stock icons, no badges, no "SALE".
- Copy is calm, a little mysterious, never salesy: we "welcome" a creature
  (« accueillir »), we don't "buy now".

Challenge pass: the first sketch of the Boutique page was a 4-column grid of
white product cards with a price and a cart button — pure template. It was
redesigned as a "specimen shelf": cards are tall plates with the creature
standing on a soft pedestal disc, a hairline specimen label (N°, collection,
colour swatches), and the price set like an index entry. Filters are
"constellations" with coloured dots, not a sidebar.

## 2. Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | cream `#FCF9F4` | deep night `#1A1745` |
| `--ink` | midnight `#1F1B4D` | cream `#FCF9F4` |
| `--violet` | `#6D4FD3` | `#A996F2` (lifted for AA on night) |
| `--lavender-soft` | `#EFE9FC` | `#24205A` |
| pastels | lavender `#D2C4F8`, pink `#F8C9DB`, mint `#C6EBD6`, peach `#FBD8B4`, sky `#BBD6F9` | same, used at lower surface opacity |

Dark theme follows `prefers-color-scheme` (no toggle; the brief asked for
system preference). Vivid violet is an accent only (links, focus, cart dot).

All tokens live in `src/styles/tokens.css`.

## 3. Type

- **Display: Fraunces (variable, `SOFT` axis at 100, `opsz` auto).** A soft,
  rounded "wonky-free" serif; the SOFT axis rounds every terminal, which
  echoes the fur balls. Premium and warm, never childish.
- **Text/UI: Figtree (variable).** Round, open, very legible geometric sans,
  less over-used than Inter/Poppins.
- Catalogue numbers use Figtree with `tabular-nums` and wide tracking.
- Both are self-hosted through Fontsource (no third-party font request,
  better LCP and privacy).

## 4. Layout ideas

- Generous white space, 12-col fluid grid, `clamp()` type scale.
- Radii: 28px cards, pill buttons, 999px chips; nothing sharp.
- Hero: wordmark top-left of the composition, large creature right, thin
  orbit rings drawn in SVG behind the WebGL canvas, 3 small satellites on
  orbit, star dust.
- "Night" sections (concept, collection scroll scene, About) switch to the
  midnight palette to create rhythm: day → night → day.
- Mobile: its own layouts. Full-screen designed menu (large serif links with
  N° indices and a small orbit), bottom-anchored primary actions, 2-column
  grids, the creature sheet becomes a bottom sheet.

## 5. Motion plan

- One orchestrated load sequence on Accueil: wordmark letters settle in
  (spring, slight blur-to-sharp), hero text rises, creature fades in and
  settles from a small drop.
- Scroll reveals are **varied by intent**: text rises by line mask, plates
  scale-in from 0.96, rows stagger, numbers count in. Not one fade-up.
- Route transitions: soft cross-fade + 12px rise (opacity-only in reduced
  motion).
- Creature sheet: shared-element transition from the card orb to the sheet
  orb (Motion `layoutId`), then the live 3D fades in over the still.
- Easing: `cubic-bezier(.22,1,.36,1)` (long ease-out) for UI; springs with
  low stiffness / high damping for objects.
- `prefers-reduced-motion`: Lenis off, no parallax, no idle motion, stills
  instead of live WebGL (with an opt-in « Voir en 3D » in the sheet),
  opacity-only transitions, collection scroll scene becomes a static grid.

## 6. 3D plan

- `Creature3D` = displaced icosphere (seeded simplex, low frequency) +
  **instanced shell fur**: the same geometry is drawn N times in a single
  draw call (`InstancedMesh`, `gl_InstanceID` = shell index).
- Fur fragment shader: two strand layers (dense under-fur + sparser guard
  hairs) from a jittered 3D cell lattice evaluated on the *rest* direction so
  strands stay coherent across shells; strands taper with height;
  `alphaToCoverage` + MSAA soften the tips without transparency sorting.
- Lighting is in-shader: wrapped diffuse, very soft Kajiya-Kay sheen,
  height-based self-occlusion, fresnel rim, back-light translucency for a
  subsurface glow. Neutral tone mapping, sRGB output.
- Vertex: gravity in world space, wind sway, hover "ruffle" noise, per
  creature length masks (tuft, crown, fringe).
- Details are data: `spots`, `stripes`, `band`, `sheen`, `speckle`, `tuft`,
  `crown`, `fringe`, `plain`. Colour/texture/shape only — **never a face**.
- Shadow: cheap custom blob shadow that reacts to the float height (the drei
  `ContactShadows` pass would re-render 30+ shells per frame).
- Cosmic layer: one `Points` draw with per-star size/twinkle/depth, slow
  drift, pointer parallax; optional additive nebula planes.
- Performance: quality tiers (`high` / `medium` / `static`) from WebGL
  support, reduced motion, cores, memory, and screen size. DPR capped,
  shells 32 → 16 → 10 for thumbnails, canvases pause off-screen, all 3D
  code-split and lazy-loaded.
- Thumbnails: one shared, fixed canvas with drei `<View>` per card. The
  still image is always underneath (LCP + fallback); live fur fades in.
- Stills: generated from the real shader by `npm run stills` (Playwright +
  `canvas.toDataURL('image/webp')`), so fallbacks match the 3D exactly.

## 7. Stack decisions

- Vite + React 19 + TypeScript, React Router 7 (library mode, SPA).
- CSS: plain CSS with custom properties + CSS modules per component.
- Three.js via R3F 9 + drei 10. GSAP ScrollTrigger for the pinned camera
  path, Motion for component/route/shared-element transitions, Lenis for
  smooth scroll (off in reduced motion).
- Static SPA: `postbuild` copies `index.html` to `404.html` (GitHub Pages)
  and emits `_redirects` (Netlify).

## 8. Assumptions

- No real checkout: the cart is a context with localStorage persistence;
  `src/lib/checkout.ts` is the hook for a real provider.
- Contact form posts to `src/lib/contact.ts`, which simulates latency; the
  hook is clearly marked.
- Prices in EUR, French formatting via `Intl.NumberFormat('fr-FR')`.
- Sizes/materials are invented but plausible (≈ 6–8 cm, résine + flocage
  doux).
- The site lives in `minitaure/` because the repository already hosts other
  projects at its root.
- `three` is pinned to 0.182: r183+ logs a `THREE.Clock` deprecation warning
  from inside R3F 9 on every page, and a clean console is part of "done".
- Devices with a **software** WebGL renderer (SwiftShader, llvmpipe) get the
  `static` tier. Rasterising 30+ fur shells on the CPU pegged the main thread
  (Lighthouse TBT 12 s → 0.2 s after this change). This also means headless
  test browsers see stills unless a tier is forced with `?q=`.
- Lenis is disabled when `navigator.webdriver` is true (automation): smoothing
  fights programmatic scroll jumps in screenshots and audits. Humans always get
  it (unless they prefer reduced motion).

## 9. Review log

Each round: screenshots at 390 / 768 / 1440 (`npm run shots`), the creature
sheet, interaction checks (`scripts/interactions.mjs`), fallbacks, and an
independent critique by a second reviewer ("the council").

### Round 1 — flaws found and fixed
1. Mask reveals never fired (the observer watched the clipped line, which is
   never "in view") → observe the clipping wrapper.
2. Hero creature over-framed and cropped; satellites orbiting off-canvas →
   camera pulled back, orbits scale with the viewport width.
3. Fur looked like a washed-out halo: alpha-to-coverage wrote partial alpha into
   a premultiplied canvas → opaque output with an alpha test.
4. A faint cross on every creature (lattice cell boundaries aligned at zero
   parallax) → opaque undercoat + lattices rotated off the object axes.
5. Grain ("sandpaper") from a dithered alpha threshold → removed.
6. Réglisse's crown rendered as two bumps that read as **ears** → a ring of
   eleven small locks.
7. Nav tone (day/night) lagged after fast scrolls → re-check once scrolling settles.
8. Wordmark dots floated too high → re-seated on the stems.
9. Mobile hero caption collided with the eyebrow; stage sat under the nav.
10. Creature sheet 3D framed far too large → matched to the still's framing.

### Round 2 — council critique + own review
1. **Face risk:** the two violet glowing dots over the "i"s read as eyes →
   dots now use the text colour.
2. **Face risk:** coffret trio (big sphere on top of two) read as a head with
   ears → three creatures side by side on one ground line.
3. **Face risk:** level bands across the middle (Minuit, Pistache, Orage…)
   could read as a visor or mouth → all band patterns run on a tilted axis,
   like a planet's ring.
4. Product-card buttons misaligned across a row → price row pinned to the
   card bottom.
5. Mobile filter chips cut mid-chip with no hint → fade mask on the scroller.
6. Mobile footer too tall → smaller wordmark and tighter rhythm on phones.
7. À propos chapter numerals collided with the rings; failed contrast → moved,
   solid colour ≥ 3:1.
8. Contact aside looked unanchored → the creature now sits on a tinted plate.
9. Collection flight cropped creatures on portrait screens → camera distance
   follows the aspect ratio, not the width.
10. Dark theme: plates were flat grey boxes → tinted glow + hairline edge.
11. SEO: missing robots.txt → robots.txt + sitemap.xml.
12. Intro animation used clamped frame deltas: on slow devices the fur grew in
    slow motion → wall-clock timing for appearances.

### Round 3 — council critique + own review
1. **Face risk:** Praline/Mirabelle spots could form an eyes-and-mouth triad →
   18–28 small scattered spots instead of 7–13 large ones.
2. **Face risk:** an off-centre tilted band reads as a smile → bands centred
   on the tilted equator.
3. **Face risk:** Réglisse's crown locks → a soft continuous crest of 17 short
   locks.
4. Featured cards were staggered, so labels sat on two baselines → one baseline.
5. Collection flight: captions blurred during the swap and creatures sat
   behind the text → crossfade, creatures shifted right on landscape screens,
   warm nebulae mixed with violet (no muddy brown).
6. Boutique ended on an orphan card → coffrets are wide cards (3 × 2 + 14 = five full rows).
7. Creature sheet: CTA was below the fold → CTA sits under the tagline; spec
   rows tidied; tagline leading tightened.
8. Contact inputs had 1.6:1 borders → ≥ 3:1 non-text contrast.
9. Concept section text ran into the section edge → more bottom padding.
10. Still vs live 3D size jump at the sheet crossfade → framing matched.

### Polish pass
- **Removed:** the concentric orbit rings around the À propos chapter
  creatures. They repeated the hero's rings three more times and made the
  storytelling busier; the creature alone, with parallax, carries the chapter.
- Easing unified on `cubic-bezier(.22,1,.36,1)`; exits are shorter than
  entrances (cart, sheet, route).
- Dark-theme plates re-lit with a tinted glow and a hairline edge.

## 10. Verified results (final build, `npm run preview`)

- `npm run build`: passes, no warnings. Initial JS ≈ 147 KB gzip; the 3D
  bundle (≈ 240 KB gzip) loads only when a scene mounts.
- `scripts/interactions.mjs`: 36/36 checks pass (keyboard, skip link, focus
  trap and return, Escape, filters, cart and persistence, live announcements,
  form validation and success, back button, deep links, mobile menu, no
  horizontal scroll, touch targets).
- Console: no errors or warnings on any page at 390 / 768 / 1440, light and dark,
  reduced motion, and without WebGL.
- Lighthouse, mobile preset, headless Chromium with **software** GL (so the
  site serves its `static` tier), five runs, one per page:

  | Page | Perf | A11y | Best practices | SEO | LCP | TBT |
  |---|---|---|---|---|---|---|
  | Accueil | 76 | 100 | 100 | 100 | 4.5 s | 200 ms |
  | Boutique | 83 | 100 | 100 | 100 | 3.9 s | 70 ms |
  | Créatures | 73 | 100 | 100 | 100 | 5.4 s | 160 ms |
  | À propos | 84 | 100 | 100 | 100 | 3.5 s | 120 ms |
  | Contact | 87 | 100 | 100 | 100 | 3.2 s | 70 ms |

  Performance misses the 90 target. The limit is FCP (≈ 2.9 s): a client-rendered
  SPA must download and run ≈ 147 KB of JS on the simulated slow-4G profile
  before anything paints. Pre-rendering each route to static HTML is the
  next step (see limitations).

## 11. Known limitations

- **Frame rate on real phones is unmeasured.** This environment has no GPU,
  so 60 fps on a mid-range phone could not be verified. The budgets are set
  for it (medium tier: 22 shells, DPR ≤ 1.5, stills on cards, off-screen
  canvases paused, DPR steps down if FPS drops), but they still need a real
  device check.
- The 3D path was audited only on software GL (Lighthouse Perf 39 with 3D
  forced on). That is why software renderers now get stills.
- No pre-rendering/SSR: FCP depends on JS. Route-level pre-rendering (e.g.
  `vite-react-ssg`) would bring FCP and LCP down considerably.
- The shell-fur silhouette is alpha-tested, so strand tips can alias slightly
  at DPR 1. At DPR ≥ 1.5 (most phones) this is not visible.
- Checkout and the contact form are simulated behind clearly marked hooks.
