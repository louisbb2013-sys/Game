import { randomInt } from 'node:crypto';
import { dayKey, hashString, levelFromXp, streakStatus, weekId, type StreakState } from '@lumo/core';
import type { Db } from '../db/pool.ts';
import { QuizError } from '../quiz/service.ts';

const pair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
export const makeCode = (n: number) => Array.from({ length: n }, () => CODE_CHARS[randomInt(0, CODE_CHARS.length)]).join('');

interface PublicUserRow {
  id: string;
  username: string;
  avatar: string;
  xp: number;
  streak: StreakState;
  timezone: string;
  league_tier: string;
  last_seen_at: Date;
}

/** What a friend can see about you: never email, real name or birth date. */
function publicUser(u: PublicUserRow, weeklyXp = 0) {
  const today = dayKey(Date.now(), u.timezone);
  const status = streakStatus(u.streak, today);
  return {
    id: u.id,
    username: u.username,
    avatar: u.avatar,
    level: levelFromXp(u.xp),
    streak: status === 'broken' ? 0 : u.streak.days,
    studiedToday: status === 'safe',
    leagueTier: u.league_tier,
    weeklyXp,
    lastActive: u.last_seen_at.toISOString().slice(0, 10),
  };
}

export class SocialService {
  constructor(private db: Db) {}

  // ---------------------------------------------------------------- friends

  async friendCode(userId: string) {
    return (await this.db.query<{ friend_code: string }>('SELECT friend_code FROM users WHERE id = $1', [userId])).rows[0]!.friend_code;
  }

  async areFriends(a: string, b: string) {
    const [x, y] = pair(a, b);
    return !!(await this.db.query("SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2 AND status = 'accepted'", [x, y])).rowCount;
  }

  /** Request by username or friend code. If they already asked you, this accepts. */
  async request(userId: string, target: { username?: string; code?: string }) {
    const row = target.code
      ? (await this.db.query<{ id: string }>('SELECT id FROM users WHERE friend_code = $1', [target.code.toUpperCase()])).rows[0]
      : (await this.db.query<{ id: string }>('SELECT id FROM users WHERE lower(username) = lower($1)', [target.username ?? ''])).rows[0];
    if (!row) throw new QuizError(404, 'user_not_found');
    if (row.id === userId) throw new QuizError(400, 'cannot_add_self');
    const [a, b] = pair(userId, row.id);
    const existing = (await this.db.query<{ status: string; requested_by: string }>('SELECT status, requested_by FROM friendships WHERE user_a = $1 AND user_b = $2', [a, b])).rows[0];
    if (existing?.status === 'accepted') return { status: 'friends' as const };
    if (existing && existing.requested_by !== userId) {
      await this.db.query("UPDATE friendships SET status = 'accepted' WHERE user_a = $1 AND user_b = $2", [a, b]);
      return { status: 'friends' as const };
    }
    if (!existing) await this.db.query("INSERT INTO friendships (user_a, user_b, status, requested_by) VALUES ($1, $2, 'pending', $3)", [a, b, userId]);
    return { status: 'requested' as const };
  }

  async respond(userId: string, otherId: string, accept: boolean) {
    const [a, b] = pair(userId, otherId);
    const r = accept
      ? await this.db.query("UPDATE friendships SET status = 'accepted' WHERE user_a = $1 AND user_b = $2 AND status = 'pending' AND requested_by <> $3", [a, b, userId])
      : await this.db.query("DELETE FROM friendships WHERE user_a = $1 AND user_b = $2 AND status = 'pending' AND requested_by <> $3", [a, b, userId]);
    if (!r.rowCount) throw new QuizError(404, 'request_not_found');
    return { ok: true };
  }

