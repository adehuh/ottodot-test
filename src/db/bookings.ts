import type { BookingRow, StudentRow } from '@/src/domain/types';
import type { Queryable } from './queryable';

/**
 * The guarded confirm statement — the single most important SQL in the
 * codebase (R3.1).
 *
 * The seat count is a subquery *inside* the UPDATE's WHERE clause, not a
 * separate SELECT followed by a conditional UPDATE. A separate read leaves a
 * window between deciding and writing; here the decision and the write are
 * one statement, evaluated once, under the class row lock taken immediately
 * before it.
 *
 * Zero rows updated does NOT mean the seat was taken. It means one of three
 * things, and the caller must re-read the booking to find out which (R3.2).
 */
export const CONFIRM_BOOKING_SQL = `
  update bookings b
     set status = 'CONFIRMED',
         confirmed_at = now(),
         updated_at = now()
   where b.id = $1
     and b.status = 'PENDING_PAYMENT'
     and (select count(*)
            from bookings c
           where c.trial_class_id = b.trial_class_id
             and c.status = 'CONFIRMED') < $2
  returning b.*
`;

export async function insertPendingBooking(
  db: Queryable,
  studentId: string,
  trialClassId: string,
): Promise<BookingRow> {
  const { rows } = await db.query<BookingRow>(
    `insert into bookings (student_id, trial_class_id, status)
     values ($1, $2, 'PENDING_PAYMENT')
     returning *`,
    [studentId, trialClassId],
  );

  const row = rows[0];
  if (!row) throw new Error('insertPendingBooking returned no row');
  return row;
}

export async function findBooking(db: Queryable, id: string): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(`select * from bookings where id = $1`, [id]);
  return rows[0] ?? null;
}

/**
 * Attempts to take a seat. Returns the confirmed row, or null when the
 * statement matched nothing — which the service must then explain (R3.2).
 */
export async function confirmBookingUnderLock(
  db: Queryable,
  bookingId: string,
  capacity: number,
): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(CONFIRM_BOOKING_SQL, [bookingId, capacity]);
  return rows[0] ?? null;
}

export async function countConfirmed(db: Queryable, trialClassId: string): Promise<number> {
  const { rows } = await db.query<{ count: number }>(
    `select count(*)::int as count
       from bookings
      where trial_class_id = $1
        and status = 'CONFIRMED'`,
    [trialClassId],
  );
  return rows[0]?.count ?? 0;
}

/**
 * The losing side of a race. SEAT_TAKEN is a result code, never a stored
 * status (R3.4): the row goes CANCELLED and carries the reason.
 */
export async function cancelBooking(
  db: Queryable,
  id: string,
  reason: string,
): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(
    `update bookings
        set status = 'CANCELLED',
            cancellation_reason = $2,
            updated_at = now()
      where id = $1
        and status = 'PENDING_PAYMENT'
      returning *`,
    [id, reason],
  );
  return rows[0] ?? null;
}

export async function markPaymentFailed(db: Queryable, id: string): Promise<BookingRow | null> {
  const { rows } = await db.query<BookingRow>(
    `update bookings
        set status = 'PAYMENT_FAILED',
            updated_at = now()
      where id = $1
        and status = 'PENDING_PAYMENT'
      returning *`,
    [id],
  );
  return rows[0] ?? null;
}

export interface RosterRow {
  booking: BookingRow;
  student: StudentRow;
}

interface RosterJoinRow extends BookingRow {
  student_row_id: string;
  student_parent_id: string;
  student_name: string;
  student_grade_level: string;
  student_created_at: Date;
  student_updated_at: Date;
}

/**
 * CONFIRMED only. A pending or failed booking is not on the roster.
 *
 * Columns are aliased rather than collapsed with to_jsonb: jsonb turns every
 * timestamptz into an ISO string, which still satisfies the TypeScript row
 * type while breaking toBookingView()'s .toISOString() call at runtime. The
 * type would lie, and the failure would surface in the DTO layer far from the
 * query that caused it.
 */
export async function listRoster(db: Queryable, trialClassId: string): Promise<RosterRow[]> {
  const { rows } = await db.query<RosterJoinRow>(
    `select b.*,
            s.id          as student_row_id,
            s.parent_id   as student_parent_id,
            s.name        as student_name,
            s.grade_level as student_grade_level,
            s.created_at  as student_created_at,
            s.updated_at  as student_updated_at
       from bookings b
       join students s on s.id = b.student_id
      where b.trial_class_id = $1
        and b.status = 'CONFIRMED'
      order by b.confirmed_at asc, b.id asc`,
    [trialClassId],
  );

  return rows.map((row) => ({
    booking: {
      id: row.id,
      student_id: row.student_id,
      trial_class_id: row.trial_class_id,
      status: row.status,
      cancellation_reason: row.cancellation_reason,
      hold_expires_at: row.hold_expires_at,
      confirmed_at: row.confirmed_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    student: {
      id: row.student_row_id,
      parent_id: row.student_parent_id,
      name: row.student_name,
      grade_level: row.student_grade_level,
      created_at: row.student_created_at,
      updated_at: row.student_updated_at,
    },
  }));
}
