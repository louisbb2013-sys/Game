import { pickWeighted, type Rng } from '../rng';
import { HOUR_MS, MINUTE_MS, type Millis } from '../types';

/**
 * Rarities, lowest to highest. Galaxial is the top anyone can reach (by eggs or upgrades); Lumo is the
 * ultimate rarity and only ever comes as a gift from the game's creator.
 */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythical' | 'exotic' | 'galaxial' | 'lumo';
export const RARITIES: Rarity[] = ['common', 'rare', 'epic', 'legendary', 'mythical', 'exotic', 'galaxial', 'lumo'];
/** The tier after this one (null at the top). */
export const nextRarity = (r: Rarity): Rarity | null => RARITIES[RARITIES.indexOf(r) + 1] ?? null;

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
  { id: 'celestial_phoenix', emoji: '🦅', rarity: 'mythical', color: '#FF9F1C' },
  { id: 'galaxy_dragon', emoji: '🐲', rarity: 'mythical', color: '#7C3AED' },
  { id: 'prism_axolotl', emoji: '🦎', rarity: 'exotic', color: '#22D3EE' },
  { id: 'nebula_manta', emoji: '🌌', rarity: 'galaxial', color: '#6366F1' },
  // Lumo the firefly: only ever a gift from the creator.
  { id: 'lumo_firefly', emoji: '✨', rarity: 'lumo', color: '#FACC15' },
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
  const weights: Record<Rarity, number> =
    egg === 'egg_common'
      ? { common: 70, rare: 24, epic: 5, legendary: 1, mythical: 0, exotic: 0, galaxial: 0, lumo: 0 }
      : { common: 0, rare: 58, epic: 32, legendary: 8, mythical: 1.6, exotic: 0.3, galaxial: 0.1, lumo: 0 };
  const rarity = pickWeighted(
    RARITIES.map((r) => ({ item: r, weight: weights[r] })),
    rng,
  );
  const options = PET_SPECIES.filter((s) => s.rarity === rarity);
  return options[Math.floor(rng() * options.length)]!.id;
}

// ---------------- the study egg (Gizmo-style: answering questions hatches it) ----------------

/** Questions to answer before an egg of each rarity hatches. */
export const EGG_TARGET: Record<Rarity, number> = { common: 15, rare: 30, epic: 50, legendary: 75, mythical: 100, exotic: 120, galaxial: 150, lumo: 200 };
/** The very first egg hatches quickly, so the reward comes on day one. */
export const FIRST_EGG_TARGET = 5;
export const EGG_EMOJI: Record<Rarity, string> = { common: '🥚', rare: '🪺', epic: '🔮', legendary: '🌟', mythical: '💠', exotic: '🧬', galaxial: '🌌', lumo: '✨' };

/** A new egg's rarity: mostly common, sometimes something special. */
export function rollEggRarity(rng: Rng): Rarity {
  return pickWeighted(
    [
      { item: 'common' as Rarity, weight: 67.5 },
      { item: 'rare' as Rarity, weight: 24 },
      { item: 'epic' as Rarity, weight: 6 },
      { item: 'legendary' as Rarity, weight: 2 },
      { item: 'mythical' as Rarity, weight: 0.4 },
      { item: 'exotic' as Rarity, weight: 0.08 },
      { item: 'galaxial' as Rarity, weight: 0.02 },
    ],
    rng,
  );
}

/** Which pet comes out of an egg of this rarity. */
export function hatchRarity(rarity: Rarity, rng: Rng): PetSpeciesId {
  const options = PET_SPECIES.filter((s) => s.rarity === rarity);
  return options[Math.floor(rng() * options.length)]!.id;
}

/** A duplicate pet isn't wasted: it powers up the one you already have, and you get snacks. */
export const DUPLICATE_PET_XP: Record<Rarity, number> = { common: 20, rare: 40, epic: 80, legendary: 160, mythical: 320, exotic: 480, galaxial: 640, lumo: 800 };
export const DUPLICATE_PET_SNACKS = 5;

// ---------------- chests ----------------

export type ChestKind = 'common' | 'rare' | 'epic';

export interface Loot {
  coins: number;
  items: { id: ItemId; qty: number }[];
}

