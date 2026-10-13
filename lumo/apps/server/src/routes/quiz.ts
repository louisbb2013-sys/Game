import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { answerSchema, startSessionSchema } from '../quiz/schemas.ts';
import { QuizError } from '../quiz/service.ts';

const idParam = z.object({ id: z.string().uuid() });

export async function quizRoutes(app: FastifyInstance, ctx: AppContext) {
  const { quiz } = ctx;
  const auth = { preHandler: ctx.requireUser };

  const handle = async <T>(reply: FastifyReply, fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof QuizError) return reply.code(err.status).send({ error: err.code });
      throw err;
    }
  };

  app.post('/api/decks/:id/sessions', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = startSessionSchema.safeParse(req.body ?? {});
    if (!p.success) return reply.code(404).send({ error: 'deck_not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid' });
    return handle(reply, () => quiz.start(req.user!, p.data.id, body.data.mode, body.data.length, body.data.formats));
  });

  app.get('/api/sessions/:id', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'session_not_found' });
    return handle(reply, () => quiz.resume(req.user!, p.data.id));
  });

  app.get('/api/sessions/:id/report', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'session_not_found' });
    return handle(reply, () => quiz.report(req.user!.id, p.data.id));
  });

  app.post('/api/sessions/:id/hand-in', auth, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    if (!p.success) return reply.code(404).send({ error: 'session_not_found' });
    return handle(reply, async () => ({ summary: await quiz.handIn(req.user!, p.data.id) }));
  });

  const answerBody = z.object({ questionId: z.string().max(60), answer: answerSchema, timeMs: z.number().int().min(0).max(3_600_000).optional() });
  // Answers are graded server-side; the rate limit stops scripted XP farming.
  app.post('/api/sessions/:id/answer', { ...auth, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const p = idParam.safeParse(req.params);
    const body = answerBody.safeParse(req.body);
    if (!p.success) return reply.code(404).send({ error: 'session_not_found' });
    if (!body.success) return reply.code(400).send({ error: 'invalid_answer' });
    return handle(reply, () => quiz.answer(req.user!, p.data.id, body.data.questionId, body.data.answer, body.data.timeMs));
  });
}
