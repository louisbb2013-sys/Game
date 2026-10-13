import { randomBytes } from 'node:crypto';
import {
  BLOOM_LEVELS,
  buildStudyPlan,
  dayKey,
  DEFAULT_REMINDER,
  FORMATS,
  levelFromXp,
  masteryBand,
  masteryScore,
  newProgress,
  newSrsState,
  OFFLINE_MAX_AGE_MS,
  OFFLINE_MAX_REVIEWS,
  offlineXp,
  PASS,
  questionsFor,
  ratingFromScore,
  recordAttempt,
  recordStudyDay,
  review,
  shouldRemind,
  streakStatus,
  type Bloom,
  type ConceptProgress,
  type Format,
  type ReminderSettings,
  type SrsState,
  type StreakState,
} from '@lumo/core';
import { z } from 'zod';
import type { EmailCodes } from '../auth/email.ts';
import type { Db } from '../db/pool.ts';
import type { GameService } from '../game/service.ts';
import { QuizError, type QuizService } from '../quiz/service.ts';
import type { UserRow } from '../users.ts';

const MAX_SHARE_LINKS = 5;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const offlineReviewSchema = z.object({
  conceptId: z.string().uuid(),
  format: z.enum(FORMATS),
  bloom: z.enum(BLOOM_LEVELS),
  score: z.number().min(0).max(1),
  at: z.number().int(),
  /** Audio mode: the learner said whether they knew it; this moves spaced repetition only. */
  selfRated: z.boolean().optional(),
});
export type OfflineReview = z.infer<typeof offlineReviewSchema>;

