import { config } from 'dotenv';
import { Pool } from 'pg';

import { seed } from './seed.ts';

/**
 * Seeds the local database from the command line, through the same seed()
 * the tests and POST /api/dev/reset call (R2.3).
 *
 * Uses the DIRECT connection, never the pooler (R5.1).
 */
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DIRECT_DATABASE_URL is not set. Copy .env.example to .env.local.');
  process.exit(1);
}

const pool = new Pool({ connectionString, max: 1 });
try {
  await seed(pool);
  console.log('Seeded: 4 classes (1/4, 3/4, 4/4, 2/4 + 1 declined), 3 parents, 7 students.');
} finally {
  await pool.end();
}
