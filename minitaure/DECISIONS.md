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
