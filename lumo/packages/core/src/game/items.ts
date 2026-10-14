import { pickWeighted, type Rng } from '../rng';
import { HOUR_MS, MINUTE_MS, type Millis } from '../types';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary'];

// ---------------- pets ----------------

export const PET_SPECIES = [
  { id: 'moss_turtle', emoji: '🐢', rarity: 'common', color: '#22C55E' },
  { id: 'cloud_sheep', emoji: '🐑', rarity: 'common', color: '#94A3B8' },
  { id: 'pixel_owl', emoji: '🦉', rarity: 'common', color: '#A16207' },
  { id: 'comet_fox', emoji: '🦊', rarity: 'rare', color: '#F97316' },
  { id: 'crystal_cat', emoji: '🐱', rarity: 'rare', color: '#38BDF8' },
  { id: 'star_jelly', emoji: '🪼', rarity: 'epic', color: '#C084FC' },
  { id: 'bubble_octo', emoji: '🐙', rarity: 'epic', color: '#F472B6' },
  { id: 'ember_dragon', emoji: '🐉', rarity: 'legendary', color: '#EF4444' },
  { id: 'puddle_frog', emoji: '🐸', rarity: 'common', color: '#4ADE80' },
  { id: 'acorn_squirrel', emoji: '🐿️', rarity: 'common', color: '#B45309' },
  { id: 'snow_penguin', emoji: '🐧', rarity: 'rare', color: '#60A5FA' },
  { id: 'lucky_bunny', emoji: '🐰', rarity: 'rare', color: '#F9A8D4' },
  { id: 'rock_dino', emoji: '🦖', rarity: 'epic', color: '#16A34A' },
  { id: 'mystic_unicorn', emoji: '🦄', rarity: 'epic', color: '#A78BFA' },
  { id: 'cosmic_whale', emoji: '🐋', rarity: 'legendary', color: '#3B82F6' },
  { id: 'aurora_peacock', emoji: '🦚', rarity: 'legendary', color: '#14B8A6' },
] as const satisfies readonly { id: string; emoji: string; rarity: Rarity; color: string }[];
export type PetSpeciesId = (typeof PET_SPECIES)[number]['id'];
export const STARTER_PETS: PetSpeciesId[] = ['moss_turtle', 'cloud_sheep', 'pixel_owl'];
export const speciesOf = (id: string) => PET_SPECIES.find((s) => s.id === id);

// ---------------- items ----------------

export type ItemId =
  | 'streak_freeze'
  | 'heart_refill'
  | 'xp_boost'
  | 'pet_food'
  | 'egg_common'
  | 'egg_rare'
  | 'chest_common'
  | 'theme_sunset'
  | 'theme_ocean'
  | 'theme_forest'
  | 'theme_galaxy';

export interface ItemDef {
  id: ItemId;
  emoji: string;
  price: number | null; // coins; null = not sold, only from chests
  kind: 'consumable' | 'egg' | 'chest' | 'cosmetic';
}

export const ITEMS: Record<ItemId, ItemDef> = {
  streak_freeze: { id: 'streak_freeze', emoji: '🧊', price: 60, kind: 'consumable' },
  heart_refill: { id: 'heart_refill', emoji: '💗', price: 40, kind: 'consumable' },
  xp_boost: { id: 'xp_boost', emoji: '⚡', price: 80, kind: 'consumable' },
  pet_food: { id: 'pet_food', emoji: '🍎', price: 10, kind: 'consumable' },
  egg_common: { id: 'egg_common', emoji: '🥚', price: 150, kind: 'egg' },
  egg_rare: { id: 'egg_rare', emoji: '🪺', price: 400, kind: 'egg' },
  chest_common: { id: 'chest_common', emoji: '🎁', price: 90, kind: 'chest' },
  theme_sunset: { id: 'theme_sunset', emoji: '🌅', price: 200, kind: 'cosmetic' },
  theme_ocean: { id: 'theme_ocean', emoji: '🌊', price: 200, kind: 'cosmetic' },
  theme_forest: { id: 'theme_forest', emoji: '🌲', price: 200, kind: 'cosmetic' },
  theme_galaxy: { id: 'theme_galaxy', emoji: '🌌', price: null, kind: 'cosmetic' },
};

export const XP_BOOST_MS = 15 * MINUTE_MS;
export const XP_BOOST_BONUS = 0.5; // +50% while active

/** Eggs hatch into a species; rarer eggs have better odds. */
export function hatch(egg: 'egg_common' | 'egg_rare', rng: Rng): PetSpeciesId {
  const weights: Record<Rarity, number> = egg === 'egg_common' ? { common: 70, rare: 24, epic: 5, legendary: 1 } : { common: 0, rare: 60, epic: 32, legendary: 8 };
  const rarity = pickWeighted(
    RARITIES.map((r) => ({ item: r, weight: weights[r] })),
    rng,
  );
  const options = PET_SPECIES.filter((s) => s.rarity === rarity);
  return options[Math.floor(rng() * options.length)]!.id;
}

// ---------------- the study egg (Gizmo-style: answering questions hatches it) ----------------

