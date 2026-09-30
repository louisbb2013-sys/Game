# Minitaure

Website for Minitaure, a brand of small, faceless, fur-covered collectible
creatures. French copy, a soft cosmic universe, and a real-time shell-fur 3D
creature at its heart.

- **Stack:** Vite · React 19 · TypeScript · React Router 7 · Three.js (R3F 9 + drei 10) · GSAP ScrollTrigger · Motion · Lenis
- **Pages:** Accueil · Boutique · Créatures (+ creature sheet) · À propos · Contact · 404
- **Docs:** [DECISIONS.md](DECISIONS.md) (design plan, assumptions, review log) · [CONTENT_GUIDE.md](CONTENT_GUIDE.md) (add creatures, products, collections)

## Run

```bash
cd minitaure
npm install
npm run dev          # http://localhost:5173
```

## Build and deploy

```bash
npm run build        # type-check + production build into dist/
npm run preview      # serve dist/ on http://localhost:4173
```

`dist/` is a static SPA and can be hosted anywhere:

- **Netlify / Cloudflare Pages:** publish `dist/`. The `_redirects` file is generated for you.
- **GitHub Pages / any static host:** `404.html` is a copy of `index.html`, so deep links such as `/creatures/brume` work.
- **Sub-path hosting:** `BASE_PATH=/minitaure/ npm run build`.

Replace `https://minitaure.example` in `index.html`, `src/content/site.ts`, `public/robots.txt` and `public/sitemap.xml` with the real domain.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server. It also serves two dev-only routes: `/_lab?c=brume,praline&mood=night` (inspect the fur) and `/_render?c=brume` (still renderer). |
| `npm run stills` | Renders every creature with the real fur shader and saves transparent WebP stills to `src/assets/stills/`. These are the fallbacks and card images. Needs `npm run dev` running. `ONLY=brume npm run stills` renders one. |
| `npm run shots` | Takes review screenshots of every page at 390, 768 and 1440 px into `.shots/` and reports console errors and horizontal overflow. Options: `PAGES=/,/boutique`, `WIDTHS=390`, `Q=static`, `RM=1` (reduced motion), `DARK=1`. |
| `node scripts/interactions.mjs [url]` | Automated interaction checks: keyboard, skip link, filters, cart, dialogs, focus trap and return, form validation, back button, mobile menu, touch targets. |
| `node scripts/icons.mjs [url]` | Rasterises the favicon PNGs and, when given a server URL, captures `public/og.jpg`. |

The Playwright scripts use the preinstalled Chromium at `/opt/pw-browsers`. Set `CHROMIUM_PATH` to point them at another browser.

## Rendering tiers

The site picks a tier once per visit (see `src/hooks/useQuality.ts`):

| Tier | When | What renders |
|---|---|---|
| `high` | Desktop-class GPU | Full shell counts, live 3D card thumbnails in one shared canvas |
| `medium` | Phones, tablets, ≤ 4 cores | Fewer shells, lower DPR, stills on cards |
| `static` | No WebGL, software GL (no GPU), `prefers-reduced-motion`, ≤ 2 cores or ≤ 2 GB | Pre-rendered stills, no WebGL at all (the creature sheet offers an opt-in « Voir en 3D ») |

Force a tier with `?q=high|medium|static`. The choice is remembered for the tab.

## Project layout

```
src/
  content/     typed data: creatures.ts, products.ts, collections.ts, site.ts, stills.ts
  three/       Creature3D, fur shader, body geometry, scenes, star field, shared thumbnail canvas
  components/  Nav, MobileMenu, Footer, CartDrawer, CreatureSheet, cards, Reveal, Chips…
  pages/       Home, Shop, Creatures, About, Contact, NotFound (+ dev/ lab and still renderer)
  hooks/       useQuality, useReducedMotion, useFocusTrap, usePageMeta, useInView, useMediaQuery
  lib/         cart (context + localStorage), checkout hook, contact hook, smooth scroll
  styles/      tokens.css (all design tokens), global.css
scripts/       stills, screenshots, interaction checks, icons, postbuild
```

## Integration points

- **Checkout:** `src/lib/checkout.ts` → `startCheckout(lines)`
- **Contact form:** `src/lib/contact.ts` → `sendContactMessage(payload)`

Both are clearly marked and currently simulated.
