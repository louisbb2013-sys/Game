import { DAY_MS, type Millis } from './types';

export const LEAGUE_TIERS = ['bronze', 'silver', 'gold', 'sapphire', 'ruby', 'emerald', 'amethyst', 'diamond'] as const;
export type LeagueTier = (typeof LEAGUE_TIERS)[number];

export const GROUP_SIZE = 30;
export const PROMOTE_AT_30 = 7;
export const DEMOTE_AT_30 = 5;

export const tierIndex = (t: LeagueTier) => LEAGUE_TIERS.indexOf(t);

/** ISO-8601 week id, e.g. "2026-W42". Leagues reset Monday 00:00 UTC. */
export function weekId(at: Millis): string {
  const d = new Date(at);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date.getTime() - yearStart) / DAY_MS + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday 00:00 UTC of the week after `at`. */
export function weekEndsAt(at: Millis): Millis {
  const d = new Date(at);
  const day = d.getUTCDay() || 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + (8 - day));
}

/** How many players get promoted / demoted in a group of `size` at `tier`. Scaled from 7/5 per 30. */
export function zoneSizes(size: number, tier: LeagueTier): { promote: number; demote: number } {
  const top = tierIndex(tier) === LEAGUE_TIERS.length - 1;
  const bottom = tierIndex(tier) === 0;
  const promote = top || size < 2 ? 0 : Math.max(1, Math.min(PROMOTE_AT_30, Math.round((size * PROMOTE_AT_30) / GROUP_SIZE)));
  let demote = bottom || size < 5 ? 0 : Math.min(DEMOTE_AT_30, Math.round((size * DEMOTE_AT_30) / GROUP_SIZE));
  demote = Math.min(demote, size - promote);
  return { promote, demote };
}

export interface LeagueEntry {
  userId: string;
  weeklyXp: number;
  lastXpAt: Millis; // tie-break: who got there first
}

export type LeagueOutcome = 'promoted' | 'stayed' | 'demoted';

export interface RankedEntry extends LeagueEntry {
  rank: number;
  zone: LeagueOutcome;
}

export function rankGroup(entries: readonly LeagueEntry[], tier: LeagueTier): RankedEntry[] {
  const sorted = entries.slice().sort((a, b) => b.weeklyXp - a.weeklyXp || a.lastXpAt - b.lastXpAt || a.userId.localeCompare(b.userId));
  const { promote, demote } = zoneSizes(sorted.length, tier);
  return sorted.map((e, i) => {
    let zone: LeagueOutcome = 'stayed';
    // You must actually study to move up; inactive players always drop if the tier allows it.
    if (i < promote && e.weeklyXp > 0) zone = 'promoted';
    else if (i >= sorted.length - demote || (e.weeklyXp === 0 && tierIndex(tier) > 0)) zone = 'demoted';
    return { ...e, rank: i + 1, zone };
  });
}

export function nextTier(tier: LeagueTier, outcome: LeagueOutcome): LeagueTier {
  const i = tierIndex(tier);
  if (outcome === 'promoted') return LEAGUE_TIERS[Math.min(i + 1, LEAGUE_TIERS.length - 1)]!;
  if (outcome === 'demoted') return LEAGUE_TIERS[Math.max(i - 1, 0)]!;
  return tier;
}

/** Split players of one tier into balanced groups of at most GROUP_SIZE. */
export function formGroups<T>(players: readonly T[], size = GROUP_SIZE): T[][] {
  if (players.length === 0) return [];
  const count = Math.ceil(players.length / size);
  const groups: T[][] = Array.from({ length: count }, () => []);
  players.forEach((p, i) => groups[i % count]!.push(p));
  return groups;
}

/** Coins and chest by final rank. */
export function leagueReward(rank: number): { coins: number; chest?: 'common' | 'rare' | 'epic' } {
  if (rank === 1) return { coins: 100, chest: 'epic' };
  if (rank <= 3) return { coins: 60, chest: 'rare' };
  if (rank <= 10) return { coins: 30, chest: 'common' };
  return { coins: 10 };
}
