import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { SEED_IDS } from '@/db/seed';
import { countConfirmed } from '@/src/db/bookings';

let db: TestDb;

vi.mock('@/src/db/pool', () => ({
  getPool: () => db.pool,
}));

const { POST } = await import('@/app/api/dev/reset/route');

describe('POST /api/dev/reset', () => {
  beforeAll(async () => {
    db = await createTestSchema('devreset');
  });
  afterAll(async () => {
    await db.drop();
  });

  it('restores the demo state by calling the same seed() the tests use', async () => {
    await db.pool.query(`delete from bookings`);
    expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(0);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(3);
  });

  it('restores the exact same ids every time', async () => {
    await POST();
    const first = await db.pool.query<{ id: string }>(`select id from bookings order by id`);
    await POST();
    const second = await db.pool.query<{ id: string }>(`select id from bookings order by id`);

    expect(second.rows.map((r) => r.id)).toEqual(first.rows.map((r) => r.id));
  });

  it('404s in production (R4.5)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    try {
      const response = await POST();
      expect(response.status).toBe(404);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('does not touch the database at all in production', async () => {
    await POST();
    const before = await countConfirmed(db.pool, SEED_IDS.classes.fractions);
    await db.pool.query(`delete from bookings where trial_class_id = $1`, [
      SEED_IDS.classes.fractions,
    ]);

    vi.stubEnv('NODE_ENV', 'production');
    try {
      await POST();
    } finally {
      vi.unstubAllEnvs();
    }

    // Still empty: the guard returned before seed() could run.
    expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(0);
    expect(before).toBe(3);
  });
});
