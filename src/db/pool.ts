import { Pool } from 'pg';

/**
 * One pg.Pool per process, cached on globalThis so Next's hot reload does not
 * leak a new pool on every edit (R5.3).
 *
 * `max` stays small on purpose. Vercel scales horizontally: every isolate gets
 * its own pool, and a generous per-isolate max exhausts Supabase's connection
 * limit under exactly the concurrency this design targets.
 *
 * supabase-js is not used for this path (R5.5) - it speaks PostgREST and
 * cannot issue a row-locking transaction at all.
 */

// Widened rather than declared global: `declare global` would need `var`,
// and that needs an eslint suppression. A suppression to reach green is
// exactly what R8.5 forbids, so the cast is the honest way to do this.
const globalForPool = globalThis as { __ottodotPool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__ottodotPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    globalForPool.__ottodotPool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }

  return globalForPool.__ottodotPool;
}