/** Questions to answer before an egg of each rarity hatches. */
export const EGG_TARGET: Record<Rarity, number> = { common: 10, rare: 20, epic: 40, legendary: 60 };
/** The very first egg hatches quickly, so the reward comes on day one. */
export const FIRST_EGG_TARGET = 5;
export const EGG_EMOJI: Record<Rarity, string> = { common: '🥚', rare: '🪺', epic: '🔮', legendary: '🌟' };

/** A new egg's rarity: mostly common, sometimes something special. */
export function rollEggRarity(rng: Rng): Rarity {
  return pickWeighted(
    [
      { item: 'common' as Rarity, weight: 68 },
      { item: 'rare' as Rarity, weight: 24 },
      { item: 'epic' as Rarity, weight: 6 },
      { item: 'legendary' as Rarity, weight: 2 },
    ],
    rng,
  );
}

/** Which pet comes out of an egg of this rarity. */
export function hatchRarity(rarity: Rarity, rng: Rng): PetSpeciesId {
  const options = PET_SPECIES.filter((s) => s.rarity === rarity);
  return options[Math.floor(rng() * options.length)]!.id;
}

/** A duplicate pet isn't wasted: it powers up the one you already have. */
export const DUPLICATE_PET_XP: Record<Rarity, number> = { common: 40, rare: 80, epic: 160, legendary: 320 };

// ---------------- chests ----------------

export type ChestKind = 'common' | 'rare' | 'epic';

export interface Loot {
  coins: number;
  items: { id: ItemId; qty: number }[];
}

/** Every chest gives coins plus 1-3 item rolls; better chests give more and rarer things. */
export function rollChest(kind: ChestKind, rng: Rng): Loot {
  const coinRange = { common: [15, 40], rare: [40, 90], epic: [100, 200] }[kind] as [number, number];
  const rolls = { common: 1, rare: 2, epic: 3 }[kind];
  const table: Record<ChestKind, { item: ItemId; weight: number }[]> = {
    common: [
      { item: 'pet_food', weight: 40 },
      { item: 'streak_freeze', weight: 20 },
      { item: 'heart_refill', weight: 20 },
      { item: 'xp_boost', weight: 15 },
      { item: 'egg_common', weight: 5 },
    ],
    rare: [
      { item: 'pet_food', weight: 25 },
      { item: 'streak_freeze', weight: 20 },
      { item: 'xp_boost', weight: 25 },
      { item: 'egg_common', weight: 20 },
      { item: 'egg_rare', weight: 7 },
      { item: 'theme_galaxy', weight: 3 },
    ],
    epic: [
      { item: 'xp_boost', weight: 25 },
      { item: 'streak_freeze', weight: 20 },
      { item: 'egg_rare', weight: 30 },
      { item: 'egg_common', weight: 15 },
      { item: 'theme_galaxy', weight: 10 },
    ],
  };
  const items = new Map<ItemId, number>();
  for (let i = 0; i < rolls; i++) {
    const id = pickWeighted(table[kind], rng);
    const qty = id === 'pet_food' ? 2 + Math.floor(rng() * 4) : 1;
    items.set(id, (items.get(id) ?? 0) + qty);
  }
  return { coins: coinRange[0] + Math.floor(rng() * (coinRange[1] - coinRange[0] + 1)), items: [...items].map(([id, qty]) => ({ id, qty })) };
}

// ---------------- pet care ----------------

export interface PetState {
  species: PetSpeciesId;
  level: number;
  xp: number;
  /** 100 = full; drops ~1 point per hour. */
  fullness: number;
  fedAt: Millis;
}

export const PET_FULL = 100;
const HUNGER_PER_HOUR = 1;

export function petXpForLevel(level: number) {
  return 40 + level * 30;
}

export function currentFullness(p: PetState, now: Millis): number {
  return Math.max(0, Math.round(p.fullness - ((now - p.fedAt) / HOUR_MS) * HUNGER_PER_HOUR));
}

export function feedPet(p: PetState, now: Millis): PetState {
  const fullness = Math.min(PET_FULL, currentFullness(p, now) + 35);
  return addPetXp({ ...p, fullness, fedAt: now }, 15);
}

export function addPetXp(p: PetState, xp: number): PetState {
  let { level, xp: cur } = p;
  cur += Math.max(0, Math.round(xp));
  while (level < 50 && cur >= petXpForLevel(level)) {
    cur -= petXpForLevel(level);
    level++;
  }
  return { ...p, level, xp: cur };
}

export type PetMood = 'happy' | 'content' | 'hungry' | 'sad';

/** Pets react to the learner's streak and to how well they are fed. */
export function petMood(p: PetState, now: Millis, streakStatus: 'none' | 'safe' | 'at_risk' | 'broken'): PetMood {
  const full = currentFullness(p, now);
  if (streakStatus === 'broken' || full < 10) return 'sad';
  if (full < 35) return 'hungry';
  if (streakStatus === 'safe') return 'happy';
  return 'content';
}

const PERK_BY_RARITY: Record<Rarity, number> = { common: 0.02, rare: 0.04, epic: 0.06, legendary: 0.08 };

/** XP bonus from the equipped pet: rarer and higher level = a little more (never pay-to-win). */
export function petXpPerk(p: PetState, mood: PetMood): number {
  const s = speciesOf(p.species);
  if (!s || mood === 'sad') return 0;
  return Math.min(0.15, PERK_BY_RARITY[s.rarity] + Math.floor(p.level / 5) * 0.01);
}
