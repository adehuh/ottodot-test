import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';
import { confirmBooking } from '@/src/services/booking';
import {
  insertPendingBooking,
  findBooking,
  countConfirmed,
  listRoster,
  cancelBooking,
  markPaymentFailed,
} from '@/src/db/bookings';
import { listPaymentAttempts } from '@/src/db/payments';
import { getAuthorization, resetGateway } from '@/src/payments/mock';

const UNKNOWN = '00000000-0000-4000-8000-0000000009ff';

describe('confirmBooking', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('confirm');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
    resetGateway();
  });

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * The invariant, asserted directly rather than branch by branch: after ANY
   * confirmBooking outcome, no authorization for that booking is still live.
   * Every attempt row has settled to CAPTURED, VOIDED or FAILED, and the
   * gateway agrees with the row.
   *
   * One assertion covers all four in-transaction outcomes and any branch added
   * later. A per-branch test only proves the branches someone remembered to
   * write a test for.
   */
  async function expectNoLiveAuthorization(bookingId: string): Promise<void> {
    const attempts = await listPaymentAttempts(db.pool, bookingId);

    for (const attempt of attempts) {
      expect(attempt.status).not.toBe('AUTHORIZED');

      if (attempt.status === 'FAILED') {
        // A decline creates no authorization, so there is nothing to release.
        expect(attempt.provider_ref).toBeNull();
        continue;
      }

      // The ledger and the gateway must tell the same story. A row marked
      // VOIDED while the gateway still holds the money is the failure this
      // helper exists to catch.
      expect(getAuthorization(attempt.provider_ref ?? '')?.status).toBe(attempt.status);
    }
  }

  describe('the happy path', () => {
    it('confirms the last seat and captures the payment', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      const result = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'SUCCESS',
      });

      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.status).toBe('CONFIRMED');
      expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(4);
    });

    it('captures only after the seat is secured, and records the attempt (A3)', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const attempts = await listPaymentAttempts(db.pool, pending.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('CAPTURED');
      expect(attempts[0]?.provider_ref).toBeTruthy();
      await expectNoLiveAuthorization(pending.id);
    });

    it('puts the child on the roster', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const roster = await listRoster(db.pool, SEED_IDS.classes.fractions);
      expect(roster.some((entry) => entry.student.id === SEED_IDS.students.arun)).toBe(true);
    });
  });

  describe('B2 — a fifth confirmed booking on a four-seat class is impossible', () => {
    it('refuses to confirm into a full class even when the advisory check is bypassed', async () => {
      // Circuits is 4 of 4. insertPendingBooking goes straight to the
      // repository, so createBooking's advisory CLASS_FULL check is not in
      // the path. What stops this is the guarded UPDATE, nothing else.
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.circuits,
      );

      const result = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'SUCCESS',
      });

      expect(result).toEqual({ ok: false, code: 'SEAT_TAKEN' });
      expect(await countConfirmed(db.pool, SEED_IDS.classes.circuits)).toBe(4);
    });

    it('cancels the loser with reason SEAT_TAKEN rather than inventing a status (R3.4)', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.circuits,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const after = await findBooking(db.pool, pending.id);
      expect(after?.status).toBe('CANCELLED');
      expect(after?.cancellation_reason).toBe('SEAT_TAKEN');
    });

    it('voids the authorization and captures nothing when the seat is gone (B5)', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.circuits,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const attempts = await listPaymentAttempts(db.pool, pending.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('VOIDED');

      const authId = attempts[0]?.provider_ref;
      expect(authId).toBeTruthy();
      expect(getAuthorization(authId ?? '')?.status).toBe('VOIDED');
      await expectNoLiveAuthorization(pending.id);
    });
  });

  describe('B3 — a declined authorization rosters nobody', () => {
    it('returns PAYMENT_FAILED and never confirms the booking', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      const result = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'DECLINE',
      });

      expect(result).toEqual({ ok: false, code: 'PAYMENT_FAILED' });
      expect((await findBooking(db.pool, pending.id))?.status).toBe('PAYMENT_FAILED');
    });

    it('leaves the roster and the seat count completely unchanged', async () => {
      const rosterBefore = await listRoster(db.pool, SEED_IDS.classes.fractions);
      const countBefore = await countConfirmed(db.pool, SEED_IDS.classes.fractions);

      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'DECLINE' });

      const rosterAfter = await listRoster(db.pool, SEED_IDS.classes.fractions);
      expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(countBefore);
      expect(rosterAfter.map((e) => e.student.id)).toEqual(rosterBefore.map((e) => e.student.id));
    });

    it('records the failed attempt but takes no money', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'DECLINE' });

      const attempts = await listPaymentAttempts(db.pool, pending.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('FAILED');
      await expectNoLiveAuthorization(pending.id);
    });

    it('lets the parent retry after the decline', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'DECLINE' });

      const retry = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      const result = await confirmBooking(db.pool, { bookingId: retry.id, simulate: 'SUCCESS' });

      expect(result.ok).toBe(true);
    });
  });

  describe('B6 — the R3.2 re-read branch', () => {
    it('returns ALREADY_CONFIRMED for a retry of a confirmed booking', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const retry = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'SUCCESS',
      });

      expect(retry).toEqual({ ok: false, code: 'ALREADY_CONFIRMED' });
    });

    it('voids nothing on that retry — the parent already paid', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      const attemptsBefore = await listPaymentAttempts(db.pool, pending.id);
      const authId = attemptsBefore[0]?.provider_ref ?? '';

      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      // The captured authorization is untouched, and no second attempt was
      // created. Collapsing the three re-read branches into one is exactly
      // what would void a paying parent's authorization here.
      expect(getAuthorization(authId)?.status).toBe('CAPTURED');
      const attemptsAfter = await listPaymentAttempts(db.pool, pending.id);
      expect(attemptsAfter).toHaveLength(1);
      expect(attemptsAfter[0]?.status).toBe('CAPTURED');
    });

    it('keeps the booking CONFIRMED and the seat count unchanged on that retry', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });
      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      expect((await findBooking(db.pool, pending.id))?.status).toBe('CONFIRMED');
      expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(4);
    });

    it('returns BOOKING_NOT_ACTIVE for a cancelled booking', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await cancelBooking(db.pool, pending.id, 'SEAT_TAKEN');

      const result = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'SUCCESS',
      });
      expect(result).toEqual({ ok: false, code: 'BOOKING_NOT_ACTIVE' });
    });

    it('returns BOOKING_NOT_ACTIVE for a booking whose payment already failed', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await markPaymentFailed(db.pool, pending.id);

      const result = await confirmBooking(db.pool, {
        bookingId: pending.id,
        simulate: 'SUCCESS',
      });
      expect(result).toEqual({ ok: false, code: 'BOOKING_NOT_ACTIVE' });
    });

    it('voids its own authorization when it loses a concurrent confirm of the same booking', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      /*
       * The sequential retry cannot reach the in-transaction re-read: the
       * advisory pre-check sees CONFIRMED and returns before opening a
       * transaction. Only two genuinely concurrent confirms of the SAME
       * booking get both callers past the pre-check, so both authorize and
       * only one can win.
       */
      const [first, second] = await Promise.all([
        confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SLOW' }),
        confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SLOW' }),
      ]);

      const outcomes = [first, second];
      expect(outcomes.filter((r) => r.ok)).toHaveLength(1);
      expect(outcomes.filter((r) => !r.ok && r.code === 'ALREADY_CONFIRMED')).toHaveLength(1);

      // Two authorizations were taken and only one seat was won. The loser's
      // hold is this call's own authorization - not the winner's - so leaving
      // it live strands money on a card for nothing.
      const attempts = await listPaymentAttempts(db.pool, pending.id);
      expect(attempts).toHaveLength(2);
      expect(attempts.filter((a) => a.status === 'CAPTURED')).toHaveLength(1);
      expect(attempts.filter((a) => a.status === 'VOIDED')).toHaveLength(1);
      expect(attempts.filter((a) => a.status === 'AUTHORIZED')).toHaveLength(0);

      await expectNoLiveAuthorization(pending.id);
    });

    it('voids when the booking is cancelled between the pre-check and the transaction', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      /*
       * The pre-check reads PENDING_PAYMENT and lets the call through to
       * authorize(). SLOW holds that call for ~50ms, and the booking is
       * cancelled inside that window, so the in-transaction re-read sees
       * CANCELLED. This is the only way to reach BOOKING_NOT_ACTIVE with an
       * authorization already in hand.
       */
      const [result] = await Promise.all([
        confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SLOW' }),
        (async () => {
          await sleep(10);
          await cancelBooking(db.pool, pending.id, 'ABANDONED');
        })(),
      ]);

      expect(result).toEqual({ ok: false, code: 'BOOKING_NOT_ACTIVE' });

      const attempts = await listPaymentAttempts(db.pool, pending.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('VOIDED');
      await expectNoLiveAuthorization(pending.id);
    });

    it('takes no authorization at all for a booking that is not pending', async () => {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      await cancelBooking(db.pool, pending.id, 'SEAT_TAKEN');

      await confirmBooking(db.pool, { bookingId: pending.id, simulate: 'SUCCESS' });

      // Nothing was authorized, so nothing is left dangling for a stale client.
      expect(await listPaymentAttempts(db.pool, pending.id)).toHaveLength(0);
    });
  });

  it('returns NOT_FOUND for a booking that does not exist', async () => {
    const result = await confirmBooking(db.pool, { bookingId: UNKNOWN, simulate: 'SUCCESS' });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });
});