/** Every chest gives coins plus 1-3 item rolls; better chests give more and rarer things. */
export function rollChest(kind: ChestKind, rng: Rng): Loot {
  const coinRange = { common: [10, 25], rare: [25, 60], epic: [70, 140] }[kind] as [number, number];
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
  /** Its rarity now: it starts at its species' rarity and can be upgraded. */
  tier?: Rarity;
}

/** A pet's rarity now (its species' rarity until it has been upgraded). */
export const petTier = (p: Pick<PetState, 'species' | 'tier'>): Rarity => p.tier ?? speciesOf(p.species)?.rarity ?? 'common';

/** What it takes to upgrade a pet FROM each tier to the next: coins, and the level it must have reached. */
export const PET_UPGRADES: Record<Rarity, { coins: number; level: number } | null> = {
  common: { coins: 200, level: 4 },
  rare: { coins: 450, level: 8 },
  epic: { coins: 1000, level: 14 },
  legendary: { coins: 2200, level: 22 },
  mythical: { coins: 4000, level: 30 },
  exotic: { coins: 7000, level: 40 },
  // Galaxial is as high as upgrades go: Lumo pets are gifts from the creator.
  galaxial: null,
  lumo: null,
};

/** Why a pet can't be upgraded right now, or null when it can. */
export function upgradeBlocker(p: PetState, coins: number): 'max_tier' | 'level_too_low' | 'not_enough_coins' | null {
  const cost = PET_UPGRADES[petTier(p)];
  if (!cost) return 'max_tier';
  if (p.level < cost.level) return 'level_too_low';
  if (coins < cost.coins) return 'not_enough_coins';
  return null;
}

/** The pet one tier up (check `upgradeBlocker` first). */
export function upgradePet(p: PetState): PetState {
  const next = nextRarity(petTier(p));
  return next ? { ...p, tier: next } : p;
}

export const PET_FULL = 100;
const HUNGER_PER_HOUR = 1;

export function petXpForLevel(level: number) {
  return 60 + level * 45;
}

export function currentFullness(p: PetState, now: Millis): number {
  return Math.max(0, Math.round(p.fullness - ((now - p.fedAt) / HOUR_MS) * HUNGER_PER_HOUR));
}

