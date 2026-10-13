import { SANDBOX_KINDS } from '@lumo/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { handleErrors } from './chat.ts';

export async function sandboxRoutes(app: FastifyInstance, ctx: AppContext) {
  const { sandbox } = ctx;
  const auth = { preHandler: ctx.requireUser };
  const uuid = z.string().uuid();

  app.get('/api/sandbox', auth, async (req) => ({ activities: await sandbox.recent(req.user!) }));

  app.get('/api/decks/:id/sandbox', auth, async (req, reply) => {
    const id = uuid.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(404).send({ error: 'deck_not_found' });
    return handleErrors(reply, async () => ({ formats: await sandbox.available(req.user!, id.data) }));
  });

  const createBody = z.object({ deckId: uuid, kind: z.enum(SANDBOX_KINDS), focus: z.array(uuid).max(50).default([]) });
  app.post('/api/sandbox', { ...auth, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = createBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => sandbox.create(req.user!, body.data.deckId, body.data.kind, body.data.focus).then(pub));
  });

  const askBody = z.object({ text: z.string().trim().min(2).max(500), deckId: uuid.optional() });
  app.post('/api/sandbox/ask', { ...auth, config: { rateLimit: { max: 30, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = askBody.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => sandbox.ask(req.user!, body.data.text, body.data.deckId).then(pub));
  });

  app.get('/api/sandbox/:id', auth, async (req, reply) => {
    const id = uuid.safeParse((req.params as { id: string }).id);
    if (!id.success) return reply.code(404).send({ error: 'activity_not_found' });
    return handleErrors(reply, () => sandbox.get(req.user!, id.data).then(pub));
  });

  const completeBody = z.object({ score: z.number().min(0).max(1) });
  app.post('/api/sandbox/:id/complete', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const id = uuid.safeParse((req.params as { id: string }).id);
    const body = completeBody.safeParse(req.body);
    if (!id.success) return reply.code(404).send({ error: 'activity_not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => sandbox.complete(req.user!, id.data, body.data.score));
  });
}

function pub(a: { id: string; deck_id: string | null; kind: string; title: string; data: unknown; score: number | null; xp: number; completed_at: Date | null }) {
  return { id: a.id, deckId: a.deck_id, kind: a.kind, title: a.title, data: a.data, score: a.score, xp: a.xp, completed: !!a.completed_at };
}
