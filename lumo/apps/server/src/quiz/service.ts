import {
  applyAnswer,
  canStartChallenge,
  chooseFormat,
  currentHearts,
  dayKey,
  EXAM_FORMATS,
  examReport,
  examTimeLimitMs,
  type ExamReport,
  gainHearts,
  grade,
  hashString,
  isMastered,
  isRetry,
  loseHeart,
  masteryBand,
  masteryScore,
  newProgress,
  newSession,
  newSrsState,
  openPart,
  pickConcepts,
  publicQuestion,
  ratingFromScore,
  recordAttempt,
  recordStudyDay,
  review,
  seededRng,
  sessionDone,
  shortAnswersToCheck,
  xpForAnswer,
  type Answer,
  type Concept,
  type ConceptProgress,
  type ConceptStateView,
  type ExamItem,
  type Format,
  type GradeResult,
  type Locale,
  type OpenGrade,
  type PublicQuestion,
  type Question,
  type SessionMode,
  type SessionState,
  type SrsState,
  type StreakState,
} from '@lumo/core';
import type pg from 'pg';
import type { AiProvider } from '../ai/provider.ts';
import type { Db } from '../db/pool.ts';
import type { UserRow } from '../users.ts';
import { emptyRewards, type GameService, type Rewards } from '../game/service.ts';

export class QuizError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

interface DeckRow {
  id: string;
  owner_id: string;
  title: string;
  subject: string;
  language: Locale;
  visibility: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  deck_id: string;
  mode: SessionMode;
  state: StoredState;
  current: Question | null;
  status: 'active' | 'done';
}

/** Session state plus server-only bookkeeping. */
interface StoredState extends SessionState {
  language: Locale;
  formats?: Format[];
  teachBack?: { questionId: string; firstText: string; followUp: string };
  heartsLost: number;
  /** Mock exam timing. */
  startedAt?: number;
  timeLimitMs?: number;
  /** Concepts left unanswered when a mock exam was handed in early or ran out of time. */
  skipped?: string[];
  endedAt?: number;
  /** Set when this session is a study group's daily quiz. */
  groupDaily?: { groupId: string; day: string };
}

export interface PublicSession {
  id: string;
  deckId: string;
  mode: SessionMode;
  answered: number;
  total: number;
  correct: number;
  combo: number;
  bestCombo: number;
  xp: number;
  hearts: number;
  done: boolean;
  /** Mock exams: when time is up. */
  endsAt?: number;
}

export interface AnswerResponse {
  rewards: Rewards;
  result: Omit<GradeResult, 'gradedBy'> & {
    xp: number;
    combo: number;
    multiplier: number;
    retryScheduled: boolean;
    mastered: boolean;
  };
  followUp?: string; // teach-back: answer this before the final grade
  session: PublicSession;
  next: PublicQuestion | null;
  summary: SessionSummary | null;
}

export interface SessionSummary {
  answered: number;
  correct: number;
  accuracy: number;
  xp: number;
  coins: number;
  bestCombo: number;
  streak: { days: number; extended: boolean };
  heartsGained: number;
  endedReason: NonNullable<SessionState['endedReason']>;
  rewards: Rewards;
  concepts: { id: string; term: string; score: number; band: string }[];
}

const OPEN_GRADE_TIMEOUT_MS = 20_000;

export class QuizService {
  // Questions generated ahead of time so the next one is ready when the learner answers.
  private prefetch = new Map<string, { conceptId: string; promise: Promise<Question | null>; at: number }>();

