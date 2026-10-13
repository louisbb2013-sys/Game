import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { QuizError } from '../quiz/service.ts';

const idParam = z.object({ id: z.string().uuid() });

export async function handleErrors<T>(reply: FastifyReply, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof QuizError) return reply.code(err.status).send({ error: err.code });
    throw err;
  }
}

export async function chatRoutes(app: FastifyInstance, ctx: AppContext) {
  const { chat } = ctx;
  const auth = { preHandler: ctx.requireUser };
  const withId = (params: unknown, reply: FastifyReply) => {
    const p = idParam.safeParse(params);
    if (!p.success) {
      void reply.code(404).send({ error: 'chat_not_found' });
      return null;
    }
    return p.data.id;
  };

  app.get('/api/chats', auth, async (req) => ({ chats: await chat.list(req.user!) }));
  app.post('/api/chats', auth, async (req) => chat.create(req.user!));

  app.get('/api/chats/:id', auth, async (req, reply) => {
    const id = withId(req.params, reply);
    return id && handleErrors(reply, () => chat.get(req.user!, id));
  });

  app.delete('/api/chats/:id', auth, async (req, reply) => {
    const id = withId(req.params, reply);
    if (!id) return;
    await chat.remove(req.user!, id);
    return { ok: true };
  });

  const uploadBody = z.object({
    kind: z.enum(['image', 'pdf', 'text']),
    mime: z.string().max(100),
    name: z.string().max(200).default(''),
    data: z.string().max(28_000_000), // base64
    consent: z.boolean(),
  });
  app.post('/api/chats/:id/uploads', { ...auth, bodyLimit: 30_000_000, config: { rateLimit: { max: 40, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const id = withId(req.params, reply);
    const body = uploadBody.safeParse(req.body);
    if (!id) return;
    if (!body.success) return reply.code(400).send({ error: 'invalid_upload' });
    return handleErrors(reply, () => chat.upload(req.user!, id, body.data));
  });

  const messageBody = z.object({ text: z.string().max(20_000).default(''), uploadIds: z.array(z.string().uuid()).max(20).default([]) });
  // AI calls cost money: keep a per-learner pace.
  app.post('/api/chats/:id/messages', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const id = withId(req.params, reply);
    const body = messageBody.safeParse(req.body);
    if (!id) return;
    if (!body.success || (!body.data.text.trim() && body.data.uploadIds.length === 0)) return reply.code(400).send({ error: 'empty_message' });
    return handleErrors(reply, () => chat.send(req.user!, id, body.data.text.trim(), body.data.uploadIds));
  });

  app.put('/api/chats/:id/draft', auth, async (req, reply) => {
    const id = withId(req.params, reply);
    return id && handleErrors(reply, async () => ({ draft: await chat.saveDraft(req.user!, id, (req.body as { draft?: unknown })?.draft) }));
  });

  app.post('/api/chats/:id/build', auth, async (req, reply) => {
    const id = withId(req.params, reply);
    return id && handleErrors(reply, () => chat.build(req.user!, id, (req.body as { draft?: unknown } | undefined)?.draft));
  });
}
