import { LEAGUE_TIERS, tierIndex, type LeagueTier } from '../leagues';
import { hashString, seededRng, shuffle } from '../rng';
import type { ChestKind } from './items';

/** Everything that can move quests, badges and stats forward. */
export type GameEvent =
  | { type: 'answer'; correct: boolean; combo: number }
  | { type: 'session_done'; perfect: boolean; answered: number }
  | { type: 'sandbox_done'; kind: string; score: number }
  | { type: 'mastered' }
  | { type: 'xp'; amount: number }
  | { type: 'deck_created' }
  | { type: 'streak'; days: number }
  | { type: 'chest_opened' }
  | { type: 'pet_fed' }
  | { type: 'league'; tier: LeagueTier }
  | { type: 'level'; level: number }
  | { type: 'live_done'; rank: number; players: number };

export interface Stats {
  answers: number;
  correct: number;
  sessions: number;
  perfectSessions: number;
  mastered: number;
  sandboxDone: number;
  sandboxKinds: string[];
  decks: number;
  bestStreak: number;
  bestCombo: number;
  chests: number;
  petsFed: number;
  bestTier: LeagueTier;
  level: number;
  liveGames: number;
  liveWins: number;
}

export function emptyStats(): Stats {
  return { answers: 0, correct: 0, sessions: 0, perfectSessions: 0, mastered: 0, sandboxDone: 0, sandboxKinds: [], decks: 0, bestStreak: 0, bestCombo: 0, chests: 0, petsFed: 0, bestTier: 'bronze', level: 1, liveGames: 0, liveWins: 0 };
}

export function applyStats(s: Stats, e: GameEvent): Stats {
  const n = { ...emptyStats(), ...s };
  switch (e.type) {
    case 'answer':
      return { ...n, answers: n.answers + 1, correct: n.correct + (e.correct ? 1 : 0), bestCombo: Math.max(n.bestCombo, e.combo) };
    case 'session_done':
      return { ...n, sessions: n.sessions + 1, perfectSessions: n.perfectSessions + (e.perfect ? 1 : 0) };
    case 'sandbox_done':
      return { ...n, sandboxDone: n.sandboxDone + 1, sandboxKinds: n.sandboxKinds.includes(e.kind) ? n.sandboxKinds : [...n.sandboxKinds, e.kind] };
    case 'mastered':
      return { ...n, mastered: n.mastered + 1 };
    case 'deck_created':
      return { ...n, decks: n.decks + 1 };
    case 'streak':
      return { ...n, bestStreak: Math.max(n.bestStreak, e.days) };
    case 'chest_opened':
      return { ...n, chests: n.chests + 1 };
    case 'pet_fed':
      return { ...n, petsFed: n.petsFed + 1 };
    case 'league':
      return { ...n, bestTier: tierIndex(e.tier) > tierIndex(n.bestTier) ? e.tier : n.bestTier };
    case 'level':
      return { ...n, level: Math.max(n.level, e.level) };
    case 'live_done':
      return { ...n, liveGames: n.liveGames + 1, liveWins: n.liveWins + (e.rank === 1 && e.players >= 2 ? 1 : 0) };
    default:
      return n;
  }
}

// ---------------- quests ----------------

export type QuestMetric = 'correct_answers' | 'xp' | 'sessions' | 'sandbox' | 'combo' | 'mastered' | 'perfect_session';

export interface QuestDef {
  id: string;
  metric: QuestMetric;
  target: number;
  reward: { coins: number; chest?: ChestKind };
}

export const DAILY_QUESTS: QuestDef[] = [
  { id: 'd_correct_10', metric: 'correct_answers', target: 10, reward: { coins: 15 } },
  { id: 'd_correct_20', metric: 'correct_answers', target: 20, reward: { coins: 25 } },
  { id: 'd_xp_50', metric: 'xp', target: 50, reward: { coins: 15 } },
  { id: 'd_xp_120', metric: 'xp', target: 120, reward: { coins: 30 } },
  { id: 'd_session_1', metric: 'sessions', target: 1, reward: { coins: 10 } },
  { id: 'd_session_2', metric: 'sessions', target: 2, reward: { coins: 20 } },
  { id: 'd_sandbox_1', metric: 'sandbox', target: 1, reward: { coins: 15 } },
  { id: 'd_combo_5', metric: 'combo', target: 5, reward: { coins: 20 } },
  { id: 'd_mastered_1', metric: 'mastered', target: 1, reward: { coins: 20 } },
];

