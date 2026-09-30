/**
 * Content model. Everything visible on the site is driven by these types.
 * See CONTENT_GUIDE.md for step-by-step instructions.
 */

/** Visual detail patterns. Colour / texture / shape only — never facial. */
export type DetailKind =
  | 'plain'
  | 'tuft' // a small lock of longer fur on top
  | 'crown' // a ring of short tufts around the top
  | 'spots' // soft rounded spots in the detail colour
  | 'stripes' // soft horizontal stripes
  | 'band' // one soft horizontal band
  | 'sheen' // a silvery shimmering band
  | 'speckle' // tiny bright flecks on the tips
  | 'fringe'; // longer fur around the lower half, tinted

export interface FurParams {
  /** Base (root) colour, hex. */
  base: string;
  /** Tip colour, hex. */
  tip: string;
  /** Fur length relative to body radius (0.06 short – 0.2 long). */
  length: number;
  /** Strand density (40 sparse – 140 very dense). */
  density: number;
  /** Strand thickness 0.3 fine – 0.9 thick. */
  thickness?: number;
  /** How much strands droop under gravity (0 – 1). */
  droop?: number;
  /** How much strands lean/comb in a flow direction (0 – 1). */
  flow?: number;
}

export interface CreatureDetail {
  kind: DetailKind;
  /** Colour used by the detail (spots, band, fringe tint…). */
  color?: string;
  /** 0 – 1 strength / size of the detail. */
  amount?: number;
}

export interface CreatureShape {
  /** Vertical squash (0.85 flat – 1.05 tall). */
  squash?: number;
  /** Surface irregularity (0 perfect sphere – 0.12 lumpy). */
  lumpiness?: number;
}

export interface Creature {
  /** URL slug, unique, lowercase, no accents. */
  slug: string;
  /** Catalogue number, unique (displayed as N° 001). */
  number: number;
  name: string;
  /** Collection slug (see collections.ts). */
  collection: string;
  /** One sentence shown on cards. */
  tagline: string;
  /** Longer story shown in the creature sheet (1–3 short paragraphs). */
  story: string[];
  /** Human readable size. */
  size: string;
  material: string;
  /** Deterministic seed for the body shape and fur pattern. */
  seed: number;
  fur: FurParams;
  detail: CreatureDetail;
  shape?: CreatureShape;
  /** Added in the latest drop — shown in « Dernières créations ». */
  isNew?: boolean;
  /** Shown in the featured row on Accueil. */
  featured?: boolean;
}

export interface Collection {
  slug: string;
  name: string;
  /** Short poetic subtitle. */
  subtitle: string;
  description: string;
  /** Accent colour used for dots, chips and gradients. */
  accent: string;
  /** Soft background tint for plates. */
  tint: string;
}

export interface Product {
  slug: string;
  name: string;
  kind: 'figurine' | 'coffret';
  /** Price in euro cents to avoid float issues. */
  priceCents: number;
  /** Creatures shown in the product visual (1 for figurines, 3 for coffrets). */
  creatures: string[];
  /** Collection used for filtering. */
  collection: string;
  blurb: string;
  /** Optional edition label, e.g. « Édition limitée ». */
  edition?: string;
}
