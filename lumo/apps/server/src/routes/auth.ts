import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { devLoginEnabled, googleEnabled } from '../config.ts';
import { exchangeGoogleCode, googleAuthUrl } from '../auth/google.ts';
import { findOrCreateByEmail, findOrCreateByGoogle, getUser, toProfile } from '../users.ts';
import type { AppContext } from '../app.ts';

const STATE_COOKIE = 'lumo_oauth_state';
const localeSchema = z.enum(['en', 'fr']).default('en');

export async function authRoutes(app: FastifyInstance, ctx: AppContext) {
  const { config, db, sessions, emailCodes } = ctx;
  const google = {
    clientId: config.GOOGLE_CLIENT_ID,
    clientSecret: config.GOOGLE_CLIENT_SECRET,
    redirectUri: `${config.API_URL}/api/auth/google/callback`,
  };

  app.get('/api/auth/providers', async () => ({ google: googleEnabled(config), email: true, dev: devLoginEnabled(config) }));

  app.get('/api/auth/google', async (req, reply) => {
    if (!googleEnabled(config)) return reply.code(404).send({ error: 'google_disabled' });
    const state = randomBytes(16).toString('hex');
    const { locale, tz } = req.query as { locale?: string; tz?: string };
    reply.setCookie(STATE_COOKIE, JSON.stringify({ state, locale, tz }), {
      path: '/api/auth',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.NODE_ENV === 'production',
      maxAge: 600,
    });
    return reply.redirect(googleAuthUrl(google, state, locale));
  });

  app.get('/api/auth/google/callback', async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    let saved: { state?: string; locale?: string; tz?: string } = {};
    try {
      saved = JSON.parse(req.cookies[STATE_COOKIE] ?? '{}');
    } catch {}
    reply.clearCookie(STATE_COOKIE, { path: '/api/auth' });
    if (!code || !state || state !== saved.state) return reply.redirect(`${config.APP_URL}/signin?error=state`);
    try {
      const id = await exchangeGoogleCode(google, code);
      const user = await findOrCreateByGoogle(db, id.sub, id.email, {
        locale: localeSchema.catch('en').parse(saved.locale),
        timezone: safeTimeZone(saved.tz),
      });
      await sessions.start(reply, user.id);
      return reply.redirect(config.APP_URL + '/');
    } catch (err) {
      req.log.error(err, 'google sign-in failed');
      return reply.redirect(`${config.APP_URL}/signin?error=google`);
    }
  });

  const emailStart = z.object({ email: z.string().trim().toLowerCase().email().max(254), locale: localeSchema });
  app.post('/api/auth/email/start', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = emailStart.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_email' });
    await emailCodes.start(body.data.email, body.data.locale);
    return { ok: true };
  });

  const emailVerify = z.object({
    email: z.string().trim().toLowerCase().email(),
    code: z.string().trim().regex(/^\d{6}$/),
    locale: localeSchema,
    timezone: z.string().optional(),
  });
  app.post('/api/auth/email/verify', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = emailVerify.safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'invalid_code' });
    if (!(await emailCodes.verify(body.data.email, body.data.code))) return reply.code(401).send({ error: 'wrong_code' });
    const user = await findOrCreateByEmail(db, body.data.email, { locale: body.data.locale, timezone: safeTimeZone(body.data.timezone) });
    await sessions.start(reply, user.id);
    return { user: toProfile(user) };
  });

  // Development only: one-click sign in as a named test learner.
  app.post('/api/auth/dev', async (req, reply) => {
    if (!devLoginEnabled(config)) return reply.code(404).send({ error: 'not_found' });
    const { name } = z.object({ name: z.string().regex(/^[a-z0-9]{1,20}$/).default('student') }).parse(req.body ?? {});
    const user = await findOrCreateByEmail(db, `${name}@dev.lumo.local`);
    await sessions.start(reply, user.id);
    return { user: toProfile((await getUser(db, user.id))!) };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    sessions.end(reply);
    return { ok: true };
  });
}

export function safeTimeZone(tz: string | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}
