import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

/**
 * Each integration test file gets its own throwaway schema, built from the
 * *real* migration files (R9.2). Not a hand-maintained copy: a second copy of
 * the schema would drift, and a test running against drifted DDL proves
 * nothing about production.
 *
 * This works only because migrations never hardcode a schema qualifier
 * (R2.1b) - `create table bookings`, never `public.bookings` - so the same
 * SQL relocates into any schema via search_path.
 */
export interface TestDb {
  pool: Pool;
  schema: string;
  drop(): Promise<void>;
}

export function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    .join('\n');
}

function connectionString(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set');
  return url;
}

/**
 * `label` only makes failures readable; a random suffix keeps files isolated
 * even when the same label is reused.
 */
export async function createTestSchema(label: string): Promise<TestDb> {
  const schema = `test_${label.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const admin = new Pool({ connectionString: connectionString(), max: 1 });
  try {
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.query(`create schema ${schema}`);
  } finally {
    await admin.end();
  }

  // Every connection in this pool resolves unqualified names inside the
  // throwaway schema. Enum types are per-schema and follow the same rule.
  const pool = new Pool({
    connectionString: connectionString(),
    max: 12,
    options: `-c search_path=${schema}`,
  });

  await pool.query(migrationSql());

  return {
    pool,
    schema,
    async drop() {
      await pool.end();
      const cleanup = new Pool({ connectionString: connectionString(), max: 1 });
      try {
        await cleanup.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
