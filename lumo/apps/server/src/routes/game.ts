import { ITEMS, PET_SPECIES, type ItemId, type PetSpeciesId } from '@lumo/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { handleErrors } from './chat.ts';

const itemIds = Object.keys(ITEMS) as [ItemId, ...ItemId[]];
const speciesIds = PET_SPECIES.map((s) => s.id) as [PetSpeciesId, ...PetSpeciesId[]];

export async function gameRoutes(app: FastifyInstance, ctx: AppContext) {
  const { game } = ctx;
  const auth = { preHandler: ctx.requireUser };
  const uuid = z.string().uuid();
  const param = (p: unknown) => uuid.safeParse((p as { id?: string }).id);

  app.get('/api/game/overview', auth, async (req) => game.overview(req.user!.id));
  app.get('/api/game/inventory', auth, async (req) => game.inventory(req.user!.id));
  app.get('/api/game/quests', auth, async (req) => ({ quests: await game.quests(req.user!.id) }));
  app.get('/api/game/badges', auth, async (req) => game.badges(req.user!.id));
  app.get('/api/game/pets', auth, async (req) => ({ pets: await game.pets(req.user!.id) }));
  app.get('/api/game/league', auth, async (req) => game.league(req.user!.id));
  app.get('/api/game/leaderboard/global', auth, async (req) => ({ rows: await game.globalBoard(req.user!.id) }));

  const buyBody = z.object({ itemId: z.enum(itemIds) });
  app.post('/api/game/shop/buy', { ...auth, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const b = buyBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => game.buy(req.user!.id, b.data.itemId));
  });

  app.post('/api/game/chests/:id/open', auth, async (req, reply) => {
    const id = param(req.params);
    if (!id.success) return reply.code(404).send({ error: 'chest_not_found' });
    return handleErrors(reply, () => game.openChest(req.user!.id, id.data));
  });

  const useBody = z.object({ itemId: z.enum(itemIds), petId: uuid.optional() });
  app.post('/api/game/items/use', auth, async (req, reply) => {
    const b = useBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => game.use(req.user!.id, b.data.itemId, b.data.petId));
  });

  const adoptBody = z.object({ species: z.enum(speciesIds), name: z.string().max(40) });
  app.post('/api/game/pets/adopt', auth, async (req, reply) => {
    const b = adoptBody.safeParse(req.body);
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => game.adoptStarter(req.user!.id, b.data.species, b.data.name));
  });

  const petPatch = z.object({ name: z.string().max(40).optional(), equipped: z.literal(true).optional() });
  app.patch('/api/game/pets/:id', auth, async (req, reply) => {
    const id = param(req.params);
    const b = petPatch.safeParse(req.body);
    if (!id.success) return reply.code(404).send({ error: 'pet_not_found' });
    if (!b.success) return reply.code(400).send({ error: 'invalid' });
    return handleErrors(reply, () => game.updatePet(req.user!.id, id.data, b.data));
  });

  app.post('/api/game/quests/:id/claim', auth, async (req, reply) => {
    const id = z.string().max(40).safeParse((req.params as { id?: string }).id);
    if (!id.success) return reply.code(404).send({ error: 'quest_not_found' });
    return handleErrors(reply, () => game.claimQuest(req.user!.id, id.data));
  });

  app.post('/api/game/streak/repair', auth, async (req, reply) => handleErrors(reply, () => game.repairStreak(req.user!.id)));
}
