import { validateUsername } from '@lumo/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppContext } from '../app.ts';
import { safeTimeZone } from './auth.ts';
import { getUser, toProfile } from '../users.ts';

export const settingsSchema = z
  .object({
    theme: z.enum(['system', 'light', 'dark']),
    dyslexiaFont: z.boolean(),
    largeText: z.boolean(),
    sound: z.boolean(),
    reduceMotion: z.boolean(),
    uploadConsent: z.boolean(),
    reminder: z.object({ enabled: z.boolean(), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), days: z.array(z.number().int().min(0).max(6)).max(7) }).strict(),
    audioRate: z.number().min(0.5).max(1.5),
  })
  .partial()
  .strict();

const patchSchema = z
  .object({
    username: z.string().trim(),
    locale: z.enum(['en', 'fr']),
    timezone: z.string(),
    avatar: z.string().regex(/^[a-z0-9-]{1,40}$/),
    settings: settingsSchema,
  })
  .partial()
  .strict();

export async function meRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get('/api/me', { preHandler: ctx.requireUser }, async (req) => {
    return { user: toProfile(req.user!) };
  });

  app.patch('/api/me', { preHandler: ctx.requireUser }, async (req, reply) => {
    const body = patchSchema.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid', issues: body.error.issues });
    const p = body.data;
    if (p.username !== undefined) {
      const problem = validateUsername(p.username);
      if (problem) return reply.code(400).send({ error: 'username_' + problem });
    }
    try {
      await db.query(
        `UPDATE users SET
           username = COALESCE($2, username),
           locale   = COALESCE($3, locale),
           timezone = COALESCE($4, timezone),
           avatar   = COALESCE($5, avatar),
           settings = settings || COALESCE($6::jsonb, '{}'::jsonb)
         WHERE id = $1`,
        [req.user!.id, p.username ?? null, p.locale ?? null, p.timezone ? safeTimeZone(p.timezone) : null, p.avatar ?? null, p.settings ? JSON.stringify(p.settings) : null],
      );
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return reply.code(409).send({ error: 'username_taken' });
      throw err;
    }
    return { user: toProfile((await getUser(db, req.user!.id))!) };
  });

  /** Privacy: delete my account and everything attached to it (FKs cascade). */
  app.delete('/api/me', { preHandler: ctx.requireUser }, async (req, reply) => {
    await db.query('DELETE FROM users WHERE id = $1', [req.user!.id]);
    if (req.user!.email) await db.query('DELETE FROM email_codes WHERE email = $1', [req.user!.email]);
    ctx.sessions.end(reply);
    return { ok: true };
  });
}