export function feedPet(p: PetState, now: Millis): PetState {
  const fullness = Math.min(PET_FULL, currentFullness(p, now) + 35);
  return addPetXp({ ...p, fullness, fedAt: now }, 10);
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

const PERK_BY_RARITY: Record<Rarity, number> = { common: 0.02, rare: 0.04, epic: 0.06, legendary: 0.08, mythical: 0.12, exotic: 0.14, galaxial: 0.16, lumo: 0.2 };

/** XP bonus from the equipped pet: rarer and higher level = a little more (never pay-to-win). */
export function petXpPerk(p: PetState, mood: PetMood): number {
  if (!speciesOf(p.species) || mood === 'sad') return 0;
  return Math.min(0.2, PERK_BY_RARITY[petTier(p)] + Math.floor(p.level / 5) * 0.01);
}

// ---------------- the team: up to 4 active pets, each with a bonus (like Gizmo's monsters) ----------------

export const MAX_ACTIVE_PETS = 4;

/** What a pet helps with: more XP, coins for each right answer, a chance to win a heart back, a faster egg. */
export type PetBuffKind = 'xp' | 'coins' | 'heart' | 'egg';

export const PET_BUFF: Record<PetSpeciesId, PetBuffKind> = {
  pixel_owl: 'xp',
  mystic_unicorn: 'xp',
  ember_dragon: 'xp',
  cosmic_whale: 'xp',
  galaxy_dragon: 'xp',
  lumo_firefly: 'xp',
  acorn_squirrel: 'coins',
  prism_axolotl: 'coins',
  comet_fox: 'coins',
  bubble_octo: 'coins',
  aurora_peacock: 'coins',
  moss_turtle: 'heart',
  crystal_cat: 'heart',
  lucky_bunny: 'heart',
  celestial_phoenix: 'heart',
  nebula_manta: 'heart',
  cloud_sheep: 'egg',
  puddle_frog: 'egg',
  snow_penguin: 'egg',
  star_jelly: 'egg',
  rock_dino: 'egg',
};

/** The bonus at level 1 for each rarity: a share (0.05 = 5 %), or coins for `coins`. */
const BUFF_BASE: Record<PetBuffKind, Record<Rarity, number>> = {
  xp: { common: 0.04, rare: 0.06, epic: 0.08, legendary: 0.1, mythical: 0.14, exotic: 0.17, galaxial: 0.2, lumo: 0.25 },
  heart: { common: 0.05, rare: 0.08, epic: 0.11, legendary: 0.14, mythical: 0.18, exotic: 0.22, galaxial: 0.26, lumo: 0.3 },
  egg: { common: 0.1, rare: 0.15, epic: 0.2, legendary: 0.25, mythical: 0.35, exotic: 0.42, galaxial: 0.5, lumo: 0.6 },
  coins: { common: 1, rare: 1, epic: 2, legendary: 2, mythical: 3, exotic: 3, galaxial: 4, lumo: 5 },
};
/** The whole team's bonus never goes past these. */
export const BUFF_CAP: Record<PetBuffKind, number> = { xp: 0.4, heart: 0.5, egg: 0.75, coins: 8 };
/** Below this fullness a pet is too hungry to help (feed it and its bonus comes back). */
export const HUNGRY_BUFF_LIMIT = 10;

export interface PetBuff {
  kind: PetBuffKind;
  value: number;
}

/** This pet's bonus: set by what it is, growing with its rarity and level. */
export function petBuff(p: Pick<PetState, 'species' | 'tier' | 'level'>): PetBuff {
  const kind = PET_BUFF[p.species as PetSpeciesId] ?? 'xp';
  const level = Math.max(1, p.level);
  let value = BUFF_BASE[kind][petTier(p)];
  if (kind === 'coins') value += Math.floor(level / 10); // +1 coin at levels 10, 20, …
  else if (kind === 'xp') value += Math.floor((level - 1) / 2) * 0.01; // +1 % every 2 levels
  else value += Math.min(10, level - 1) * 0.01; // +1 % a level, up to +10 %
  return { kind, value: kind === 'coins' ? value : Math.round(value * 100) / 100 };
}

export const petTooHungry = (p: PetState, now: Millis) => currentFullness(p, now) < HUNGRY_BUFF_LIMIT;

/** What a team can add: the pets' own bonuses, plus `gold` (a share more coins on everything earned). */
export type TeamBuffKind = PetBuffKind | 'gold';
export type TeamBuffs = Record<TeamBuffKind, number>;

/**
 * Lumo power: what a Lumo-rarity pet adds on top of its own bonus. Huge, but once per team (two Lumo
 * pets don't double it) and capped, so it never maxes everything out.
 */
export const LUMO_POWER: TeamBuffs = { xp: 0.5, gold: 0.5, heart: 0.2, egg: 0.5, coins: 0 };
/** With Lumo power, the team's bonuses go up to these (instead of BUFF_CAP). */
export const LUMO_CAP: TeamBuffs = { xp: 0.75, gold: 0.5, heart: 0.6, egg: 1, coins: 8 };

/** Everything the active pets add up to (hungry ones don't help; each kind is capped). */
export function teamBuffs(team: PetState[], now: Millis): TeamBuffs {
  const sum: TeamBuffs = { xp: 0, coins: 0, heart: 0, egg: 0, gold: 0 };
  let lumo = false;
  for (const p of team.slice(0, MAX_ACTIVE_PETS)) {
    if (!speciesOf(p.species) || petTooHungry(p, now)) continue;
    const b = petBuff(p);
    sum[b.kind] += b.value;
    if (petTier(p) === 'lumo') lumo = true;
  }
  for (const k of Object.keys(BUFF_CAP) as PetBuffKind[]) sum[k] = Math.min(BUFF_CAP[k], Math.round(sum[k] * 100) / 100);
  if (lumo) for (const k of Object.keys(sum) as TeamBuffKind[]) sum[k] = Math.min(LUMO_CAP[k], Math.round((sum[k] + LUMO_POWER[k]) * 100) / 100);
  return sum;
}
