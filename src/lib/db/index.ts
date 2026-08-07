import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/import_v4';

// A single shared connection pool for the whole process. postgres.js uses a
// lazy pool, so opening a "connection" here does not consume sockets until a
// query is executed.
const sql = postgres(databaseUrl, {
  max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 60 * 30,
  onnotice: () => undefined,
});

export const db = drizzle(sql, { schema });
export { sql };
