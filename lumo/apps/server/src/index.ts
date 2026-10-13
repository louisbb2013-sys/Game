import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
await migrate(db, (m) => console.log(`[migrate] ${m}`));
const { app, ctx } = await buildApp(config, db);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

// Weekly leagues: settle finished weeks at start-up and every 10 minutes (idempotent).
const settle = () => ctx.game.settleLeagues().then((n) => n && app.log.info(`settled ${n} league group(s)`), (err) => app.log.error(err, 'league settlement failed'));
void settle();
const settleTimer = setInterval(settle, 10 * 60_000);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    clearInterval(settleTimer);
    await app.close();
    await db.end();
    process.exit(0);
  });
}
