import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';
import { createBooking } from '@/src/services/booking';
import { countConfirmed, markPaymentFailed, findBooking } from '@/src/db/bookings';

const UNKNOWN = '00000000-0000-4000-8000-0000000009ff';

describe('createBooking', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('create');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
  });

  it('creates a PENDING_PAYMENT booking for an available class (A1, A2)', async () => {
    const result = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('PENDING_PAYMENT');
      expect(result.value.confirmedAt).toBeNull();
      expect(result.value.studentId).toBe(SEED_IDS.students.arun);
    }
  });

  it('reserves nothing: a pending booking does not consume a seat (R2.9)', async () => {
    const before = await countConfirmed(db.pool, SEED_IDS.classes.fractions);

    await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });

    expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(before);
  });

  it('returns DUPLICATE for a second live booking, never a 500 (B1)', async () => {
    // Mei is already CONFIRMED in Volcanoes.
    const result = await createBooking(db.pool, {
      studentId: SEED_IDS.students.mei,
      trialClassId: SEED_IDS.classes.volcanoes,
    });

    expect(result).toEqual({ ok: false, code: 'DUPLICATE' });
  });

  it('returns DUPLICATE for a second PENDING_PAYMENT booking too', async () => {
    await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });

    const second = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });

    expect(second).toEqual({ ok: false, code: 'DUPLICATE' });
  });

  it('lets a parent retry after a decline, and keeps the failed row as audit', async () => {
    const first = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });
    if (!first.ok) throw new Error('expected the first booking to succeed');
    await markPaymentFailed(db.pool, first.value.id);

    const retry = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });

    expect(retry.ok).toBe(true);
    if (retry.ok) {
      // A fresh row, not a resurrected one.
      expect(retry.value.id).not.toBe(first.value.id);
    }

    const audit = await findBooking(db.pool, first.value.id);
    expect(audit?.status).toBe('PAYMENT_FAILED');
  });

  it('returns CLASS_FULL for a class already at capacity', async () => {
    const result = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.circuits,
    });

    expect(result).toEqual({ ok: false, code: 'CLASS_FULL' });
  });

  it('returns NOT_FOUND for an unknown student', async () => {
    const result = await createBooking(db.pool, {
      studentId: UNKNOWN,
      trialClassId: SEED_IDS.classes.fractions,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('returns NOT_FOUND for an unknown class', async () => {
    const result = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: UNKNOWN,
    });
    expect(result).toEqual({ ok: false, code: 'NOT_FOUND' });
  });

  it('allows the last seat to be booked when exactly one remains', async () => {
    // Fractions sits at 3 of 4 — the state the race test exploits.
    const result = await createBooking(db.pool, {
      studentId: SEED_IDS.students.arun,
      trialClassId: SEED_IDS.classes.fractions,
    });
    expect(result.ok).toBe(true);
  });
});
