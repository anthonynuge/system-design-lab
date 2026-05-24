import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { loadEnv } from '@sdl/shared/env';
import type { Database } from './schema.js';

let pool: Pool | undefined;
let kysely: Kysely<Database> | undefined;

export function getPool(): Pool {
  if (pool) return pool;
  const env = loadEnv();
  pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export function getDb(): Kysely<Database> {
  if (kysely) return kysely;
  kysely = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: getPool() }),
  });
  return kysely;
}

export async function closeDb(): Promise<void> {
  await kysely?.destroy();
  kysely = undefined;
  pool = undefined;
}
