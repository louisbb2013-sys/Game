import {
  dayKey,
  generateSandbox,
  hashString,
  parseSandboxRequest,
  recordStudyDay,
  SANDBOX_KINDS,
  SANDBOX_XP,
  sandboxSupports,
  seededRng,
  weekId,
  type Concept,
  type SandboxData,
  type SandboxKind,
  type StreakState,
} from '@lumo/core';
import type { AiProvider } from '../ai/provider.ts';
import type { Db } from '../db/pool.ts';
import { QuizError, type QuizService } from '../quiz/service.ts';
import type { UserRow } from '../users.ts';

/** Formats whose text benefits most from AI writing (the rest are built locally). */
const AI_SCRIPTED: SandboxKind[] = ['video', 'podcast', 'story', 'mnemonics'];
export const SANDBOX_DAILY_XP_CAP = 400;

export interface ActivityRow {
  id: string;
  deck_id: string | null;
  kind: SandboxKind;
  title: string;
  data: SandboxData;
  score: number | null;
  xp: number;
  completed_at: Date | null;
  created_at: Date;
}

export class SandboxService {
  constructor(
    private db: Db,
    private ai: AiProvider,
    private quiz: QuizService,
  ) {}

  /** Which formats are available for a deck (some need lists, dates or enough words). */
  async available(user: UserRow, deckId: string) {
    const { concepts } = await this.quiz.loadDeck(deckId, user.id);
    return SANDBOX_KINDS.map((kind) => ({ kind, available: sandboxSupports(kind, concepts) }));
  }

  async create(user: UserRow, deckId: string, kind: SandboxKind, focus: string[] = []): Promise<ActivityRow> {
    const { deck, concepts } = await this.quiz.loadDeck(deckId, user.id);
    const chosen = focusConcepts(concepts, focus);
    if (!sandboxSupports(kind, chosen)) throw new QuizError(422, 'format_not_possible');
    const title = focus.length && chosen.length < concepts.length ? chosen.map((c) => c.term).slice(0, 3).join(', ') : deck.title;
    let data: SandboxData | null = null;
    if (this.ai.name === 'claude' && AI_SCRIPTED.includes(kind)) data = await this.ai.sandboxScript(kind, chosen, title, deck.language);
    if (!data) data = generateSandbox(kind, { deck: chosen, title, language: deck.language, rng: seededRng(hashString(`${user.id}:${kind}:${Date.now()}`)) })?.data ?? null;
    if (!data) throw new QuizError(422, 'format_not_possible');
    const { rows } = await this.db.query<ActivityRow>(
      'INSERT INTO sandbox_activities (user_id, deck_id, kind, title, data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [user.id, deckId, kind, title, JSON.stringify(data)],
    );
    return rows[0]!;
  }

  /** "Make me a crossword about osmosis" → the right activity. */
  async ask(user: UserRow, text: string, deckId?: string): Promise<ActivityRow> {
    deckId ??= (await this.db.query<{ id: string }>('SELECT id FROM decks WHERE owner_id = $1 ORDER BY updated_at DESC LIMIT 1', [user.id])).rows[0]?.id;
    if (!deckId) throw new QuizError(404, 'no_deck');
    const { concepts } = await this.quiz.loadDeck(deckId, user.id);
    const intent = parseSandboxRequest(text, concepts);
    if (!intent.kind) throw new QuizError(422, 'unknown_format');
    return this.create(user, deckId, intent.kind, intent.focus);
  }

  async get(user: UserRow, id: string): Promise<ActivityRow> {
    const { rows } = await this.db.query<ActivityRow>('SELECT * FROM sandbox_activities WHERE id = $1 AND user_id = $2', [id, user.id]);
    if (!rows[0]) throw new QuizError(404, 'activity_not_found');
    return rows[0];
  }

  async recent(user: UserRow) {
    const { rows } = await this.db.query(
      'SELECT id, deck_id AS "deckId", kind, title, score, xp, completed_at AS "completedAt", created_at AS "createdAt" FROM sandbox_activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
      [user.id],
    );
    return rows;
  }

  /** XP once per activity, scaled by score, with a daily cap (games run on the device, so the server limits what they can earn). */
  async complete(user: UserRow, id: string, score: number): Promise<{ xp: number; streak: { days: number; extended: boolean } }> {
    const now = Date.now();
    const s = Math.min(1, Math.max(0, score));
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const a = (await client.query<ActivityRow>('SELECT * FROM sandbox_activities WHERE id = $1 AND user_id = $2 FOR UPDATE', [id, user.id])).rows[0];
      if (!a) throw new QuizError(404, 'activity_not_found');
      const u = (await client.query<{ streak: StreakState; timezone: string }>('SELECT streak, timezone FROM users WHERE id = $1 FOR UPDATE', [user.id])).rows[0]!;
      let xp = 0;
      if (!a.completed_at) {
        const today = await client.query<{ sum: number }>(
          "SELECT coalesce(sum(amount), 0)::int AS sum FROM xp_events WHERE user_id = $1 AND reason = 'sandbox' AND created_at > now() - interval '1 day'",
          [user.id],
        );
        xp = Math.max(0, Math.min(Math.round(SANDBOX_XP[a.kind] * s), SANDBOX_DAILY_XP_CAP - today.rows[0]!.sum));
        await client.query('UPDATE sandbox_activities SET score = $2, xp = $3, completed_at = now() WHERE id = $1', [id, s, xp]);
        if (xp > 0) {
          await client.query("INSERT INTO xp_events (user_id, amount, reason, week_id) VALUES ($1, $2, 'sandbox', $3)", [user.id, xp, weekId(now)]);
        }
      }
      const streak = s >= 0.3 ? recordStudyDay(u.streak, dayKey(now, u.timezone)) : { state: u.streak, extended: false };
      await client.query('UPDATE users SET xp = xp + $2, streak = $3 WHERE id = $1', [user.id, xp, JSON.stringify(streak.state)]);
      await client.query('COMMIT');
      return { xp, streak: { days: streak.state.days, extended: streak.extended } };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/** Focus on the requested concepts, topped up with related ones so games still have enough material. */
function focusConcepts(all: Concept[], focus: string[]): Concept[] {
  if (focus.length === 0) return all;
  const picked = all.filter((c) => focus.includes(c.id));
  const topics = new Set(picked.map((c) => c.topic));
  const related = all.filter((c) => !focus.includes(c.id) && topics.has(c.topic));
  const rest = all.filter((c) => !focus.includes(c.id) && !topics.has(c.topic));
  return [...picked, ...related, ...rest].slice(0, Math.max(6, picked.length));
}
