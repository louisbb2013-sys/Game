import type { PetSpeciesId, Rarity } from '@lumo/core';

/**
 * How each Lumo pet looks in 3D: its own furry body (a woolly ball, a pixel cube, a jellyfish, a
 * whale, a manta, a serpent dragon… see the `plan_*` builders in creatures.js), each with its own idle
 * animation, in its own colours. Rarer pets glow and sparkle more; galaxial ones are starry.
 */
type Forme =
  | 'tortue'
  | 'mouton'
  | 'cube'
  | 'renard'
  | 'chat'
  | 'meduse'
  | 'poulpe'
  | 'dragon'
  | 'grenouille'
  | 'ecureuil'
  | 'pingouin'
  | 'lapin'
  | 'dino'
  | 'licorne'
  | 'baleine'
  | 'paon'
  | 'phenix'
  | 'serpent'
  | 'axolotl'
  | 'raie'
  | 'luciole';

const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
function mix(a: string, b: string, t: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `#${pa.map((v, i) => hex(v + (pb[i]! - v) * t)).join('')}`;
}

/** A full palette (root → tip of the fur, belly, paws, ears, details) from one colour and an accent. */
function palette(base: string, accent: string) {
  return {
    racine: mix(base, '#000000', 0.5),
    base,
    pointe: mix(base, '#ffffff', 0.32),
    ventre: mix(base, '#ffffff', 0.58),
    patte: mix(base, '#000000', 0.38),
    oreille: accent,
    oreille2: mix(base, '#000000', 0.12),
    corne: '#FFF0D2',
    touffe: mix(base, '#ffffff', 0.75),
    plume: accent,
    accent,
  };
}

interface Look {
  forme: Forme;
  base: string;
  accent: string;
  /** Star-tipped fur (0..1), rainbow sheen (0..1), nebula clouds in the fur. */
  etoiles?: number;
  iris?: number;
  nebuleuse?: string;
}

const LOOKS: Record<PetSpeciesId, Look> = {
  moss_turtle: { forme: 'tortue', base: '#3FAF5C', accent: '#B9E87A' },
  cloud_sheep: { forme: 'mouton', base: '#E4E9F5', accent: '#FFC1D9' },
  pixel_owl: { forme: 'cube', base: '#B07A3A', accent: '#FFA733' },
  puddle_frog: { forme: 'grenouille', base: '#7ED957', accent: '#2E9E4A' },
  acorn_squirrel: { forme: 'ecureuil', base: '#C46A2B', accent: '#FFD8B0' },
  comet_fox: { forme: 'renard', base: '#FF6A45', accent: '#FFE6D8' },
  crystal_cat: { forme: 'chat', base: '#45C1FF', accent: '#E3F7FF' },
  snow_penguin: { forme: 'pingouin', base: '#3566D0', accent: '#FFFFFF' },
  lucky_bunny: { forme: 'lapin', base: '#FF8FC1', accent: '#FFE1EE' },
  star_jelly: { forme: 'meduse', base: '#A06BFF', accent: '#F0D8FF' },
  bubble_octo: { forme: 'poulpe', base: '#FF4F9A', accent: '#FFD1E6' },
  rock_dino: { forme: 'dino', base: '#2FA36B', accent: '#FFD66B' },
  mystic_unicorn: { forme: 'licorne', base: '#D8CCFF', accent: '#FF9FC8', iris: 0.12 },
  ember_dragon: { forme: 'dragon', base: '#FF4A3D', accent: '#FFA733' },
  cosmic_whale: { forme: 'baleine', base: '#2F5BFF', accent: '#9FE8FF', etoiles: 0.4 },
  aurora_peacock: { forme: 'paon', base: '#1F8FD0', accent: '#C084FC' },
  celestial_phoenix: { forme: 'phenix', base: '#FF8A1C', accent: '#FF4FD8' },
  galaxy_dragon: { forme: 'serpent', base: '#6D3BFF', accent: '#35E3FF', etoiles: 0.9, nebuleuse: '#FF6AD5' },
  prism_axolotl: { forme: 'axolotl', base: '#3FD8F0', accent: '#FF7AD9', iris: 0.4 },
  nebula_manta: { forme: 'raie', base: '#4F46E5', accent: '#F0ABFC', etoiles: 1, nebuleuse: '#22D3EE' },
  lumo_firefly: { forme: 'luciole', base: '#4F46E5', accent: '#FBBF24' },
  solar_lion: { forme: 'chat', base: '#F59E0B', accent: '#FFF1A8', iris: 0.2 },
  divine_griffin: { forme: 'phenix', base: '#FDF2C4', accent: '#93C5FD', iris: 0.3 },
};

/** Rarer = more glow; the top tiers also change the fur (prism sheen, stars, gold). */
const GLOW: Record<Rarity, number> = { common: 0.05, rare: 0.18, epic: 0.32, legendary: 0.5, mythical: 0.7, exotic: 0.8, galaxial: 0.9, celestial: 0.95, divine: 1, lumo: 1.05 };
const SPARKLE: Partial<Record<Rarity, string[]>> = {
  exotic: ['#2DD4BF', '#A3E635', '#F0ABFC', '#FFFFFF'],
  galaxial: ['#FFFFFF', '#C7D2FE', '#A5F3FC', '#F0ABFC'],
  celestial: ['#FFF1A8', '#FDBA3B', '#FFFFFF', '#FB923C'],
  divine: ['#FFFFFF', '#FDF2C4', '#93C5FD', '#FDE68A'],
  lumo: ['#FFE08A', '#FACC15', '#FFF3C4', '#FFB21C'],
};

/** The sparkle colours of the top tiers (null below them: a pet's own colours are used). */
export const tierSparkle = (rarity: Rarity) => SPARKLE[rarity] ?? null;

export function lookFor(species: string, rarity: Rarity = 'common') {
  const l = LOOKS[species as PetSpeciesId] ?? LOOKS.moss_turtle;
  return {
    forme: l.forme,
    palette: palette(l.base, l.accent),
    glow: GLOW[rarity] ?? GLOW.common,
    // Any pet raised to a cosmic tier gets a little of that tier's magic in its fur.
    etoiles: Math.max(l.etoiles ?? 0, rarity === 'galaxial' ? 0.6 : 0),
    iris: Math.max(l.iris ?? 0, rarity === 'exotic' ? 0.3 : 0),
    nebuleuse: l.nebuleuse ?? (rarity === 'galaxial' ? '#818CF8' : undefined),
    sparkle: SPARKLE[rarity] ?? [l.base, l.accent, '#FFE27A'],
  };
}