export const WEEKLY_QUESTS: QuestDef[] = [
  { id: 'w_correct_100', metric: 'correct_answers', target: 100, reward: { coins: 60, chest: 'rare' } },
  { id: 'w_xp_600', metric: 'xp', target: 600, reward: { coins: 60, chest: 'rare' } },
  { id: 'w_sessions_8', metric: 'sessions', target: 8, reward: { coins: 50, chest: 'common' } },
  { id: 'w_sandbox_5', metric: 'sandbox', target: 5, reward: { coins: 50, chest: 'common' } },
  { id: 'w_mastered_5', metric: 'mastered', target: 5, reward: { coins: 80, chest: 'rare' } },
  { id: 'w_perfect_2', metric: 'perfect_session', target: 2, reward: { coins: 70, chest: 'rare' } },
];

export const questDef = (id: string) => [...DAILY_QUESTS, ...WEEKLY_QUESTS].find((q) => q.id === id);

/** Same quests for the same learner all day (or week); different learners get different mixes. */
export function questsFor(userId: string, periodKey: string, period: 'daily' | 'weekly'): QuestDef[] {
  const pool = period === 'daily' ? DAILY_QUESTS : WEEKLY_QUESTS;
  const picked: QuestDef[] = [];
  for (const q of shuffle(pool, seededRng(hashString(`${userId}:${periodKey}`)))) {
    if (picked.length === (period === 'daily' ? 3 : 2)) break;
    if (!picked.some((p) => p.metric === q.metric)) picked.push(q);
  }
  return picked;
}

/** How an event moves a quest: returns the new progress value. */
export function advanceQuest(metric: QuestMetric, progress: number, e: GameEvent): number {
  switch (metric) {
    case 'correct_answers':
      return e.type === 'answer' && e.correct ? progress + 1 : progress;
    case 'xp':
      return e.type === 'xp' ? progress + e.amount : progress;
    case 'sessions':
      return e.type === 'session_done' && e.answered >= 3 ? progress + 1 : progress;
    case 'sandbox':
      return e.type === 'sandbox_done' && e.score > 0 ? progress + 1 : progress;
    case 'combo':
      return e.type === 'answer' ? Math.max(progress, e.combo) : progress;
    case 'mastered':
      return e.type === 'mastered' ? progress + 1 : progress;
    case 'perfect_session':
      return e.type === 'session_done' && e.perfect ? progress + 1 : progress;
  }
}

// ---------------- badges ----------------

export interface BadgeDef {
  id: string;
  emoji: string;
  earned: (s: Stats) => boolean;
}

const atLeastTier = (s: Stats, t: LeagueTier) => tierIndex(s.bestTier) >= tierIndex(t);

export const BADGES: BadgeDef[] = [
  { id: 'first_steps', emoji: '👣', earned: (s) => s.sessions >= 1 },
  { id: 'deck_maker', emoji: '📚', earned: (s) => s.decks >= 1 },
  { id: 'sharp_mind', emoji: '🎯', earned: (s) => s.correct >= 100 },
  { id: 'brainiac', emoji: '🧠', earned: (s) => s.correct >= 1000 },
  { id: 'master_10', emoji: '⭐', earned: (s) => s.mastered >= 10 },
  { id: 'master_50', emoji: '🌟', earned: (s) => s.mastered >= 50 },
  { id: 'streak_7', emoji: '🔥', earned: (s) => s.bestStreak >= 7 },
  { id: 'streak_30', emoji: '☄️', earned: (s) => s.bestStreak >= 30 },
  { id: 'combo_10', emoji: '💥', earned: (s) => s.bestCombo >= 10 },
  { id: 'perfectionist', emoji: '💯', earned: (s) => s.perfectSessions >= 5 },
  { id: 'explorer', emoji: '🧭', earned: (s) => s.sandboxKinds.length >= 5 },
  { id: 'all_formats', emoji: '🎨', earned: (s) => s.sandboxKinds.length >= 16 },
  { id: 'chest_hunter', emoji: '🗝️', earned: (s) => s.chests >= 10 },
  { id: 'pet_pal', emoji: '🐾', earned: (s) => s.petsFed >= 20 },
  { id: 'gold_league', emoji: '🥇', earned: (s) => atLeastTier(s, 'gold') },
  { id: 'diamond_league', emoji: '💎', earned: (s) => atLeastTier(s, LEAGUE_TIERS[LEAGUE_TIERS.length - 1]!) },
  { id: 'level_10', emoji: '🚀', earned: (s) => s.level >= 10 },
  { id: 'live_player', emoji: '🎮', earned: (s) => s.liveGames >= 1 },
  { id: 'live_champion', emoji: '🏆', earned: (s) => s.liveWins >= 1 },
];

export function newBadges(before: Stats, after: Stats): string[] {
  return BADGES.filter((b) => !b.earned(before) && b.earned(after)).map((b) => b.id);
}
