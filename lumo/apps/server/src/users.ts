import {
  currentHearts,
  dayKey,
  generateUsername,
  levelProgress,
  streakStatus,
  type LeagueTier,
  type Locale,
  type StreakState,
} from '@lumo/core';
import type { Db } from './db/pool.ts';

export interface UserRow {
  id: string;
  email: string | null;
  google_sub: string | null;
  username: string;
  avatar: string;
  locale: Locale;
  timezone: string;
  settings: Record<string, unknown>;
  xp: number;
  coins: number;
  hearts: number;
  hearts_updated_at: Date;
  streak: StreakState;
  league_tier: LeagueTier;
  created_at: Date;
  theme: string;
  boost_until: Date | null;
}

export async function getUser(db: Db, id: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

interface NewUser {
  email?: string | null;
  googleSub?: string | null;
  locale?: Locale;
  timezone?: string;
}

export async function createUser(db: Db, u: NewUser): Promise<UserRow> {
  // Retry on the (rare) username collision.
  for (let attempt = 0; attempt < 8; attempt++) {
    const username = generateUsername();
    const { rows } = await db.query<UserRow>(
      `INSERT INTO users (email, google_sub, username, locale, timezone)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO NOTHING
       RETURNING *`,
      [u.email ?? null, u.googleSub ?? null, username, u.locale ?? 'en', u.timezone ?? 'UTC'],
    );
    if (rows[0]) return rows[0];
  }
  throw new Error('could not allocate a username');
}

export async function findOrCreateByEmail(db: Db, email: string, extra: NewUser = {}): Promise<UserRow> {
  const { rows } = await db.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? createUser(db, { ...extra, email });
}

/** Google identity: match on the stable `sub`, else link to an existing verified email. */
export async function findOrCreateByGoogle(db: Db, sub: string, email: string | null, extra: NewUser = {}): Promise<UserRow> {
  const bySub = await db.query<UserRow>('SELECT * FROM users WHERE google_sub = $1', [sub]);
  if (bySub.rows[0]) return bySub.rows[0];
  if (email) {
    const linked = await db.query<UserRow>('UPDATE users SET google_sub = $1 WHERE email = $2 AND google_sub IS NULL RETURNING *', [sub, email]);
    if (linked.rows[0]) return linked.rows[0];
  }
  return createUser(db, { ...extra, email, googleSub: sub });
}

/** What the signed-in learner sees about themselves. Email is never sent to other users. */
export function toProfile(u: UserRow, now = Date.now()) {
  const hearts = currentHearts({ hearts: u.hearts, updatedAt: u.hearts_updated_at.getTime() }, now);
  const today = dayKey(now, u.timezone);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    email: u.email,
    locale: u.locale,
    timezone: u.timezone,
    settings: u.settings,
    xp: u.xp,
    level: levelProgress(u.xp),
    coins: u.coins,
    hearts: { current: hearts.hearts, nextRefillAt: hearts.nextRefillAt },
    streak: { ...u.streak, status: streakStatus(u.streak, today) },
    leagueTier: u.league_tier,
    theme: u.theme,
    boostUntil: u.boost_until && u.boost_until.getTime() > now ? u.boost_until.toISOString() : null,
    createdAt: u.created_at.toISOString(),
  };
}

export type Profile = ReturnType<typeof toProfile>;
