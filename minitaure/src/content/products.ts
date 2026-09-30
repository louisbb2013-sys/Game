import type { Product } from './types';
import { sortedCreatures } from './creatures';

/** Figurine prices by catalogue number (cents). Anything missing costs 24 €. */
const figurinePrices: Record<string, number> = {
  brume: 2400,
  praline: 2200,
  minuit: 2600,
  pistache: 2200,
  abricot: 2200,
  comete: 2400,
  reglisse: 2600,
  chantilly: 2600,
  lagune: 2400,
  galet: 2200,
  ecume: 2600,
  mirabelle: 2400,
  orage: 2400,
  guimauve: 2600,
};

/** One figurine per creature, generated so a new creature appears in the shop automatically. */
const figurines: Product[] = sortedCreatures.map((c) => ({
  slug: c.slug,
  name: c.name,
  kind: 'figurine',
  priceCents: figurinePrices[c.slug] ?? 2400,
  creatures: [c.slug],
  collection: c.collection,
  blurb: c.tagline,
}));

const coffrets: Product[] = [
  {
    slug: 'coffret-nebuleuse',
    name: 'Coffret Nébuleuse',
    kind: 'coffret',
    priceCents: 5800,
    creatures: ['brume', 'minuit', 'comete'],
    collection: 'nebuleuse',
    blurb: 'Les trois premières venues du ciel, dans une boîte couleur de nuit.',
    edition: 'Édition numérotée',
  },
  {
    slug: 'coffret-sucrerie',
    name: 'Coffret Sucrerie',
    kind: 'coffret',
    priceCents: 5600,
    creatures: ['praline', 'pistache', 'chantilly'],
    collection: 'sucrerie',
    blurb: 'Un trio tendre, rangé comme des bonbons dans du papier de soie.',
  },
  {
    slug: 'coffret-premieres-lueurs',
    name: 'Coffret Premières lueurs',
    kind: 'coffret',
    priceCents: 5700,
    creatures: ['abricot', 'reglisse', 'mirabelle'],
    collection: 'aurore',
    blurb: 'Trois créatures de l’aube, pour les étagères qui voient le soleil se lever.',
  },
];

export const products: Product[] = [...coffrets, ...figurines];

export const productBySlug = (slug: string) => products.find((p) => p.slug === slug);

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
export const formatPrice = (cents: number) => eur.format(cents / 100);
