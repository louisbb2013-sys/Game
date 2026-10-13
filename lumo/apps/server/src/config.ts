import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:5173'),
  DATABASE_URL: z.string().default('postgres://lumo:lumo@localhost:5432/lumo'),
  SESSION_SECRET: z.string().min(16).default('dev-only-secret-change-me'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('Lumo <hello@example.com>'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  ANTHROPIC_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  AI_GRADING_MODEL: z.string().default('claude-opus-5-5'),
  /** Built web app to serve (production). Empty = don't serve it (development uses Vite). */
  WEB_DIST: z.string().default(''),
  /** "Try without an account": each tap creates a fresh anonymous learner (no email, no name needed). */
  GUEST_LOGIN: z.enum(['true', 'false']).default('false'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // On Render the public address is provided automatically.
  const appUrl = env.APP_URL || env.RENDER_EXTERNAL_URL;
  const cfg = schema.parse({ ...env, APP_URL: appUrl, API_URL: env.API_URL || appUrl });
  if (cfg.NODE_ENV === 'production' && cfg.SESSION_SECRET === 'dev-only-secret-change-me') {
    throw new Error('SESSION_SECRET must be set in production');
  }
  return cfg;
}

export const googleEnabled = (c: Config) => Boolean(c.GOOGLE_CLIENT_ID && c.GOOGLE_CLIENT_SECRET);
export const devLoginEnabled = (c: Config) => c.NODE_ENV !== 'production';
export const guestLoginEnabled = (c: Config) => c.GUEST_LOGIN === 'true' || c.NODE_ENV !== 'production';
/** Email codes need a mail server in production (without one, nobody would receive the code). */
export const emailLoginEnabled = (c: Config) => Boolean(c.SMTP_URL) || c.NODE_ENV !== 'production';
