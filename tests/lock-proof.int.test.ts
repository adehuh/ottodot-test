import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed } from '@/db/seed';
import { withTransaction } from '@/src/services/tx';
import { confirmBooking } from '@/src/services/booking';
import {
  insertPendingBooking,
  confirmBookingUnderLock,
  findBooking,
  countConfirmed,
} from '@/src/db/bookings';
import { SELECT_CLASS_FOR_UPDATE_SQL } from '@/src/db/classes';
import { resetGateway } from '@/src/payments/mock';

/**
 * Proof that the FOR UPDATE earns its place (R9.4).
 *
 * A test asserting the lock *works* is only half an argument: it would still
 * pass if the lock were unnecessary. This runs the same confirm path with the
 * lock removed and asserts overbooking DOES occur, which is what turns
 * "we take a row lock" into "here is the bug you get without it".
 *
 * The lock-free statement is derived from the production constant by
 * stripping FOR UPDATE, never hand-copied. A hand-copy drifts the moment the
 * real statement changes, and a drifted proof still passes while proving
 * nothing. src/db keeps no lock-disabling branch of its own.
 */
const SELECT_CLASS_WITHOUT_LOCK = SELECT_CLASS_FOR_UPDATE_SQL.replace(/\s+for\s+update/i, '');

/** Aligns the concurrent transactions so their UPDATEs are genuinely in flight together. */
const ALIGN_MS = 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The confirm transaction with one line removed. Everything else - the
 * guarded UPDATE, the capacity subquery, READ COMMITTED - is identical to
 * production.
 */
async function confirmWithoutLock(pool: Pool, bookingId: string): Promise<boolean> {
  return withTransaction(pool, async (client) => {
    const booking = await findBooking(client, bookingId);
    if (!booking) throw new Error('missing booking');

    const { rows } = await client.query<{ id: string; capacity: number }>(
      SELECT_CLASS_WITHOUT_LOCK,
      [booking.trial_class_id],
    );
    const capacity = rows[0]?.capacity ?? 0;

    // Without the lock nothing serialises these transactions, so they all
    // reach the guarded UPDATE together and each evaluates the seat count
    // against its own snapshot.
    await sleep(ALIGN_MS);

    return (await confirmBookingUnderLock(client, bookingId, capacity)) !== null;
  });
}

describe('the FOR UPDATE lock is load-bearing', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('lockproof');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
    resetGateway();
  });

  async function fourSeatClassWithContenders(count: number): Promise<{
    classId: string;
    bookingIds: string[];
  }> {
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into trial_classes (subject, title, teacher_name, starts_at, capacity)
       values ('MATH', 'Lock Proof Class', 'Ms Proof', now() + interval '9 days', 4)
       returning id`,
    );
    const classId = rows[0]?.id ?? '';

    const { rows: parent } = await db.pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Proof Parent', 'proof@example.com')
       returning id`,
    );

    const bookingIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const { rows: kid } = await db.pool.query<{ id: string }>(
        `insert into students (parent_id, name, grade_level)
         values ($1, $2, 'P4') returning id`,
        [parent[0]?.id, `Proof Child ${i}`],
      );
      const booking = await insertPendingBooking(db.pool, kid[0]?.id ?? '', classId);
      bookingIds.push(booking.id);
    }

    return { classId, bookingIds };
  }

  it('actually removes the lock from the statement it derives', () => {
    // If this ever fails, FOR UPDATE has been deleted from production and
    // every assertion below is comparing the statement against itself.
    expect(SELECT_CLASS_FOR_UPDATE_SQL.toLowerCase()).toContain('for update');
    expect(SELECT_CLASS_WITHOUT_LOCK.toLowerCase()).not.toContain('for update');
    expect(SELECT_CLASS_WITHOUT_LOCK).not.toBe(SELECT_CLASS_FOR_UPDATE_SQL);
  });

  it('OVERBOOKS a four-seat class without the lock', async () => {
    const { classId, bookingIds } = await fourSeatClassWithContenders(8);

    const results = await Promise.all(
      bookingIds.map((bookingId) => confirmWithoutLock(db.pool, bookingId)),
    );

    const confirmed = await countConfirmed(db.pool, classId);

    // This is the failure the lock exists to prevent: every transaction read
    // the same seat count, every one believed a seat was free, and every one
    // committed against a different booking row so nothing ever conflicted.
    expect(confirmed).toBeGreaterThan(4);
    expect(results.filter(Boolean).length).toBeGreaterThan(4);
  });

  it('does NOT overbook the same class with the lock in place', async () => {
    const { classId, bookingIds } = await fourSeatClassWithContenders(8);

    await Promise.all(
      bookingIds.map((bookingId) =>
        confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
      ),
    );

    expect(await countConfirmed(db.pool, classId)).toBe(4);
  });
});
