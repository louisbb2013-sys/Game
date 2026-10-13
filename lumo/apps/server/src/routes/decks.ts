import { SAMPLE_DECKS } from '@lumo/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import type { Db } from '../db/pool.ts';
import { deckInputSchema } from '../quiz/schemas.ts';

type DeckInput = z.infer<typeof deckInputSchema>;

export async function createDeck(db: Db, ownerId: string, input: DeckInput): Promise<string> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ id: string }>('INSERT INTO decks (owner_id, title, subject, language, summary) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
      ownerId,
      input.title,
      input.subject,
      input.language,
      input.summary,
    ]);
    const deckId = rows[0]!.id;
    for (const [i, c] of input.concepts.entries()) {
      await client.query('INSERT INTO concepts (deck_id, position, data) VALUES ($1, $2, $3)', [deckId, i, JSON.stringify(c)]);
    }
    await client.query('COMMIT');
    return deckId;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const idParam = z.object({ id: z.string().uuid() });

export async function deckRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, quiz } = ctx;
  const auth = { preHandler: ctx.requireUser };

  app.get('/api/decks', auth, async (req) => {
    const { rows } = await db.query(
      `SELECT d.id, d.title, d.subject, d.language, d.updated_at AS "updatedAt",
              count(c.id)::int AS "conceptCount",
              coalesce(sum(CASE WHEN jsonb_array_length(cs.progress->'formatsPassed') >= 3 AND (cs.progress->>'lastCorrect')::boolean THEN 1 ELSE 0 END), 0)::int AS "masteredCount",
              coalesce(sum(CASE WHEN (cs.srs->>'due')::bigint <= $2 THEN 1 ELSE 0 END), 0)::int AS "dueCount"
       FROM decks d
       LEFT JOIN concepts c ON c.deck_id = d.id
       LEFT JOIN concept_states cs ON cs.concept_id = c.id AND cs.user_id = $1
       WHERE d.owner_id = $1
       GROUP BY d.id ORDER BY d.updated_at DESC`,
      [req.user!.id, Date.now()],
    );
    return { decks: rows };
  });

  app.post('/api/decks', auth, async (req, reply) => {
    const body = deckInputSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_deck', issues: body.error.issues.slice(0, 5) });
    const id = await createDeck(db, req.user!.id, body.data);
    return { id };
  });

  app.post('/api/decks/sample', auth, async (req) => {
    const { language } = z.object({ language: z.enum(['en', 'fr']).optional() }).parse(req.body ?? {});
    const sample = SAMPLE_DECKS[language ?? req.user!.locale];
    const id = await createDeck(db, req.user!.id, deckInputSchema.parse(sample));
    return { id };
  });

  app.get('/api/decks/:id', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'deck_not_found' });
    const { deck, concepts } = await quiz.masteryMap(p.data.id, req.user!.id);
    return { deck: { id: deck.id, title: deck.title, subject: deck.subject, language: deck.language, mine: deck.owner_id === req.user!.id }, concepts };
  });

  app.delete('/api/decks/:id', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'deck_not_found' });
    const r = await db.query('DELETE FROM decks WHERE id = $1 AND owner_id = $2', [p.data.id, req.user!.id]);
    if (r.rowCount === 0) return reply.code(404).send({ error: 'deck_not_found' });
    return { ok: true };
  });
}