  async remove(userId: string, otherId: string) {
    const [a, b] = pair(userId, otherId);
    await this.db.query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [a, b]);
    return { ok: true };
  }

  async friends(userId: string) {
    const week = weekId(Date.now());
    const { rows } = await this.db.query<PublicUserRow & { status: string; requested_by: string; weekly_xp: number }>(
      `SELECT u.id, u.username, u.avatar, u.xp, u.streak, u.timezone, u.league_tier, u.last_seen_at, f.status, f.requested_by,
              coalesce((SELECT sum(amount) FROM xp_events e WHERE e.user_id = u.id AND e.week_id = $2), 0)::int AS weekly_xp
       FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
       WHERE f.user_a = $1 OR f.user_b = $1
       ORDER BY u.username`,
      [userId, week],
    );
    return {
      code: await this.friendCode(userId),
      friends: rows.filter((r) => r.status === 'accepted').map((r) => publicUser(r, r.weekly_xp)),
      incoming: rows.filter((r) => r.status === 'pending' && r.requested_by !== userId).map((r) => publicUser(r)),
      outgoing: rows.filter((r) => r.status === 'pending' && r.requested_by === userId).map((r) => publicUser(r)),
    };
  }

  /** Weekly XP among you and your friends. */
  async friendsBoard(userId: string) {
    const { friends } = await this.friends(userId);
    const me = await this.userRow(userId);
    const week = weekId(Date.now());
    const myXp = (await this.db.query<{ s: number }>('SELECT coalesce(sum(amount), 0)::int AS s FROM xp_events WHERE user_id = $1 AND week_id = $2', [userId, week])).rows[0]!.s;
    return [...friends.map((f) => ({ ...f, me: false })), { ...publicUser(me, myXp), me: true }].sort((a, b) => b.weeklyXp - a.weeklyXp).map((r, i) => ({ ...r, rank: i + 1 }));
  }

  private async userRow(id: string) {
    return (await this.db.query<PublicUserRow>('SELECT id, username, avatar, xp, streak, timezone, league_tier, last_seen_at FROM users WHERE id = $1', [id])).rows[0]!;
  }

  // ---------------------------------------------------------------- groups

  private async member(groupId: string, userId: string) {
    const r = (await this.db.query<{ role: string }>('SELECT role FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId])).rows[0];
    if (!r) throw new QuizError(404, 'group_not_found');
    return r.role;
  }

  async createGroup(userId: string, name: string) {
    const n = name.trim();
    if (n.length < 2 || n.length > 40) throw new QuizError(400, 'bad_group_name');
    const { rows } = await this.db.query<{ id: string }>('INSERT INTO study_groups (name, owner_id, invite_code) VALUES ($1, $2, $3) RETURNING id', [n, userId, makeCode(6)]);
    await this.db.query("INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'owner')", [rows[0]!.id, userId]);
    return { id: rows[0]!.id };
  }

  async joinGroup(userId: string, code: string) {
    const g = (await this.db.query<{ id: string }>('SELECT id FROM study_groups WHERE invite_code = $1', [code.toUpperCase()])).rows[0];
    if (!g) throw new QuizError(404, 'group_not_found');
    const count = (await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM group_members WHERE group_id = $1', [g.id])).rows[0]!.n;
    if (count >= 50) throw new QuizError(409, 'group_full');
    await this.db.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [g.id, userId]);
    return { id: g.id };
  }

  async leaveGroup(userId: string, groupId: string) {
    const role = await this.member(groupId, userId);
    if (role === 'owner') {
      // The owner leaving hands the group to the longest-standing member, or deletes an empty group.
      const next = (await this.db.query<{ user_id: string }>("SELECT user_id FROM group_members WHERE group_id = $1 AND user_id <> $2 ORDER BY joined_at LIMIT 1", [groupId, userId])).rows[0];
      if (!next) {
        await this.db.query('DELETE FROM study_groups WHERE id = $1', [groupId]);
        return { ok: true };
      }
      await this.db.query("UPDATE group_members SET role = 'owner' WHERE group_id = $1 AND user_id = $2", [groupId, next.user_id]);
      await this.db.query('UPDATE study_groups SET owner_id = $2 WHERE id = $1', [groupId, next.user_id]);
    }
    await this.db.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [groupId, userId]);
    return { ok: true };
  }

  async myGroups(userId: string) {
    const { rows } = await this.db.query(
      `SELECT g.id, g.name, (SELECT count(*)::int FROM group_members m2 WHERE m2.group_id = g.id) AS "memberCount"
       FROM study_groups g JOIN group_members m ON m.group_id = g.id WHERE m.user_id = $1 ORDER BY g.name`,
      [userId],
    );
    return rows;
  }

  async group(userId: string, groupId: string) {
    const role = await this.member(groupId, userId);
    const g = (await this.db.query<{ id: string; name: string; invite_code: string; owner_id: string }>('SELECT id, name, invite_code, owner_id FROM study_groups WHERE id = $1', [groupId])).rows[0]!;
    const week = weekId(Date.now());
    const members = (
      await this.db.query<PublicUserRow & { weekly_xp: number }>(
        `SELECT u.id, u.username, u.avatar, u.xp, u.streak, u.timezone, u.league_tier, u.last_seen_at,
                coalesce((SELECT sum(amount) FROM xp_events e WHERE e.user_id = u.id AND e.week_id = $2), 0)::int AS weekly_xp
         FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = $1`,
        [groupId, week],
      )
    ).rows
      .map((r) => ({ ...publicUser(r, r.weekly_xp), me: r.id === userId }))
      .sort((a, b) => b.weeklyXp - a.weeklyXp)
      .map((r, i) => ({ ...r, rank: i + 1 }));
    const decks = (
      await this.db.query(
        `SELECT d.id, d.title, d.subject, u.username AS "addedBy", (SELECT count(*)::int FROM concepts c WHERE c.deck_id = d.id) AS "conceptCount"
         FROM group_decks gd JOIN decks d ON d.id = gd.deck_id JOIN users u ON u.id = gd.added_by WHERE gd.group_id = $1 ORDER BY gd.added_at`,
        [groupId],
      )
    ).rows as { id: string; title: string }[];
    const today = dayKey(Date.now(), 'UTC');
    const daily = (
      await this.db.query(
        `SELECT u.username, d.correct, d.answered, (d.user_id = $3) AS me FROM group_daily d JOIN users u ON u.id = d.user_id
         WHERE d.group_id = $1 AND d.day = $2 ORDER BY d.correct DESC, d.created_at`,
        [groupId, today, userId],
      )
    ).rows;
    return { id: g.id, name: g.name, inviteCode: g.invite_code, isOwner: role === 'owner', members, decks, daily: { deck: this.dailyDeck(decks, groupId, today), results: daily } };
  }

  /** Today's deck for the group daily quiz: the same for everyone in the group. */
  dailyDeck<T extends { id: string }>(decks: T[], groupId: string, day: string): T | null {
    if (decks.length === 0) return null;
    return decks[hashString(`${groupId}:${day}`) % decks.length]!;
  }

  async shareDeck(userId: string, groupId: string, deckId: string) {
    await this.member(groupId, userId);
    const own = (await this.db.query('SELECT 1 FROM decks WHERE id = $1 AND owner_id = $2', [deckId, userId])).rowCount;
    if (!own) throw new QuizError(404, 'deck_not_found');
    await this.db.query('INSERT INTO group_decks (group_id, deck_id, added_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [groupId, deckId, userId]);
    return { ok: true };
  }

  async unshareDeck(userId: string, groupId: string, deckId: string) {
    const role = await this.member(groupId, userId);
    const r = await this.db.query('DELETE FROM group_decks WHERE group_id = $1 AND deck_id = $2 AND (added_by = $3 OR $4)', [groupId, deckId, userId, role === 'owner']);
    if (!r.rowCount) throw new QuizError(404, 'deck_not_found');
    return { ok: true };
  }

  async dailyTarget(userId: string, groupId: string) {
    const g = await this.group(userId, groupId);
    if (!g.daily.deck) throw new QuizError(409, 'no_group_decks');
    return { deckId: g.daily.deck.id, day: dayKey(Date.now(), 'UTC') };
  }
}
