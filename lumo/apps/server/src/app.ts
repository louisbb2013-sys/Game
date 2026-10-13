import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
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
import { getUser, type UserRow } from './users.ts';

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
  requireUser: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
}

export async function buildApp(config: Config, db: Db, opts: { logger?: boolean; ai?: AiProvider } = {}) {
  const app = Fastify({ logger: opts.logger ?? config.NODE_ENV !== 'test', trustProxy: true, bodyLimit: 1_000_000 });

  await app.register(cookie);
  await app.register(cors, { origin: config.APP_URL, credentials: true });
  await app.register(rateLimit, { global: true, max: config.RATE_LIMIT_PER_MIN, timeWindow: '1 minute' });

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
  const quiz = new QuizService(db, ai, (m, e) => app.log.warn({ err: e }, m));

  const ctx: AppContext = {
    config,
    db,
    sessions,
    emailCodes,
    ai,
    quiz,
    requireUser: async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    },
  };

  app.get('/api/health', async () => ({ ok: true }));
  await authRoutes(app, ctx);
  await meRoutes(app, ctx);
  await deckRoutes(app, ctx);
  await quizRoutes(app, ctx);

  return { app, ctx };
}