/** Exam plans, progress links, reminders, offline review sync and data export. */
export class StudyService {
  constructor(
    private db: Db,
    private quiz: QuizService,
    private game: GameService,
    private mail: EmailCodes,
    private appUrl: string,
    private log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  // ---------------------------------------------------------------- study plans

  async setPlan(user: UserRow, deckId: string, examDay: string, minutesPerDay: number) {
    if (!DAY_RE.test(examDay) || Number.isNaN(Date.parse(examDay))) throw new QuizError(400, 'bad_date');
    const today = dayKey(Date.now(), user.timezone);
    if (examDay < today) throw new QuizError(400, 'date_in_past');
    await this.quiz.loadDeck(deckId, user.id); // access check
    await this.db.query(
      `INSERT INTO study_plans (user_id, deck_id, exam_day, minutes_per_day) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, deck_id) DO UPDATE SET exam_day = EXCLUDED.exam_day, minutes_per_day = EXCLUDED.minutes_per_day`,
      [user.id, deckId, examDay, minutesPerDay],
    );
    return this.plan(user, deckId);
  }

  async deletePlan(userId: string, deckId: string) {
    await this.db.query('DELETE FROM study_plans WHERE user_id = $1 AND deck_id = $2', [userId, deckId]);
    return { ok: true };
  }

  async plan(user: UserRow, deckId: string) {
    const row = (await this.db.query<{ exam_day: string; minutes_per_day: number }>('SELECT exam_day, minutes_per_day FROM study_plans WHERE user_id = $1 AND deck_id = $2', [user.id, deckId])).rows[0];
    if (!row) return { plan: null };
    const map = await this.quiz.masteryMap(deckId, user.id);
    const plan = buildStudyPlan({
      today: dayKey(Date.now(), user.timezone),
      examDay: row.exam_day,
      concepts: map.concepts.map((c) => ({ id: c.id, band: c.band, due: c.due })),
      minutesPerDay: row.minutes_per_day,
    });
    return { plan: { ...plan, minutesPerDay: row.minutes_per_day, deckId, deckTitle: map.deck.title } };
  }

  /** Home screen: what each plan asks for today. */
  async today(user: UserRow) {
    const { rows } = await this.db.query<{ deck_id: string }>('SELECT deck_id FROM study_plans WHERE user_id = $1 ORDER BY exam_day', [user.id]);
    const out = [];
    for (const r of rows) {
      const { plan } = await this.plan(user, r.deck_id).catch(() => ({ plan: null }));
      if (!plan || plan.daysLeft < 0) continue;
      const today = plan.days[0] ?? null;
      out.push({ deckId: plan.deckId, deckTitle: plan.deckTitle, examDay: plan.examDay, daysLeft: plan.daysLeft, today, questions: today ? questionsFor(today) : 0 });
    }
    return { plans: out };
  }

  // ---------------------------------------------------------------- share links

  async createShare(userId: string, label: string) {
    const active = (await this.db.query<{ n: number }>('SELECT count(*)::int AS n FROM share_links WHERE user_id = $1 AND revoked_at IS NULL', [userId])).rows[0]!.n;
    if (active >= MAX_SHARE_LINKS) throw new QuizError(409, 'too_many_links');
    const token = randomBytes(18).toString('base64url');
    await this.db.query('INSERT INTO share_links (token, user_id, label) VALUES ($1, $2, $3)', [token, userId, label.trim().slice(0, 40)]);
    return { token, url: `${this.appUrl}/progress/${token}` };
  }

  async shares(userId: string) {
    const { rows } = await this.db.query<{ token: string; label: string; created_at: Date; last_viewed_at: Date | null }>(
      'SELECT token, label, created_at, last_viewed_at FROM share_links WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at',
      [userId],
    );
    return { links: rows.map((r) => ({ token: r.token, label: r.label, url: `${this.appUrl}/progress/${r.token}`, createdAt: r.created_at, lastViewedAt: r.last_viewed_at })) };
  }

  async revokeShare(userId: string, token: string) {
    const r = await this.db.query('UPDATE share_links SET revoked_at = now() WHERE token = $1 AND user_id = $2 AND revoked_at IS NULL', [token, userId]);
    if (!r.rowCount) throw new QuizError(404, 'link_not_found');
    return { ok: true };
  }

  /**
   * What a parent or teacher sees: effort and progress only. No email, no answers, no chats, no friends.
   */
  async sharedProgress(token: string) {
    const link = (await this.db.query<{ user_id: string }>('UPDATE share_links SET last_viewed_at = now() WHERE token = $1 AND revoked_at IS NULL RETURNING user_id', [token])).rows[0];
    if (!link) throw new QuizError(404, 'link_not_found');
    const u = (await this.db.query<{ username: string; xp: number; streak: StreakState; timezone: string; league_tier: string; locale: string }>(
      'SELECT username, xp, streak, timezone, league_tier, locale FROM users WHERE id = $1',
      [link.user_id],
    )).rows[0]!;
    const today = dayKey(Date.now(), u.timezone);
    const status = streakStatus(u.streak, today);
    const activity = (await this.db.query<{ day: string; xp: number; answers: number }>(
      `SELECT to_char(created_at AT TIME ZONE $2, 'YYYY-MM-DD') AS day, sum(amount)::int AS xp, count(*)::int AS answers
       FROM xp_events WHERE user_id = $1 AND created_at > now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
      [link.user_id, u.timezone],
    )).rows;
    const decks = (await this.db.query<{ id: string; title: string; total: number }>(
      'SELECT d.id, d.title, (SELECT count(*)::int FROM concepts c WHERE c.deck_id = d.id) AS total FROM decks d WHERE d.owner_id = $1 ORDER BY d.created_at DESC LIMIT 12',
      [link.user_id],
    )).rows;
    const states = (await this.db.query<{ deck_id: string; progress: ConceptProgress }>(
      'SELECT c.deck_id, s.progress FROM concept_states s JOIN concepts c ON c.id = s.concept_id WHERE s.user_id = $1',
      [link.user_id],
    )).rows;
    const exams = (await this.db.query<{ title: string; correct: number; answered: number; at: Date }>(
      `SELECT d.title, (q.state->>'correct')::int AS correct, (q.state->>'answered')::int AS answered, q.updated_at AS at
       FROM quiz_sessions q JOIN decks d ON d.id = q.deck_id WHERE q.user_id = $1 AND q.mode = 'exam' AND q.status = 'done' ORDER BY q.updated_at DESC LIMIT 5`,
      [link.user_id],
    )).rows;
    return {
      username: u.username,
      locale: u.locale,
      level: levelFromXp(u.xp),
      streak: status === 'broken' ? 0 : u.streak.days,
      studiedToday: status === 'safe',
      leagueTier: u.league_tier,
      activity,
      decks: decks.map((d) => {
        const ps = states.filter((s) => s.deck_id === d.id).map((s) => s.progress);
        return {
          title: d.title,
          concepts: d.total,
          mastered: ps.filter((p) => masteryBand(p) === 'mastered').length,
          progress: d.total ? Math.round((ps.reduce((a, p) => a + masteryScore(p), 0) / d.total) * 100) : 0,
        };
      }),
      exams: exams.map((e) => ({ title: e.title, percent: e.answered ? Math.round((e.correct / e.answered) * 100) : 0, at: e.at })),
    };
  }

  // ---------------------------------------------------------------- reminders

  /** Called every few minutes: one friendly email a day, only to learners who turned reminders on. */
  async sendReminders(now = Date.now()) {
    const { rows } = await this.db.query<{ id: string; email: string; username: string; locale: string; timezone: string; streak: StreakState; settings: { reminder?: ReminderSettings }; last_reminder_day: string | null }>(
      `SELECT id, email, username, locale, timezone, streak, settings, last_reminder_day FROM users
       WHERE email IS NOT NULL AND (settings->'reminder'->>'enabled')::boolean IS TRUE`,
    );
    let sent = 0;
    for (const u of rows) {
      const r = { ...DEFAULT_REMINDER, ...u.settings.reminder };
      const today = dayKey(now, u.timezone);
      if (!shouldRemind(r, now, u.timezone, streakStatus(u.streak, today) === 'safe', u.last_reminder_day)) continue;
      // Mark first so a slow mail server can't cause a double send.
      const claimed = await this.db.query('UPDATE users SET last_reminder_day = $2 WHERE id = $1 AND last_reminder_day IS DISTINCT FROM $2', [u.id, today]);
      if (!claimed.rowCount) continue;
      const fr = u.locale === 'fr';
      const days = u.streak.days;
      const subject = fr ? 'Lumo t’attend ✨' : 'Lumo is waiting for you ✨';
      const text = fr
        ? `Salut ${u.username} ! ${days > 0 ? `Garde ta série de ${days} jours : ` : ''}5 minutes de révision suffisent aujourd’hui.\n${this.appUrl}\n\nTu peux couper ces rappels dans Réglages.`
        : `Hi ${u.username}! ${days > 0 ? `Keep your ${days}-day streak going: ` : ''}5 minutes of study is enough today.\n${this.appUrl}\n\nYou can turn these reminders off in Settings.`;
      try {
        await this.mail.send(u.email, subject, text);
        sent++;
      } catch (err) {
        this.log('reminder email failed', err);
      }
    }
    return sent;
  }

  // ---------------------------------------------------------------- offline review

  async offlineDeck(userId: string, deckId: string) {
    const { deck, concepts } = await this.quiz.loadDeck(deckId, userId);
    return { deck: { id: deck.id, title: deck.title, subject: deck.subject, language: deck.language }, concepts, savedAt: Date.now() };
  }

  /**
   * Apply reviews done without a connection. They move spaced repetition and mastery (it's the learner's
   * own progress), but XP is small and capped, and each batch counts once.
   */
  async syncOffline(user: UserRow, clientId: string, deckId: string, reviews: OfflineReview[]) {
    const now = Date.now();
    const { concepts } = await this.quiz.loadDeck(deckId, user.id);
    const valid = new Set(concepts.map((c) => c.id));
    const usable = reviews
      .filter((r) => valid.has(r.conceptId) && r.at <= now + 60_000 && r.at >= now - OFFLINE_MAX_AGE_MS)
      .sort((a, b) => a.at - b.at)
      .slice(0, OFFLINE_MAX_REVIEWS);

    const c = await this.db.connect();
    try {
      await c.query('BEGIN');
      const fresh = await c.query('INSERT INTO offline_syncs (user_id, client_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [user.id, clientId]);
      if (!fresh.rowCount) {
        await c.query('ROLLBACK');
        return { applied: 0, xp: 0, duplicate: true };
      }
      for (const r of usable) {
        const st = (await c.query<{ progress: ConceptProgress; srs: SrsState }>('SELECT progress, srs FROM concept_states WHERE user_id = $1 AND concept_id = $2 FOR UPDATE', [user.id, r.conceptId])).rows[0];
        const progress = r.selfRated ? (st?.progress ?? newProgress()) : recordAttempt(st?.progress ?? newProgress(), r.format as Format, r.bloom as Bloom, r.score);
        const srs = review(st?.srs ?? newSrsState(r.at), ratingFromScore(r.score), Math.max(r.at, st?.srs?.lastReview ?? 0));
        await c.query(
          `INSERT INTO concept_states (user_id, concept_id, progress, srs, updated_at) VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (user_id, concept_id) DO UPDATE SET progress = EXCLUDED.progress, srs = EXCLUDED.srs, updated_at = now()`,
          [user.id, r.conceptId, JSON.stringify(progress), JSON.stringify(srs)],
        );
      }
      const correct = usable.filter((r) => r.score >= PASS).length;
      const xp = offlineXp(correct);
      // Three reviews done today keep the streak alive, offline or not.
      const today = dayKey(now, user.timezone);
      const todayCount = usable.filter((r) => dayKey(r.at, user.timezone) === today).length;
      let streakExtended = false;
      if (todayCount >= 3) {
        const u = (await c.query<{ streak: StreakState }>('SELECT streak FROM users WHERE id = $1 FOR UPDATE', [user.id])).rows[0]!;
        const s = recordStudyDay(u.streak, today);
        streakExtended = s.extended;
        await c.query('UPDATE users SET streak = $2, last_seen_at = now() WHERE id = $1', [user.id, JSON.stringify(s.state)]);
      }
      const rewards = await this.game.award(c, user.id, { xp, reason: 'offline', events: [] });
      await c.query('COMMIT');
      return { applied: usable.length, xp, streakExtended, rewards, duplicate: false };
    } catch (err) {
      await c.query('ROLLBACK');
      throw err;
    } finally {
      c.release();
    }
  }

  // ---------------------------------------------------------------- my data

  /** Everything we store about you, in one JSON file (uploaded files are listed, not embedded). */
  async exportData(userId: string) {
    const q = async (sql: string) => (await this.db.query(sql, [userId])).rows;
    const [user] = await q('SELECT id, email, username, avatar, locale, timezone, settings, xp, coins, hearts, streak, league_tier, theme, friend_code, created_at FROM users WHERE id = $1');
    return {
      exportedAt: new Date().toISOString(),
      user,
      decks: await q(`SELECT d.id, d.title, d.subject, d.language, d.visibility, d.created_at,
                        coalesce(json_agg(c.data || jsonb_build_object('id', c.id) ORDER BY c.position) FILTER (WHERE c.id IS NOT NULL), '[]') AS concepts
                      FROM decks d LEFT JOIN concepts c ON c.deck_id = d.id WHERE d.owner_id = $1 GROUP BY d.id ORDER BY d.created_at`),
      progress: await q('SELECT concept_id, progress, srs, updated_at FROM concept_states WHERE user_id = $1'),
      answers: await q('SELECT concept_id, session_id, format, bloom, score, time_ms, answer, created_at FROM attempts WHERE user_id = $1 ORDER BY created_at'),
      sessions: await q('SELECT id, deck_id, mode, status, created_at FROM quiz_sessions WHERE user_id = $1 ORDER BY created_at'),
      xp: await q('SELECT amount, reason, week_id, created_at FROM xp_events WHERE user_id = $1 ORDER BY created_at'),
      chats: await q(`SELECT ch.id, ch.title, ch.created_at, coalesce(json_agg(json_build_object('role', m.role, 'content', m.content, 'at', m.created_at) ORDER BY m.created_at) FILTER (WHERE m.id IS NOT NULL), '[]') AS messages
                      FROM chats ch LEFT JOIN chat_messages m ON m.chat_id = ch.id WHERE ch.user_id = $1 GROUP BY ch.id ORDER BY ch.created_at`),
      uploads: await q('SELECT id, kind, mime, name, octet_length(bytes) AS size, created_at FROM uploads WHERE user_id = $1'),
      sandbox: await q('SELECT id, deck_id, kind, created_at FROM sandbox_activities WHERE user_id = $1'),
      inventory: await q('SELECT item_id, qty FROM inventory WHERE user_id = $1'),
      pets: await q('SELECT species, name, level, xp, created_at FROM pets WHERE user_id = $1'),
      badges: await q('SELECT badge_id, earned_at FROM user_badges WHERE user_id = $1'),
      friends: await q(`SELECT u.username, f.status, f.created_at FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END WHERE f.user_a = $1 OR f.user_b = $1`),
      groups: await q('SELECT g.name, m.role, m.joined_at FROM group_members m JOIN study_groups g ON g.id = m.group_id WHERE m.user_id = $1'),
      studyPlans: await q('SELECT deck_id, exam_day, minutes_per_day FROM study_plans WHERE user_id = $1'),
      shareLinks: await q('SELECT label, created_at, last_viewed_at, revoked_at FROM share_links WHERE user_id = $1'),
    };
  }
}
