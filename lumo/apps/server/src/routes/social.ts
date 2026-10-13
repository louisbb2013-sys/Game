import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { handleErrors } from './chat.ts';

const uuid = z.string().uuid();
const code = z.string().trim().min(4).max(12).regex(/^[A-Za-z0-9]+$/);

export async function socialRoutes(app: FastifyInstance, ctx: AppContext) {
  const { social, quiz } = ctx;
  const auth = { preHandler: ctx.requireUser };
  const idOf = (p: unknown) => uuid.safeParse((p as { id?: string }).id);

  // ---------------------------------------------------------------- friends

  app.get('/api/friends', auth, async (req) => social.friends(req.user!.id));
  app.get('/api/friends/leaderboard', auth, async (req) => ({ rows: await social.friendsBoard(req.user!.id) }));

  const requestBody = z.union([z.object({ username: z.string().trim().min(1).max(30) }), z.object({ code })]);
  // Limited so nobody can sweep usernames or codes.
  app.post('/api/friends/request', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = requestBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => social.request(req.user!.id, b.data));
  });

  const respondBody = z.object({ accept: z.boolean() });
  app.post('/api/friends/:id/respond', auth, async (req, reply) => {
    const id = idOf(req.params);
    const b = respondBody.safeParse(req.body);
    if (!id.success) return reply.code(404).send({ error: 'request_not_found' });
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => social.respond(req.user!.id, id.data, b.data.accept));
  });

  app.delete('/api/friends/:id', auth, async (req, reply) => {
    const id = idOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'not_found' });
    return social.remove(req.user!.id, id.data);
  });

  // ---------------------------------------------------------------- groups

  app.get('/api/groups', auth, async (req) => ({ groups: await social.myGroups(req.user!.id) }));

  app.post('/api/groups', auth, async (req, reply) => {
    const b = z.object({ name: z.string().max(80) }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => social.createGroup(req.user!.id, b.data.name));
  });

  app.post('/api/groups/join', { ...auth, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = z.object({ code }).safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => social.joinGroup(req.user!.id, b.data.code));
  });

  app.get('/api/groups/:id', auth, async (req, reply) => {
    const id = idOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'group_not_found' });
    return handleErrors(reply, () => social.group(req.user!.id, id.data));
  });

  app.post('/api/groups/:id/leave', auth, async (req, reply) => {
    const id = idOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'group_not_found' });
    return handleErrors(reply, () => social.leaveGroup(req.user!.id, id.data));
  });

  const deckBody = z.object({ deckId: uuid });
  app.post('/api/groups/:id/decks', auth, async (req, reply) => {
    const id = idOf(req.params);
    const b = deckBody.safeParse(req.body);
    if (!id.success) return reply.code(404).send({ error: 'group_not_found' });
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => social.shareDeck(req.user!.id, id.data, b.data.deckId));
  });

  app.delete('/api/groups/:id/decks/:deckId', auth, async (req, reply) => {
    const id = idOf(req.params);
    const deckId = uuid.safeParse((req.params as { deckId?: string }).deckId);
    if (!id.success || !deckId.success) return reply.code(404).send({ error: 'deck_not_found' });
    return handleErrors(reply, () => social.unshareDeck(req.user!.id, id.data, deckId.data));
  });

  /** Everyone in the group gets the same deck today; the first finished try goes on the board. */
  app.post('/api/groups/:id/daily', auth, async (req, reply) => {
    const id = idOf(req.params);
    if (!id.success) return reply.code(404).send({ error: 'group_not_found' });
    return handleErrors(reply, async () => {
      const t = await social.dailyTarget(req.user!.id, id.data);
      return quiz.start(req.user!, t.deckId, 'practice', 8, undefined, { groupId: id.data, day: t.day });
    });
  });
}
