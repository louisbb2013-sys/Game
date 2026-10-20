import type { PetSpeciesId, Rarity } from '@lumo/core';

/**
 * How each Lumo pet looks in 3D: one of the five furry body shapes from the Minitaure engine
 * (calf with horns, fox, otter, owl, bunny) in its own colours. Rarer pets glow and sparkle more.
 */
type Forme = 'minotaure' | 'gribou' | 'bloop' | 'noki' | 'pipo';

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
  };
}

const LOOKS: Record<PetSpeciesId, { forme: Forme; base: string; accent: string }> = {
  moss_turtle: { forme: 'bloop', base: '#3FAF5C', accent: '#B6F0A0' },
  cloud_sheep: { forme: 'pipo', base: '#DCE3F0', accent: '#FFC1D9' },
  pixel_owl: { forme: 'noki', base: '#B07A3A', accent: '#FFB347' },
  puddle_frog: { forme: 'bloop', base: '#7ED957', accent: '#2E9E4A' },
  acorn_squirrel: { forme: 'gribou', base: '#B5652B', accent: '#FFD8B0' },
  comet_fox: { forme: 'gribou', base: '#FF6A45', accent: '#FFE6D8' },
  crystal_cat: { forme: 'gribou', base: '#45C1FF', accent: '#E3F7FF' },
  snow_penguin: { forme: 'noki', base: '#3B6FD8', accent: '#FFFFFF' },
  lucky_bunny: { forme: 'pipo', base: '#FF8FC1', accent: '#FFE1EE' },
  star_jelly: { forme: 'bloop', base: '#A06BFF', accent: '#F0D8FF' },
  bubble_octo: { forme: 'bloop', base: '#FF4F9A', accent: '#FFD1E6' },
  rock_dino: { forme: 'minotaure', base: '#2FA36B', accent: '#FFE27A' },
  mystic_unicorn: { forme: 'minotaure', base: '#B9A0FF', accent: '#FF9FC8' },
  ember_dragon: { forme: 'minotaure', base: '#FF4A3D', accent: '#FFC21F' },
  cosmic_whale: { forme: 'bloop', base: '#2F5BFF', accent: '#9FE8FF' },
  aurora_peacock: { forme: 'noki', base: '#14B8A6', accent: '#C084FC' },
  celestial_phoenix: { forme: 'noki', base: '#FF8A1C', accent: '#FF4FD8' },
  galaxy_dragon: { forme: 'minotaure', base: '#6D3BFF', accent: '#35E3FF' },
};

const GLOW: Record<Rarity, number> = { common: 0.05, rare: 0.18, epic: 0.32, legendary: 0.5, mythical: 0.7 };

export function lookFor(species: string, rarity: Rarity = 'common') {
  const l = LOOKS[species as PetSpeciesId] ?? LOOKS.moss_turtle;
  return { forme: l.forme, palette: palette(l.base, l.accent), glow: GLOW[rarity], sparkle: [l.base, l.accent, '#FFE27A'] };
}
