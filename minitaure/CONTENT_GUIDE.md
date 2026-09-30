# Content guide

All site content lives in three typed files in `src/content/`. You never need to
touch a component to add a creature, a product or a collection. TypeScript
flags missing or misspelled fields when you run `npm run dev` or `npm run build`.

## Add a creature

1. Open `src/content/creatures.ts` and copy an existing entry into the `creatures` array.
2. Fill in the fields:

   | Field | Notes |
   |---|---|
   | `slug` | Unique, lowercase, no accents or spaces (`nuage`). Used in the URL `/creatures/nuage`. |
   | `number` | Next free catalogue number. It is displayed as « N° 015 ». |
   | `name`, `tagline`, `story` | French copy. `story` holds 1–3 short paragraphs. Keep the voice calm, a little mysterious, never salesy. |
   | `collection` | The `slug` of an existing collection (see below). |
   | `size`, `material` | Shown in the creature sheet. |
   | `seed` | Any whole number. It changes the body lumps and the pattern layout. Try a few until you like the silhouette. |
   | `fur.base` / `fur.tip` | Root and tip colours (hex). The tip is usually a little deeper. |
   | `fur.length` | `0.08` (short velvet) to `0.17` (very fluffy). |
   | `fur.density` | `95` (airy) to `130` (dense). |
   | `fur.thickness`, `fur.droop`, `fur.flow` | Optional fine-tuning: strand width, gravity, combing. |
   | `detail.kind` | One of `plain`, `tuft`, `crown`, `spots`, `stripes`, `band`, `sheen`, `speckle`, `fringe`. |
   | `detail.color`, `detail.amount` | Detail colour and strength (0–1). |
   | `shape.squash`, `shape.lumpiness` | Optional: `0.84` (pebble) to `1` (round), and `0` (smooth) to `0.1` (lumpy). |
   | `isNew`, `featured` | Show it in « Dernières créations » or « À la une ». |

3. Preview it in isolation: run `npm run dev` and open
   `http://localhost:5173/_lab?c=nuage` (add `&mood=night` for the night lighting).
4. Render its still, which is used for cards, fallbacks and reduced motion:
   ```bash
   ONLY=nuage npm run stills
   ```
   Until you do this, the site shows a CSS fur ball built from the creature's colours, so nothing breaks.
5. Add `/creatures/nuage` to `public/sitemap.xml`.

A figurine for the new creature appears in the Boutique automatically at 24 €.
To set another price, add the slug to `figurinePrices` in `products.ts`.

> **Rule of the universe:** creatures never have a face. Details are colour, texture and shape only. Avoid two small, symmetric marks side by side on the front, and anything that reads as eyes or a mouth. Band patterns are automatically tilted like a planet's ring for this reason.

## Add a product

Figurines are generated from the creatures. To add a **coffret** (box set), or
any other product, append an entry to `coffrets` in `src/content/products.ts`:

```ts
{
  slug: 'coffret-maree',            // unique
  name: 'Coffret Marée',
  kind: 'coffret',
  priceCents: 5700,                 // 57 €, always in cents
  creatures: ['lagune', 'galet', 'ecume'], // shown side by side on the card
  collection: 'maree',              // used by the Boutique filters
  blurb: 'Trois créatures ramenées par la même marée.',
  edition: 'Édition numérotée',     // optional label
},
```

## Add a collection

1. Append an entry to `src/content/collections.ts`:

   ```ts
   {
     slug: 'givre',
     name: 'Givre',
     subtitle: 'Nées des nuits claires',
     description: 'Une ou deux phrases pour la collection.',
     accent: '#8FB8E8',   // dots, chips, nebula glow in the 3D flight
     tint: '#EEF4FC',     // soft plate background behind the creatures
   },
   ```

2. Set `collection: 'givre'` on the creatures (and products) that belong to it.

The collection then appears everywhere without code changes: Boutique and
Créatures filters, the footer, and the Accueil scroll-driven 3D flight, which
adds a new constellation stop.

## Site-wide copy

Navigation labels, the tagline, social links and the contact e-mail live in
`src/content/site.ts`.
