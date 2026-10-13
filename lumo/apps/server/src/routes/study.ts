import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { offlineReviewSchema } from '../study/service.ts';
import { handleErrors } from './chat.ts';

const uuid = z.string().uuid();

export async function studyRoutes(app: FastifyInstance, ctx: AppContext) {
  const { study } = ctx;
  const auth = { preHandler: ctx.requireUser };
  const deckOf = (p: unknown) => uuid.safeParse((p as { id?: string }).id);

  // ---- study plans
  app.get('/api/plans/today', auth, async (req) => study.today(req.user!));

  app.get('/api/decks/:id/plan', auth, async (req, reply) => {
    const id = deckOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'deck_not_found' });
    return handleErrors(reply, () => study.plan(req.user!, id.data));
  });

  const planBody = z.object({ examDay: z.string().max(10), minutesPerDay: z.number().int().min(5).max(180).default(20) });
  app.put('/api/decks/:id/plan', auth, async (req, reply) => {
    const id = deckOf(req.params);
    const b = planBody.safeParse(req.body);
    if (!id.success) return reply.code(404).send({ error: 'deck_not_found' });
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => study.setPlan(req.user!, id.data, b.data.examDay, b.data.minutesPerDay));
  });

  app.delete('/api/decks/:id/plan', auth, async (req, reply) => {
    const id = deckOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'deck_not_found' });
    return study.deletePlan(req.user!.id, id.data);
  });

  // ---- progress links for parents and teachers
  app.get('/api/me/shares', auth, async (req) => study.shares(req.user!.id));
  app.post('/api/me/shares', auth, async (req, reply) => {
    const b = z.object({ label: z.string().max(40).default('') }).safeParse(req.body ?? {});
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => study.createShare(req.user!.id, b.data.label));
  });
  app.delete('/api/me/shares/:token', auth, async (req, reply) => {
    const token = z.string().max(64).safeParse((req.params as { token?: string }).token);
    if (!token.success) return reply.code(404).send({ error: 'link_not_found' });
    return handleErrors(reply, () => study.revokeShare(req.user!.id, token.data));
  });
  // Public (no sign-in): read-only, limited so tokens can't be guessed by brute force.
  app.get('/api/progress/:token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const token = z.string().min(10).max(64).regex(/^[A-Za-z0-9_-]+$/).safeParse((req.params as { token?: string }).token);
    if (!token.success) return reply.code(404).send({ error: 'link_not_found' });
    reply.header('cache-control', 'no-store');
    return handleErrors(reply, () => study.sharedProgress(token.data));
  });

  // ---- offline review
  app.get('/api/decks/:id/offline', auth, async (req, reply) => {
    const id = deckOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'deck_not_found' });
    return handleErrors(reply, () => study.offlineDeck(req.user!.id, id.data));
  });

  const syncBody = z.object({ clientId: z.string().min(8).max(64), deckId: uuid, reviews: z.array(offlineReviewSchema).max(200) });
  app.post('/api/offline/sync', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = syncBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => study.syncOffline(req.user!, b.data.clientId, b.data.deckId, b.data.reviews));
  });

  // ---- my data
  app.get('/api/me/export', { ...auth, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const data = await study.exportData(req.user!.id);
    reply.header('content-disposition', `attachment; filename="lumo-data-${new Date().toISOString().slice(0, 10)}.json"`);
    reply.header('cache-control', 'no-store');
    return data;
  });
}
