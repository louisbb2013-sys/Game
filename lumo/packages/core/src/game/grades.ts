/**
 * Player grades, from the learner's level: Grade 4 (the start) up to Special Grade (the top). Each
 * promotion is a moment: coins, and a chest for the top grades.
 */
export const GRADES = [
  { id: 'grade4', from: 1, emoji: '🪨', coins: 0 },
  { id: 'grade3', from: 5, emoji: '🥉', coins: 50 },
  { id: 'grade2', from: 10, emoji: '🥈', coins: 100 },
  { id: 'semi1', from: 20, emoji: '🥇', coins: 200 },
  { id: 'grade1', from: 30, emoji: '🏅', coins: 300 },
  { id: 'special1', from: 45, emoji: '💎', coins: 500 },
  { id: 'special', from: 65, emoji: '👑', coins: 1000 },
] as const;
export type GradeId = (typeof GRADES)[number]['id'];

/** The grade at a level, its place (0 = Grade 4) and the next one (null at Special Grade). */
export function gradeFor(level: number) {
  let i = 0;
  while (i + 1 < GRADES.length && level >= GRADES[i + 1]!.from) i++;
  const g = GRADES[i]!;
  const next = GRADES[i + 1];
  return { id: g.id as GradeId, emoji: g.emoji, index: i, next: next ? { id: next.id as GradeId, level: next.from } : null };
}

// ---------------- the daily gift ----------------

/** A gift a day, better each day in a row, round a week: coins, snacks, a boost, a chest, an egg. */
export const DAILY_GIFTS = [
  { coins: 20 },
  { item: 'pet_food', qty: 3 },
  { coins: 40 },
  { item: 'xp_boost', qty: 1 },
  { coins: 60 },
  { chest: 'rare' },
  { item: 'egg_rare', qty: 1 },
] as const;
export type DailyGift = (typeof DAILY_GIFTS)[number];

/** Which gift today's claim gives (0-6), from the last day claimed and the streak of claims. */
export function dailyGiftDay(last: string | null, streak: number, today: string, yesterday: string): { day: number; available: boolean } {
  if (last === today) return { day: (streak - 1) % DAILY_GIFTS.length, available: false };
  const keep = last === yesterday ? streak : 0;
  return { day: keep % DAILY_GIFTS.length, available: true };
}
