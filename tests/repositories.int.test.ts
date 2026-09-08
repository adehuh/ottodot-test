import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';
import {
  listTrialClassesWithCounts,
  findTrialClass,
  SELECT_CLASS_FOR_UPDATE_SQL,
} from '@/src/db/classes';
import { listStudentsByParent, findStudent } from '@/src/db/students';
import {
  insertPendingBooking,
  findBooking,
  countConfirmed,
  cancelBooking,
  markPaymentFailed,
  listRoster,
  listBookingsForClasses,
  CONFIRM_BOOKING_SQL,
} from '@/src/db/bookings';
import { insertPaymentAttempt, listPaymentAttempts } from '@/src/db/payments';

describe('repositories', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('repos');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
  });

  describe('classes', () => {
    it('derives the confirmed count per class rather than reading a counter', async () => {
      const classes = await listTrialClassesWithCounts(db.pool);
      const byId = new Map(classes.map((c) => [c.row.id, c.confirmedCount]));

      expect(byId.get(SEED_IDS.classes.volcanoes)).toBe(1);
      expect(byId.get(SEED_IDS.classes.fractions)).toBe(3);
      expect(byId.get(SEED_IDS.classes.circuits)).toBe(4);
      expect(byId.get(SEED_IDS.classes.geometry)).toBe(2);
    });

    it('counts only CONFIRMED, so a failed payment never consumes a seat', async () => {
      const classes = await listTrialClassesWithCounts(db.pool);
      const geometry = classes.find((c) => c.row.id === SEED_IDS.classes.geometry);
      // Geometry holds 2 CONFIRMED and 1 PAYMENT_FAILED.
      expect(geometry?.confirmedCount).toBe(2);
    });

    it('orders classes by start time so the list is stable between runs', async () => {
      const classes = await listTrialClassesWithCounts(db.pool);
      const times = classes.map((c) => c.row.starts_at.getTime());
      expect([...times].sort((a, b) => a - b)).toEqual(times);
    });

    it('returns null for a class that does not exist', async () => {
      expect(await findTrialClass(db.pool, '00000000-0000-4000-8000-0000000009ff')).toBeNull();
    });

    it('keeps FOR UPDATE in the class lock statement', async () => {
      // The lock is load-bearing (R3.1). If this constant ever loses its
      // FOR UPDATE, the lock-disabled proof test also stops proving anything.
      expect(SELECT_CLASS_FOR_UPDATE_SQL.toLowerCase()).toContain('for update');
    });
  });

  describe('students', () => {
    it('lists a parent children', async () => {
      const students = await listStudentsByParent(db.pool, SEED_IDS.parents.tan);
      expect(students.map((s) => s.name).sort()).toEqual(['Arun Tan', 'Mei Tan']);
    });

    it('returns an empty list for a parent with no children', async () => {
      expect(
        await listStudentsByParent(db.pool, '00000000-0000-4000-8000-0000000009ff'),
      ).toEqual([]);
    });

    it('returns null for a student that does not exist', async () => {
      expect(await findStudent(db.pool, '00000000-0000-4000-8000-0000000009ff')).toBeNull();
    });
  });

  describe('bookings', () => {
    it('creates a PENDING_PAYMENT booking that consumes no seat', async () => {
      const before = await countConfirmed(db.pool, SEED_IDS.classes.fractions);

      const booking = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      expect(booking.status).toBe('PENDING_PAYMENT');
      expect(booking.confirmed_at).toBeNull();
      expect(await countConfirmed(db.pool, SEED_IDS.classes.fractions)).toBe(before);
    });

    it('surfaces the duplicate index violation as a raw 23505 for errors.ts to map', async () => {
      await expect(
        insertPendingBooking(db.pool, SEED_IDS.students.mei, SEED_IDS.classes.volcanoes),
      ).rejects.toMatchObject({ code: '23505' });
    });

    it('finds a booking by id and returns null for an unknown one', async () => {
      const created = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );
      expect((await findBooking(db.pool, created.id))?.id).toBe(created.id);
      expect(await findBooking(db.pool, '00000000-0000-4000-8000-0000000009ff')).toBeNull();
    });

    it('cancels with a reason, which is how SEAT_TAKEN is recorded (R3.4)', async () => {
      const created = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      const cancelled = await cancelBooking(db.pool, created.id, 'SEAT_TAKEN');

      expect(cancelled?.status).toBe('CANCELLED');
      expect(cancelled?.cancellation_reason).toBe('SEAT_TAKEN');
    });

    it('marks a payment failure, leaving the row outside the duplicate index', async () => {
      const created = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      const failed = await markPaymentFailed(db.pool, created.id);
      expect(failed?.status).toBe('PAYMENT_FAILED');

      // Retry is possible precisely because PAYMENT_FAILED falls out of the index.
      await expect(
        insertPendingBooking(db.pool, SEED_IDS.students.arun, SEED_IDS.classes.fractions),
      ).resolves.toBeDefined();
    });

    it('lists the roster as CONFIRMED bookings only', async () => {
      const roster = await listRoster(db.pool, SEED_IDS.classes.geometry);

      expect(roster).toHaveLength(2);
      expect(roster.every((entry) => entry.booking.status === 'CONFIRMED')).toBe(true);
      // Sara's PAYMENT_FAILED booking must not appear.
      expect(roster.some((entry) => entry.student.id === SEED_IDS.students.sara)).toBe(false);
    });

    it('returns roster entries with the student attached, for the teacher view', async () => {
      const roster = await listRoster(db.pool, SEED_IDS.classes.volcanoes);
      expect(roster[0]?.student.name).toBe('Mei Tan');
      expect(roster[0]?.student.grade_level).toBe('P3');
    });

    it('returns real Date objects on roster rows, not JSON strings', async () => {
      // to_jsonb() would hand back ISO strings that satisfy the TypeScript
      // row type while breaking toBookingView(), which calls .toISOString()
      // on them. The type would lie and the failure would only appear at
      // runtime, in the DTO layer, far from the query that caused it.
      const roster = await listRoster(db.pool, SEED_IDS.classes.volcanoes);
      expect(roster[0]?.booking.confirmed_at).toBeInstanceOf(Date);
      expect(roster[0]?.booking.created_at).toBeInstanceOf(Date);
      expect(roster[0]?.student.created_at).toBeInstanceOf(Date);
    });

    it('keeps the count subquery inside the guarded update statement', async () => {
      // R1: the count must be inside the same guarded statement, never a
      // separate SELECT followed by a conditional UPDATE.
      const sql = CONFIRM_BOOKING_SQL.toLowerCase();
      expect(sql).toContain('update bookings');
      expect(sql).toContain('count(*)');
      expect(sql).toContain("status = 'pending_payment'");
    });
  });

  describe('listBookingsForClasses — the admin audit view', () => {
    /**
     * Builds Geometry into a class holding one booking of every stored status,
     * so the CASE ordering and both correlated subqueries are exercised at
     * once. The seed already supplies 2 CONFIRMED and 1 PAYMENT_FAILED.
     */
    async function geometryWithEveryStatus(): Promise<string> {
      const pending = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.geometry,
      );
      await insertPaymentAttempt(db.pool, {
        bookingId: pending.id,
        amountCents: 4500,
        currency: 'SGD',
        status: 'AUTHORIZED',
        providerRef: 'auth_pending',
      });

      const loser = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.mei,
        SEED_IDS.classes.geometry,
      );
      await cancelBooking(db.pool, loser.id, 'SEAT_TAKEN');
      return SEED_IDS.classes.geometry;
    }

    it('orders CONFIRMED, then PENDING_PAYMENT, then PAYMENT_FAILED, then CANCELLED', async () => {
      const classId = await geometryWithEveryStatus();

      const grouped = await listBookingsForClasses(db.pool, [classId]);
      const rows = grouped.get(classId) ?? [];

      // The hand-rolled CASE is the only thing producing this order; created_at
      // alone would interleave them, because the cancelled row is the newest.
      expect(rows.map((r) => r.booking.status)).toEqual([
        'CONFIRMED',
        'CONFIRMED',
        'PENDING_PAYMENT',
        'PAYMENT_FAILED',
        'CANCELLED',
      ]);
    });

    it('lists PAYMENT_FAILED rows without letting them count toward confirmed seats', async () => {
      const classId = await geometryWithEveryStatus();

      const rows = (await listBookingsForClasses(db.pool, [classId])).get(classId) ?? [];
      const confirmed = rows.filter((r) => r.booking.status === 'CONFIRMED');

      // Present in the audit view...
      expect(rows.some((r) => r.booking.status === 'PAYMENT_FAILED')).toBe(true);
      // ...and absent from the count the confirm transaction guards.
      expect(confirmed).toHaveLength(2);
      expect(await countConfirmed(db.pool, classId)).toBe(2);
    });

    it('reports the latest payment attempt and how many there have been', async () => {
      await geometryWithEveryStatus();
      const booking = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.sara,
        SEED_IDS.classes.volcanoes,
      );

      // Two declines on one booking: the subquery must surface the newest,
      // and the count is what turns "declined" into "declined x2".
      await insertPaymentAttempt(db.pool, {
        bookingId: booking.id,
        amountCents: 4500,
        currency: 'SGD',
        status: 'FAILED',
        providerRef: null,
      });
      await insertPaymentAttempt(db.pool, {
        bookingId: booking.id,
        amountCents: 4500,
        currency: 'SGD',
        status: 'AUTHORIZED',
        providerRef: 'auth_latest',
      });

      const rows =
        (await listBookingsForClasses(db.pool, [SEED_IDS.classes.volcanoes])).get(
          SEED_IDS.classes.volcanoes,
        ) ?? [];
      const row = rows.find((r) => r.booking.id === booking.id);

      expect(row?.paymentStatus).toBe('AUTHORIZED');
      expect(row?.paymentAttempts).toBe(2);
    });

    it('reports no payment attempt for a booking that never reached the gateway', async () => {
      const booking = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.volcanoes,
      );

      const rows =
        (await listBookingsForClasses(db.pool, [SEED_IDS.classes.volcanoes])).get(
          SEED_IDS.classes.volcanoes,
        ) ?? [];
      const row = rows.find((r) => r.booking.id === booking.id);

      expect(row?.paymentStatus).toBeNull();
      expect(row?.paymentAttempts).toBe(0);
    });

    it('groups by class and returns an empty map for no ids', async () => {
      const grouped = await listBookingsForClasses(db.pool, [
        SEED_IDS.classes.volcanoes,
        SEED_IDS.classes.circuits,
      ]);

      expect(grouped.get(SEED_IDS.classes.volcanoes)).toHaveLength(1);
      expect(grouped.get(SEED_IDS.classes.circuits)).toHaveLength(4);
      expect((await listBookingsForClasses(db.pool, [])).size).toBe(0);
    });

    it('returns real Date objects, not JSON strings', async () => {
      const rows =
        (await listBookingsForClasses(db.pool, [SEED_IDS.classes.volcanoes])).get(
          SEED_IDS.classes.volcanoes,
        ) ?? [];
      expect(rows[0]?.booking.created_at).toBeInstanceOf(Date);
      expect(rows[0]?.student.created_at).toBeInstanceOf(Date);
    });
  });

  describe('payment attempts', () => {
    it('records an attempt regardless of outcome (A3)', async () => {
      const booking = await insertPendingBooking(
        db.pool,
        SEED_IDS.students.arun,
        SEED_IDS.classes.fractions,
      );

      await insertPaymentAttempt(db.pool, {
        bookingId: booking.id,
        amountCents: 4500,
        currency: 'SGD',
        status: 'AUTHORIZED',
        providerRef: 'auth_123',
      });

      const attempts = await listPaymentAttempts(db.pool, booking.id);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('AUTHORIZED');
      expect(attempts[0]?.amount_cents).toBe(4500);
      expect(attempts[0]?.currency).toBe('SGD');
    });

    it('stores money as integer cents, never a float', async () => {
      const attempts = await listPaymentAttempts(
        db.pool,
        '00000000-0000-4000-8000-000000000399',
      );
      expect(attempts[0]?.amount_cents).toBe(4500);
      expect(Number.isInteger(attempts[0]?.amount_cents)).toBe(true);
    });
  });
});
