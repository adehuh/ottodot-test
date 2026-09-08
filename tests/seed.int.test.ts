import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';

/**
 * The seed is the demo. Every edge case the brief names has to be reachable
 * from it without the reviewer setting anything up, and the same seed() runs
 * in the integration tests and behind POST /api/dev/reset (R2.3) so demo
 * state and test fixtures cannot drift.
 */
describe('seed', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('seed');
    await seed(db.pool);
  });
  afterAll(async () => {
    await db.drop();
  });

  const confirmedCount = async (classId: string): Promise<number> => {
    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from bookings
        where trial_class_id = $1 and status = 'CONFIRMED'`,
      [classId],
    );
    return Number(rows[0]?.count ?? -1);
  };

  it('leaves Science — Volcanoes with 1 of 4 confirmed, so seats are available', async () => {
    expect(await confirmedCount(SEED_IDS.classes.volcanoes)).toBe(1);
  });

  it('leaves Math — Fractions with exactly 3 of 4 confirmed, the last-seat race', async () => {
    expect(await confirmedCount(SEED_IDS.classes.fractions)).toBe(3);
  });

  it('leaves Science — Circuits full at 4 of 4, so booking is rejected', async () => {
    expect(await confirmedCount(SEED_IDS.classes.circuits)).toBe(4);
  });

  it('leaves Math — Geometry with 2 confirmed: the failed payment consumed no seat', async () => {
    expect(await confirmedCount(SEED_IDS.classes.geometry)).toBe(2);

    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from bookings
        where trial_class_id = $1 and status = 'PAYMENT_FAILED'`,
      [SEED_IDS.classes.geometry],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it('confirms one child in Volcanoes so a duplicate attempt can be demonstrated', async () => {
    const { rows } = await db.pool.query<{ status: string }>(
      `select status from bookings where student_id = $1 and trial_class_id = $2`,
      [SEED_IDS.students.mei, SEED_IDS.classes.volcanoes],
    );
    expect(rows[0]?.status).toBe('CONFIRMED');
  });

  it('records a payment attempt for every booking that reached the gateway', async () => {
    const { rows } = await db.pool.query<{ status: string; count: string }>(
      `select status, count(*)::text as count from payment_attempts group by status order by status`,
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.count)]));
    expect(byStatus.CAPTURED).toBe(10);
    expect(byStatus.FAILED).toBe(1);
  });

  it('is idempotent: running it twice yields identical counts and identical ids', async () => {
    const before = await db.pool.query<{ id: string }>(
      `select id from bookings order by id`,
    );
    const countsBefore = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from bookings`,
    );

    await seed(db.pool);

    const after = await db.pool.query<{ id: string }>(`select id from bookings order by id`);
    const countsAfter = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from bookings`,
    );

    expect(countsAfter.rows[0]?.count).toBe(countsBefore.rows[0]?.count);
    expect(after.rows.map((r) => r.id)).toEqual(before.rows.map((r) => r.id));
  });

  it('seeds two demo parents and three demo children', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from students where parent_id = any($1::uuid[])`,
      [[SEED_IDS.parents.tan, SEED_IDS.parents.nair]],
    );
    expect(rows[0]?.count).toBe('3');
  });

  it('gives every class a start time in the future so the demo never looks stale', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from trial_classes where starts_at <= now()`,
    );
    expect(rows[0]?.count).toBe('0');
  });
});
