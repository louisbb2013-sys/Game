import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { migrate } from './db/migrate.ts';
import { createPool } from './db/pool.ts';

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
await migrate(db, (m) => console.log(`[migrate] ${m}`));
const { app } = await buildApp(config, db);
await app.listen({ port: config.PORT, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close();
    await db.end();
    process.exit(0);
  });
}
