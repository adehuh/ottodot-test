import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';
import { confirmBooking } from '@/src/services/booking';
import { insertPendingBooking, findBooking, countConfirmed } from '@/src/db/bookings';
import { listPaymentAttempts } from '@/src/db/payments';
import { getAuthorization, resetGateway } from '@/src/payments/mock';
import type { Result } from '@/src/domain/result';
import type { BookingView } from '@/src/domain/dto';

/**
 * The last-seat race — the thing the brief actually asks for.
 *
 * Genuine parallelism: Promise.all over independent pooled connections, each
 * running its own transaction (R9.3). Not a sequential loop. A sequential
 * simulation cannot exhibit write skew, so it would prove nothing about the
 * behaviour it claims to test.
 *
 * Every confirm here uses SLOW, which delays the authorize call. All the
 * authorizations therefore finish at roughly the same moment and the
 * transactions arrive together, which is the window the lock has to close.
 */
describe('the last-seat race', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('race');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
    resetGateway();
  });

  /** Distinct students: the duplicate index forbids one child racing itself. */
  async function makeContenders(classId: string, count: number): Promise<string[]> {
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Race Parent', 'race@example.com')
       returning id`,
    );
    const parentId = rows[0]?.id;

    const bookingIds: string[] = [];
    for (let i = 0; i < count; i++) {
      const { rows: kid } = await db.pool.query<{ id: string }>(
        `insert into students (parent_id, name, grade_level)
         values ($1, $2, 'P4') returning id`,
        [parentId, `Contender ${i}`],
      );
      const studentId = kid[0]?.id;
      if (!studentId) throw new Error('failed to create contender');
      const booking = await insertPendingBooking(db.pool, studentId, classId);
      bookingIds.push(booking.id);
    }
    return bookingIds;
  }

  const winners = (results: Result<BookingView>[]) => results.filter((r) => r.ok);
  const losers = (results: Result<BookingView>[]) =>
    results.filter((r): r is { ok: false; code: 'SEAT_TAKEN' } => !r.ok && r.code === 'SEAT_TAKEN');

  describe('eight parents, one empty four-seat class', () => {
    const CONTENDERS = 8;

    it('confirms exactly capacity, never one more', async () => {
      const { rows } = await db.pool.query<{ id: string }>(
        `insert into trial_classes (subject, title, teacher_name, starts_at, capacity)
         values ('MATH', 'Empty Four Seater', 'Ms Race', now() + interval '9 days', 4)
         returning id`,
      );
      const classId = rows[0]?.id ?? '';
      const bookingIds = await makeContenders(classId, CONTENDERS);

      const results = await Promise.all(
        bookingIds.map((bookingId) =>
          confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
        ),
      );

      expect(winners(results)).toHaveLength(4);
      expect(losers(results)).toHaveLength(4);
      expect(await countConfirmed(db.pool, classId)).toBe(4);
    });

    it('cancels every loser with reason SEAT_TAKEN', async () => {
      const { rows } = await db.pool.query<{ id: string }>(
        `insert into trial_classes (subject, title, teacher_name, starts_at, capacity)
         values ('MATH', 'Empty Four Seater', 'Ms Race', now() + interval '9 days', 4)
         returning id`,
      );
      const classId = rows[0]?.id ?? '';
      const bookingIds = await makeContenders(classId, CONTENDERS);

      await Promise.all(
        bookingIds.map((bookingId) =>
          confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
        ),
      );

      const bookings = await Promise.all(bookingIds.map((id) => findBooking(db.pool, id)));
      const confirmed = bookings.filter((b) => b?.status === 'CONFIRMED');
      const cancelled = bookings.filter((b) => b?.status === 'CANCELLED');

      expect(confirmed).toHaveLength(4);
      expect(cancelled).toHaveLength(4);
      expect(cancelled.every((b) => b?.cancellation_reason === 'SEAT_TAKEN')).toBe(true);
    });

    it('voids every loser authorization and captures nothing for them (B5)', async () => {
      const { rows } = await db.pool.query<{ id: string }>(
        `insert into trial_classes (subject, title, teacher_name, starts_at, capacity)
         values ('MATH', 'Empty Four Seater', 'Ms Race', now() + interval '9 days', 4)
         returning id`,
      );
      const classId = rows[0]?.id ?? '';
      const bookingIds = await makeContenders(classId, CONTENDERS);

      await Promise.all(
        bookingIds.map((bookingId) =>
          confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
        ),
      );

      let captured = 0;
      let voided = 0;

      for (const bookingId of bookingIds) {
        const booking = await findBooking(db.pool, bookingId);
        const attempts = await listPaymentAttempts(db.pool, bookingId);
        expect(attempts).toHaveLength(1);

        const attempt = attempts[0];
        const authStatus = getAuthorization(attempt?.provider_ref ?? '')?.status;

        if (booking?.status === 'CONFIRMED') {
          expect(attempt?.status).toBe('CAPTURED');
          expect(authStatus).toBe('CAPTURED');
          captured++;
        } else {
          // The heart of it: a child who did not get a seat was not charged.
          expect(attempt?.status).toBe('VOIDED');
          expect(authStatus).toBe('VOIDED');
          voided++;
        }
      }

      expect(captured).toBe(4);
      expect(voided).toBe(4);
    });
  });

  describe('the seeded last seat: Fractions at 3 of 4', () => {
    it('lets exactly one of six parents take the final seat', async () => {
      const classId = SEED_IDS.classes.fractions;
      const bookingIds = await makeContenders(classId, 6);

      const results = await Promise.all(
        bookingIds.map((bookingId) =>
          confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
        ),
      );

      expect(winners(results)).toHaveLength(1);
      expect(losers(results)).toHaveLength(5);
      expect(await countConfirmed(db.pool, classId)).toBe(4);
    });

    it('takes money from exactly one parent', async () => {
      const classId = SEED_IDS.classes.fractions;
      const bookingIds = await makeContenders(classId, 6);

      await Promise.all(
        bookingIds.map((bookingId) =>
          confirmBooking(db.pool, { bookingId, simulate: 'SLOW' }),
        ),
      );

      const statuses = await Promise.all(
        bookingIds.map(async (id) => (await listPaymentAttempts(db.pool, id))[0]?.status),
      );

      expect(statuses.filter((s) => s === 'CAPTURED')).toHaveLength(1);
      expect(statuses.filter((s) => s === 'VOIDED')).toHaveLength(5);
    });
  });

  it('holds at a capacity other than four, so nothing is hardcoded to 4', async () => {
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into trial_classes (subject, title, teacher_name, starts_at, capacity)
       values ('SCIENCE', 'Two Seater', 'Mr Small', now() + interval '9 days', 2)
       returning id`,
    );
    const classId = rows[0]?.id ?? '';
    const bookingIds = await makeContenders(classId, 7);

    const results = await Promise.all(
      bookingIds.map((bookingId) => confirmBooking(db.pool, { bookingId, simulate: 'SLOW' })),
    );

    expect(winners(results)).toHaveLength(2);
    expect(await countConfirmed(db.pool, classId)).toBe(2);
  });
});
