/** Offline reviews are synced later; they move spaced repetition but earn only a little XP (no farming). */
export const OFFLINE_MAX_REVIEWS = 60;
export const OFFLINE_MAX_AGE_MS = 7 * 86_400_000;
export const offlineXp = (correct: number) => Math.min(correct, 30) * 2;