  /** Drop warmed-up questions for sessions the learner abandoned. */
  private prunePrefetch() {
    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, p] of this.prefetch) if (p.at < cutoff) this.prefetch.delete(id);
  }

  constructor(
    private db: Db,
    private ai: AiProvider,
    private game: GameService,
    private log: (msg: string, err?: unknown) => void = () => {},
  ) {}

  // ---------- decks ----------

  async loadDeck(deckId: string, userId: string): Promise<{ deck: DeckRow; concepts: Concept[] }> {
    const { rows } = await this.db.query<DeckRow>('SELECT id, owner_id, title, subject, language, visibility FROM decks WHERE id = $1', [deckId]);
    const deck = rows[0];
    if (!deck || !(await this.canRead(deck, userId))) throw new QuizError(404, 'deck_not_found');
    const c = await this.db.query<{ id: string; data: Omit<Concept, 'id'> }>('SELECT id, data FROM concepts WHERE deck_id = $1 ORDER BY position, created_at', [deckId]);
    return { deck, concepts: c.rows.map((r) => ({ ...r.data, id: r.id })) };
  }

  /** Owner, public decks, friends-only decks for friends, and decks shared to one of your groups. */
  private async canRead(deck: DeckRow, userId: string): Promise<boolean> {
    if (deck.owner_id === userId || deck.visibility === 'public') return true;
    const { rowCount } = await this.db.query(
      `SELECT 1 WHERE EXISTS (SELECT 1 FROM group_decks gd JOIN group_members m ON m.group_id = gd.group_id WHERE gd.deck_id = $1 AND m.user_id = $2)
          OR ($4 = 'friends' AND EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND f.user_a = least($2::uuid, $3::uuid) AND f.user_b = greatest($2::uuid, $3::uuid)))`,
      [deck.id, userId, deck.owner_id, deck.visibility],
    );
    return !!rowCount;
  }

  async loadStates(userId: string, conceptIds: string[]): Promise<Map<string, ConceptStateView>> {
    if (conceptIds.length === 0) return new Map();
    const { rows } = await this.db.query<{ concept_id: string; progress: ConceptProgress; srs: SrsState }>(
      'SELECT concept_id, progress, srs FROM concept_states WHERE user_id = $1 AND concept_id = ANY($2::uuid[])',
      [userId, conceptIds],
    );
    return new Map(rows.map((r) => [r.concept_id, { conceptId: r.concept_id, progress: r.progress, srs: r.srs }]));
  }

  /** Mastery map for a deck: every concept with its band and score. */
  async masteryMap(deckId: string, userId: string) {
    const { deck, concepts } = await this.loadDeck(deckId, userId);
    const states = await this.loadStates(userId, concepts.map((c) => c.id));
    const now = Date.now();
    const items = concepts.map((c) => {
      const s = states.get(c.id);
      const p = s?.progress ?? newProgress();
      return {
        id: c.id,
        term: c.term,
        topic: c.topic,
        kind: c.kind,
        band: masteryBand(p),
        score: masteryScore(p),
        formatsPassed: p.formatsPassed.length,
        due: s?.srs ? s.srs.due <= now : false,
      };
    });
    return { deck, concepts: items };
  }

  // ---------- sessions ----------

  async start(
    user: UserRow,
    deckId: string,
    mode: SessionMode,
    length: number,
    formats?: Format[],
    groupDaily?: StoredState['groupDaily'],
  ): Promise<{ session: PublicSession; question: PublicQuestion }> {
    const now = Date.now();
    if (mode === 'challenge' && !canStartChallenge({ hearts: user.hearts, updatedAt: user.hearts_updated_at.getTime() }, now)) {
      throw new QuizError(403, 'no_hearts');
    }
    const { deck, concepts } = await this.loadDeck(deckId, user.id);
    const states = await this.loadStates(user.id, concepts.map((c) => c.id));
    const rng = seededRng(hashString(user.id + now));
    const ids = pickConcepts(concepts, states, length, mode, now, rng);
    const exam = mode === 'exam';
    const state: StoredState = {
      ...newSession(mode, ids),
      heartsLost: 0,
      language: deck.language,
      formats: formats?.length ? formats : exam ? EXAM_FORMATS : undefined,
      groupDaily,
      ...(exam ? { startedAt: now, timeLimitMs: examTimeLimitMs(ids.length) } : {}),
    };

    const { rows } = await this.db.query<{ id: string }>('INSERT INTO quiz_sessions (user_id, deck_id, mode, state) VALUES ($1, $2, $3, $4) RETURNING id', [
      user.id,
      deckId,
      mode,
      JSON.stringify(state),
    ]);
    const sessionId = rows[0]!.id;
    const q = await this.serveNext(user, sessionId, deckId, state, concepts);
    if (!q) throw new QuizError(422, 'no_questions');
    return { session: this.publicSession(sessionId, deckId, state, user), question: publicQuestion(q) };
  }

  async resume(user: UserRow, sessionId: string): Promise<{ session: PublicSession; question: PublicQuestion | null; followUp?: string }> {
    const s = await this.getSession(user.id, sessionId);
    const followUp = s.current && s.state.teachBack?.questionId === s.current.id ? s.state.teachBack.followUp : undefined;
    return { session: this.publicSession(s.id, s.deck_id, s.state, user), question: s.current ? publicQuestion(s.current) : null, followUp };
  }

  private async getSession(userId: string, sessionId: string, client: pg.PoolClient | Db = this.db, lock = false): Promise<SessionRow> {
    const { rows } = await client.query<SessionRow>(`SELECT * FROM quiz_sessions WHERE id = $1 AND user_id = $2${lock ? ' FOR UPDATE' : ''}`, [sessionId, userId]);
    if (!rows[0]) throw new QuizError(404, 'session_not_found');
    return rows[0];
  }

  /** Generate the question for the next concept in the queue and store it (with its answer key) on the session. */
  private async serveNext(user: UserRow, sessionId: string, deckId: string, state: StoredState, concepts?: Concept[]): Promise<Question | null> {
    const conceptId = state.queue[0];
    if (!conceptId) return null;
    concepts ??= (await this.loadDeck(deckId, user.id)).concepts;
    let q: Question | null = null;

    const pre = this.prefetch.get(sessionId);
    this.prefetch.delete(sessionId);
    if (pre && pre.conceptId === conceptId && !isRetry(state, conceptId)) q = await pre.promise.catch(() => null);
    if (!q) q = await this.makeQuestion(user, conceptId, concepts, state);
    if (!q) {
      // Nothing could be generated for this concept: drop it and move on.
      state.queue.shift();
      state.total = Math.max(state.answered, state.total - 1);
      return this.serveNext(user, sessionId, deckId, state, concepts);
    }
    await this.db.query('UPDATE quiz_sessions SET current = $2, state = $3, updated_at = now() WHERE id = $1', [sessionId, JSON.stringify(q), JSON.stringify(state)]);

    // Warm up the following question while the learner thinks.
    const following = state.queue[1];
    if (following && following !== conceptId) {
      this.prunePrefetch();
      const promise = this.makeQuestion(user, following, concepts, state);
      promise.catch(() => {}); // never an unhandled rejection if it ends up unused
      this.prefetch.set(sessionId, { conceptId: following, promise, at: Date.now() });
    }
    return q;
  }

  private async makeQuestion(user: UserRow, conceptId: string, concepts: Concept[], state: StoredState): Promise<Question | null> {
    const concept = concepts.find((c) => c.id === conceptId);
    if (!concept) return null;
    const states = await this.loadStates(user.id, [conceptId]);
    // Within a session, also respect formats used earlier in this session for this concept.
    const sessionFormats = state.history.filter((h) => h.conceptId === conceptId).map((h) => h.format).reverse();
    const stored = states.get(conceptId)?.progress ?? newProgress();
    const progress: ConceptProgress = { ...stored, recentFormats: [...new Set([...sessionFormats, ...stored.recentFormats])].slice(0, 4) };
    const recent = await this.db.query<{ prompt: string; variant_key: string }>(
      `SELECT question->>'prompt' AS prompt, variant_key FROM attempts WHERE user_id = $1 AND concept_id = $2 ORDER BY created_at DESC LIMIT 8`,
      [user.id, conceptId],
    );
    const recentKeys = new Set([...recent.rows.map((r) => r.variant_key), ...state.history.filter((h) => h.conceptId === conceptId).map((h) => h.variantKey)]);
    const allowed = state.formats;
    const language = state.language;
    const tried: Format[] = [];
    const rng = seededRng(hashString(`${user.id}:${conceptId}:${Date.now()}:${state.answered}`));

    for (let attempt = 0; attempt < 4; attempt++) {
      const choice = chooseFormat(concept, concepts, progress, rng, { exclude: tried, allowed });
      if (!choice) return null;
      const q = await this.ai.generateQuestion({
        concept,
        format: choice.format,
        bloom: choice.bloom,
        deck: concepts,
        language,
        avoidPrompts: recent.rows.map((r) => r.prompt),
        seed: Math.floor(rng() * 2 ** 31),
      });
      if (q && !recentKeys.has(q.variantKey)) return q;
      tried.push(choice.format);
    }
    return null;
  }

  async answer(user: UserRow, sessionId: string, questionId: string, answer: Answer, timeMs: number | undefined): Promise<AnswerResponse> {
    const now = Date.now();
    const row = await this.getSession(user.id, sessionId);
    if (row.status !== 'active') throw new QuizError(409, 'session_done');
    if (row.state.startedAt && row.state.timeLimitMs && now > row.state.startedAt + row.state.timeLimitMs + 15_000) {
      // Mock exam: time is up, so the paper is handed in as it is.
      await this.handIn(user, sessionId);
      throw new QuizError(409, 'time_up');
    }
    const q = row.current;
    if (!q || q.id !== questionId) throw new QuizError(409, 'stale_question');
    const state = row.state;
    const deckLang = q.language;

    // ---- grade (AI for open parts, with a heuristic fallback) ----
    const need = openPart(q, answer);
    let open: OpenGrade | undefined;
    const isTeachBack = q.format === 'teach_back' && answer.kind === 'text';
    const firstTeach = isTeachBack && state.teachBack?.questionId !== q.id;
    if (need) {
      const text = isTeachBack && !firstTeach ? `${state.teachBack!.firstText}\n\n${need.text}` : need.text;
      try {
        open = await withTimeout(
          this.ai.gradeOpen({ question: q, need: { ...need, text }, language: deckLang, previous: isTeachBack && !firstTeach ? state.teachBack!.firstText : undefined, wantFollowUp: firstTeach }),
          OPEN_GRADE_TIMEOUT_MS,
        );
      } catch (err) {
        this.log('open grading failed; using heuristic', err);
      }
    }

    // Teach-back has two turns: Lumoly asks a follow-up before the final grade.
    if (firstTeach && answer.kind === 'text') {
      const followUp = open?.followUp ?? (deckLang === 'fr' ? 'Tu peux me donner un exemple ?' : 'Can you give me an example?');
      state.teachBack = { questionId: q.id, firstText: answer.text, followUp };
      await this.db.query('UPDATE quiz_sessions SET state = $2, updated_at = now() WHERE id = $1', [sessionId, JSON.stringify(state)]);
      return {
        rewards: emptyRewards(),
        result: { score: 0, correct: false, correctAnswer: '', explanation: '', xp: 0, combo: state.combo, multiplier: 1, retryScheduled: false, mastered: false },
        followUp,
        session: this.publicSession(sessionId, row.deck_id, state, user),
        next: publicQuestion(q),
        summary: null,
      };
    }
    if (isTeachBack && state.teachBack && answer.kind === 'text') {
      answer = { kind: 'text', text: `${state.teachBack.firstText}\n\n${answer.text}` };
      delete state.teachBack;
    }
    // Short typed answers: a fair judge accepts the same meaning in other words ("round" for "circular").
    let meaning: Record<string, boolean> = {};
    const checks = shortAnswersToCheck(q, answer);
    if (checks.length && this.ai.name === 'claude') {
      meaning = await withTimeout(this.ai.judgeShort(q.prompt, checks, deckLang), 8_000).catch((err) => (this.log('meaning check failed', err), {}));
    }
    const g = grade(q, answer, open, meaning);

    // ---- persist: learner progress, XP, hearts, session (one transaction) ----
    const client = await this.db.connect();
    let outcome: ReturnType<typeof applyAnswer>;
    let xp = 0;
    let masteredNow = false;
    let hearts = currentHearts({ hearts: user.hearts, updatedAt: user.hearts_updated_at.getTime() }, now).state;
    let rewards: Rewards = emptyRewards();
    // Active XP boost + equipped pet perk (capped in core).
    const boost = await this.game.boostFor(user.id, now);
    try {
      await client.query('BEGIN');
      const locked = await this.getSession(user.id, sessionId, client, true);
      if (locked.current?.id !== questionId) throw new QuizError(409, 'stale_question');

      const st = await client.query<{ progress: ConceptProgress; srs: SrsState }>('SELECT progress, srs FROM concept_states WHERE user_id = $1 AND concept_id = $2 FOR UPDATE', [user.id, q.conceptId]);
      const prevProgress = st.rows[0]?.progress ?? newProgress();
      const prevSrs = st.rows[0]?.srs ?? newSrsState(now);
      const progress = recordAttempt(prevProgress, q.format, q.bloom, g.score);
      const fast = (timeMs ?? Infinity) < 15_000;
      const srs = review(prevSrs, ratingFromScore(g.score, fast), now);
      masteredNow = isMastered(progress) && !isMastered(prevProgress);
      await client.query(
        `INSERT INTO concept_states (user_id, concept_id, progress, srs, updated_at) VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, concept_id) DO UPDATE SET progress = EXCLUDED.progress, srs = EXCLUDED.srs, updated_at = now()`,
        [user.id, q.conceptId, JSON.stringify(progress), JSON.stringify(srs)],
      );

      const firstTry = !isRetry(state, q.conceptId);
      const comboAfter = g.correct ? state.combo + 1 : 0;
      xp = xpForAnswer({ format: q.format, bloom: q.bloom, score: g.score, firstTry, combo: comboAfter, boost });
      outcome = applyAnswer(state, { conceptId: q.conceptId, format: q.format, bloom: q.bloom, score: g.score, variantKey: q.variantKey }, xp);
      const next: StoredState = { ...state, ...outcome.state, teachBack: undefined };

      if (state.mode === 'challenge' && g.score < 0.5) {
        hearts = loseHeart(hearts, now);
        next.heartsLost += 1;
        if (hearts.hearts <= 0) next.endedReason = 'out_of_hearts';
      }

      await client.query(
        `INSERT INTO attempts (user_id, concept_id, session_id, format, bloom, variant_key, score, time_ms, question, answer)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [user.id, q.conceptId, sessionId, q.format, q.bloom, q.variantKey, g.score, timeMs ?? null, JSON.stringify(q), JSON.stringify(answer)],
      );
      await client.query('UPDATE users SET hearts = $2, hearts_updated_at = $3 WHERE id = $1', [user.id, hearts.hearts, new Date(hearts.updatedAt)]);
      rewards = await this.game.award(client, user.id, {
        xp,
        reason: 'answer',
        events: [{ type: 'answer', correct: g.correct, combo: comboAfter }, ...(masteredNow ? [{ type: 'mastered' as const }] : [])],
      });
      await client.query('UPDATE quiz_sessions SET state = $2, current = NULL, updated_at = now() WHERE id = $1', [sessionId, JSON.stringify(next)]);
      await client.query('COMMIT');
      outcome = { ...outcome, state: next };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const stateAfter = outcome.state as StoredState;
    const fresh = { ...user, xp: user.xp + xp, hearts: hearts.hearts, hearts_updated_at: new Date(hearts.updatedAt) };
    let nextQ: Question | null = null;
    let summary: SessionSummary | null = null;
    if (!sessionDone(stateAfter)) nextQ = await this.serveNext(fresh, sessionId, row.deck_id, stateAfter);
    if (!nextQ) summary = await this.finish(fresh, sessionId, stateAfter);

    const { gradedBy: _g, ...result } = g;
    if (summary) rewards = mergeRewards(rewards, summary.rewards);
    return {
      rewards,
      result: { ...result, xp, combo: outcome.combo, multiplier: outcome.multiplier, retryScheduled: outcome.retryScheduled, mastered: masteredNow },
      session: this.publicSession(sessionId, row.deck_id, stateAfter, { ...fresh, hearts: summary ? fresh.hearts + summary.heartsGained : fresh.hearts }, !!summary),
      next: nextQ ? publicQuestion(nextQ) : null,
      summary,
    };
  }

  /** End of session: streak, coins, review hearts, and a mastery report. */
  private async finish(user: UserRow, sessionId: string, state: StoredState): Promise<SessionSummary> {
    this.prefetch.delete(sessionId);
    const now = Date.now();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const s = await client.query<{ status: string }>('SELECT status FROM quiz_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
      const alreadyDone = s.rows[0]?.status === 'done';
      const u = (await client.query<{ streak: StreakState; timezone: string; hearts: number; hearts_updated_at: Date }>('SELECT streak, timezone, hearts, hearts_updated_at FROM users WHERE id = $1 FOR UPDATE', [user.id])).rows[0]!;

      const studied = state.answered >= 3;
      const streakUpdate = studied && !alreadyDone ? recordStudyDay(u.streak, dayKey(now, u.timezone)) : { state: u.streak, extended: false };
      const accuracy = state.answered ? state.correct / state.answered : 0;
      const coins = alreadyDone || !studied ? 0 : 5 + state.correct * 2 + (accuracy === 1 && state.answered >= 5 ? 10 : 0);
      let heartsGained = 0;
      let hearts = { hearts: u.hearts, updatedAt: u.hearts_updated_at.getTime() };
      if (!alreadyDone && (state.mode === 'review' || state.mode === 'practice') && studied) {
        // Practice gives hearts back: learning is never blocked.
        const before = currentHearts(hearts, now).hearts;
        hearts = gainHearts(hearts, now, state.mode === 'review' ? 2 : 1);
        heartsGained = hearts.hearts - before;
      }
      await client.query('UPDATE users SET streak = $2, coins = coins + $3, hearts = $4, hearts_updated_at = $5, last_seen_at = now() WHERE id = $1', [
        user.id,
        JSON.stringify(streakUpdate.state),
        coins,
        hearts.hearts,
        new Date(hearts.updatedAt),
      ]);
      if (!alreadyDone && state.groupDaily) {
        // First finished attempt of the day counts on the group board (no farming).
        await client.query('INSERT INTO group_daily (group_id, day, user_id, correct, answered) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING', [
          state.groupDaily.groupId,
          state.groupDaily.day,
          user.id,
          state.correct,
          state.answered,
        ]);
      }
      await client.query("UPDATE quiz_sessions SET status = 'done', current = NULL, state = $2, updated_at = now() WHERE id = $1", [sessionId, JSON.stringify({ ...state, endedReason: state.endedReason ?? 'done' })]);
      const rewards = alreadyDone
        ? emptyRewards()
        : await this.game.award(client, user.id, {
            events: [
              { type: 'session_done', perfect: accuracy === 1 && state.answered >= 5, answered: state.answered },
              ...(streakUpdate.extended ? [{ type: 'streak' as const, days: streakUpdate.state.days }] : []),
            ],
          });
      await client.query('COMMIT');

      const conceptIds = [...new Set(state.history.map((h) => h.conceptId))];
      const states = await this.loadStates(user.id, conceptIds);
      const terms = await this.db.query<{ id: string; term: string }>("SELECT id, data->>'term' AS term FROM concepts WHERE id = ANY($1::uuid[])", [conceptIds]);
      const termOf = new Map(terms.rows.map((r) => [r.id, r.term]));
      return {
        answered: state.answered,
        correct: state.correct,
        accuracy,
        xp: state.xp,
        coins,
        bestCombo: state.bestCombo,
        streak: { days: streakUpdate.state.days, extended: streakUpdate.extended },
        heartsGained,
        endedReason: state.endedReason ?? 'done',
        rewards,
        concepts: conceptIds.map((id) => {
          const p = states.get(id)?.progress ?? newProgress();
          return { id, term: termOf.get(id) ?? '', score: masteryScore(p), band: masteryBand(p) };
        }),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Mock exam report, built from the answers stored for the session. */
  async report(userId: string, sessionId: string): Promise<{ deckId: string; deckTitle: string; report: ExamReport }> {
    const s = await this.getSession(userId, sessionId);
    if (s.state.mode !== 'exam') throw new QuizError(404, 'not_an_exam');
    if (s.status !== 'done') throw new QuizError(409, 'exam_not_finished');
    const { rows } = await this.db.query<{ concept_id: string; term: string; topic: string; format: Format; bloom: ExamItem['bloom']; score: number; created_at: Date }>(
      `SELECT a.concept_id, c.data->>'term' AS term, c.data->>'topic' AS topic, a.format, a.bloom, a.score, a.created_at
       FROM attempts a JOIN concepts c ON c.id = a.concept_id WHERE a.session_id = $1 ORDER BY a.created_at`,
      [sessionId],
    );
    const deck = (await this.db.query<{ title: string }>('SELECT title FROM decks WHERE id = $1', [s.deck_id])).rows[0];
    const end = s.state.endedAt ?? rows.at(-1)?.created_at.getTime() ?? Date.now();
    const timeMs = s.state.startedAt ? end - s.state.startedAt : 0;
    const items = rows.map((r) => ({ conceptId: r.concept_id, term: r.term, topic: r.topic, format: r.format, bloom: r.bloom, score: r.score }));
    const skipped = s.state.skipped ?? [];
    const meta = skipped.length
      ? (await this.db.query<{ id: string; term: string; topic: string }>("SELECT id, data->>'term' AS term, data->>'topic' AS topic FROM concepts WHERE id = ANY($1::uuid[])", [skipped])).rows
      : [];
    const unanswered = skipped.flatMap((id) => meta.filter((m) => m.id === id).map((m) => ({ conceptId: m.id, term: m.term, topic: m.topic })));
    return { deckId: s.deck_id, deckTitle: deck?.title ?? '', report: examReport(items, timeMs, s.state.timeLimitMs ?? 0, unanswered) };
  }

  /** Hand in a mock exam now (or when time is up): what's left counts as unanswered. */
  async handIn(user: UserRow, sessionId: string): Promise<SessionSummary> {
    const s = await this.getSession(user.id, sessionId);
    if (s.state.mode !== 'exam') throw new QuizError(400, 'not_an_exam');
    if (s.status === 'done') throw new QuizError(409, 'session_done');
    const state: StoredState = { ...s.state, skipped: [...new Set(s.state.queue)], queue: [], endedAt: Date.now() };
    await this.db.query('UPDATE quiz_sessions SET state = $2, current = NULL WHERE id = $1', [sessionId, JSON.stringify(state)]);
    this.prefetch.delete(sessionId);
    return this.finish(user, sessionId, state);
  }

  private publicSession(id: string, deckId: string, s: StoredState, user: Pick<UserRow, 'hearts' | 'hearts_updated_at'>, done = false): PublicSession {
    return {
      id,
      deckId,
      mode: s.mode,
      answered: s.answered,
      total: s.total,
      correct: s.correct,
      combo: s.combo,
      bestCombo: s.bestCombo,
      xp: s.xp,
      hearts: currentHearts({ hearts: user.hearts, updatedAt: user.hearts_updated_at.getTime() }, Date.now()).hearts,
      done: done || sessionDone(s),
      endsAt: s.startedAt && s.timeLimitMs ? s.startedAt + s.timeLimitMs : undefined,
    };
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

export function mergeRewards(a: Rewards, b: Rewards): Rewards {
  return { xp: a.xp + b.xp, levelUp: b.levelUp ?? a.levelUp, badges: [...a.badges, ...b.badges], questsCompleted: [...a.questsCompleted, ...b.questsCompleted] };
}
