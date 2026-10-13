import type { Bloom, Format } from './types';

/** Harder, more generative formats earn more XP. */
export const FORMAT_XP: Record<Format, number> = {
  multiple_choice: 10,
  true_false_justify: 14,
  multiple_select: 12,
  matching: 12,
  ordering: 12,
  categorize: 12,
  label_diagram: 12,
  fill_blank: 14,
  type_answer: 16,
  spot_mistake: 16,
  cause_effect: 16,
  apply: 18,
  calculation: 18,
  compare: 18,
  explain: 20,
  teach_back: 30,
};

export const BLOOM_MULTIPLIER: Record<Bloom, number> = { remember: 1, understand: 1.2, apply: 1.4, analyze: 1.6 };

export const FIRST_TRY_BONUS = 5;
export const MAX_BOOST = 1; // boosts + pet perks can at most double XP

/** In-quiz answer streak → combo multiplier. */
export function comboMultiplier(combo: number): number {
  if (combo >= 10) return 2;
  if (combo >= 5) return 1.5;
  if (combo >= 3) return 1.2;
  return 1;
}

export interface AnswerXpInput {
  format: Format;
  bloom: Bloom;
  score: number; // 0..1
  firstTry: boolean;
  combo: number; // correct answers in a row, including this one
  boost?: number; // extra fraction from items/pets, e.g. 0.1 = +10%
}

export function xpForAnswer(i: AnswerXpInput): number {
  const score = Math.min(1, Math.max(0, i.score));
  if (score === 0) return 0;
  const base = FORMAT_XP[i.format] * BLOOM_MULTIPLIER[i.bloom] * score;
  const bonus = i.firstTry && score >= 0.999 ? FIRST_TRY_BONUS : 0;
  const boost = 1 + Math.min(Math.max(i.boost ?? 0, 0), MAX_BOOST);
  return Math.round((base + bonus) * comboMultiplier(i.combo) * boost);
}

/** Total XP needed to *reach* `level` (level 1 = 0 XP). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.round(50 * Math.pow(level - 1, 1.6));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export interface LevelProgress {
  level: number;
  current: number; // xp into this level
  needed: number; // xp span of this level
  ratio: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const start = xpForLevel(level);
  const end = xpForLevel(level + 1);
  return { level, current: xp - start, needed: end - start, ratio: (xp - start) / (end - start) };
}

/** Rewards granted when reaching a level. Exact contents of chests are rolled later. */
export function levelUpRewards(level: number): { coins: number; chest?: 'common' | 'rare' | 'epic'; unlock?: string } {
  const coins = 20 + level * 5;
  if (level % 10 === 0) return { coins, chest: 'epic', unlock: `pet_slot_${level / 10 + 1}` };
  if (level % 5 === 0) return { coins, chest: 'rare' };
  return { coins, chest: level % 2 === 0 ? 'common' : undefined };
}
