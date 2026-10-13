import { loadConfig } from '../src/config.ts';
import { buildApp } from '../src/app.ts';
import { migrate } from '../src/db/migrate.ts';
import { createPool } from '../src/db/pool.ts';

export const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgres://lumo:lumo@localhost:5432/lumo_test';

export async function setupTestApp() {
  const db = createPool(TEST_DB);
  await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(db);
  const config = loadConfig({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, SESSION_SECRET: 'test-secret-test-secret' });
  const { app, ctx } = await buildApp(config, db, { logger: false });
  await app.ready();
  return { app, ctx, db, close: async () => { await app.close(); await db.end(); } };
}

export function cookieFrom(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.filter(Boolean).map((c) => String(c).split(';')[0]).join('; ');
}
