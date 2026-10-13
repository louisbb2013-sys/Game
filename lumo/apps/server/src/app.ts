import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import type { Config } from './config.ts';
import { EmailCodes } from './auth/email.ts';
import { Sessions } from './auth/session.ts';
import type { Db } from './db/pool.ts';
import { authRoutes } from './routes/auth.ts';
import { meRoutes } from './routes/me.ts';
import { deckRoutes } from './routes/decks.ts';
import { quizRoutes } from './routes/quiz.ts';
import { ClaudeProvider } from './ai/claude.ts';
import { MockProvider, type AiProvider } from './ai/provider.ts';
import { QuizService } from './quiz/service.ts';
import { GameService } from './game/service.ts';
import { gameRoutes } from './routes/game.ts';
import { ChatService } from './chat/service.ts';
import { SandboxService } from './sandbox/service.ts';
import { chatRoutes } from './routes/chat.ts';
import { sandboxRoutes } from './routes/sandbox.ts';
import { getUser, type UserRow } from './users.ts';
import { SocialService } from './social/service.ts';
import { LiveService } from './live/service.ts';
import { socialRoutes } from './routes/social.ts';
import { StudyService } from './study/service.ts';
import { studyRoutes } from './routes/study.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow | null;
  }
}

export interface AppContext {
  config: Config;
  db: Db;
  sessions: Sessions;
  emailCodes: EmailCodes;
  ai: AiProvider;
  quiz: QuizService;
  game: GameService;
  chat: ChatService;
  sandbox: SandboxService;
  social: SocialService;
  live: LiveService;
  study: StudyService;
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export async function buildApp(config: Config, db: Db, opts: { logger?: boolean; ai?: AiProvider } = {}) {
  const app = Fastify({ logger: opts.logger ?? config.NODE_ENV !== 'test', trustProxy: true, bodyLimit: 1_000_000 });

  await app.register(cookie);
  await app.register(cors, { origin: config.APP_URL, credentials: true });
  // Limits run after the session is read, so they count per learner (a whole class shares one school IP).
  await app.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    max: config.RATE_LIMIT_PER_MIN,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
  });

  const sessions = new Sessions(config.SESSION_SECRET, config.NODE_ENV === 'production');
  const emailCodes = new EmailCodes(db, config.SESSION_SECRET, config.SMTP_URL, config.MAIL_FROM, (m) => app.log.info(m));

  app.decorateRequest('user', null);
  app.addHook('onRequest', async (req) => {
    const id = await sessions.userIdFrom(req);
    req.user = id ? await getUser(db, id) : null;
  });

  const ai: AiProvider =
    opts.ai ??
    (config.ANTHROPIC_API_KEY
      ? new ClaudeProvider(config.ANTHROPIC_API_KEY, config.AI_MODEL, config.AI_GRADING_MODEL, (m, e) => app.log.warn({ err: e }, m))
      : new MockProvider());
  app.log.info(`AI provider: ${ai.name}`);
  const game = new GameService(db);
  const quiz = new QuizService(db, ai, game, (m, e) => app.log.warn({ err: e }, m));
  const sandbox = new SandboxService(db, ai, quiz, game);
  const chat = new ChatService(db, ai, quiz, sandbox, game, (m, e) => app.log.warn({ err: e }, m));
  const social = new SocialService(db);
  const study = new StudyService(db, quiz, game, emailCodes, config.APP_URL, (m, e) => app.log.warn({ err: e }, m));
  const live = new LiveService(db, ai, quiz, game, (m, e) => app.log.warn({ err: e }, m));
  // Live games run over Socket.io on the same HTTP server, authenticated by the session cookie.
  live.attach(app.server, sessions, config.APP_URL);
  app.addHook('onClose', async () => live.close());

  const ctx: AppContext = {
    config,
    db,
    sessions,
    emailCodes,
    ai,
    quiz,
    game,
    chat,
    sandbox,
    social,
    live,
    study,
    requireUser: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    },
  };

  // Basic hardening for every response.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('x-frame-options', 'DENY');
    reply.header('permissions-policy', 'microphone=(self), camera=(self), geolocation=()');
  });

  app.get('/api/health', async () => ({ ok: true }));
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await deckRoutes(app, ctx);
  await quizRoutes(app, ctx);
  await chatRoutes(app, ctx);
  await sandboxRoutes(app, ctx);
  await gameRoutes(app, ctx);
  await socialRoutes(app, ctx);
  await studyRoutes(app, ctx);

  // Production: serve the built web app (one process, one origin). Hashed assets are cached forever;
  // index.html and the service worker are always revalidated so updates reach everyone.
  // Relative paths are from the project root (where package.json and .env live).
  const dist = config.WEB_DIST ? resolve(import.meta.dirname, '../../..', config.WEB_DIST) : '';
  if (dist && existsSync(resolve(dist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: dist,
      wildcard: false,
      cacheControl: false, // set below per file
      setHeaders: (res, path) => {
        const immutable = /[\\/]assets[\\/]/.test(path);
        res.setHeader('cache-control', immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' });
      reply.code(200).header('cache-control', 'no-cache');
      return reply.sendFile('index.html');
    });
  }

  return { app, ctx };
}
