import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, sql } from './index';

async function main() {
  console.log('[migrate] running drizzle migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  await sql.end();
  console.log('[migrate] done');
}

main().catch((err) => {
  console.error('[migrate] failed', err);
  process.exit(1);
});
