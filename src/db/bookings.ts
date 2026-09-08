import type { BookingRow, PaymentStatus, StudentRow } from '@/src/domain/types';
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

/**
 * Which classes each of these children already has a *live* booking for —
 * the same two statuses the partial unique index covers.
 *
 * Feeds the "already booked" reason on the class list. Advisory only: the
 * index is what actually prevents the duplicate (R7.1).
 */
export async function listLiveBookingsForStudents(
  db: Queryable,
  studentIds: string[],
): Promise<Array<{ student_id: string; trial_class_id: string }>> {
  if (studentIds.length === 0) return [];
  const { rows } = await db.query<{ student_id: string; trial_class_id: string }>(
    `select student_id, trial_class_id
       from bookings
      where student_id = any($1::uuid[])
        and status in ('PENDING_PAYMENT', 'CONFIRMED')`,
    [studentIds],
  );
  return rows;
}

export interface ClassBookingRow {
  booking: BookingRow;
  student: StudentRow;
  paymentStatus: PaymentStatus | null;
  paymentAttempts: number;
}

interface ClassBookingJoinRow extends BookingRow {
  student_row_id: string;
  student_parent_id: string;
  student_name: string;
  student_grade_level: string;
  student_created_at: Date;
  student_updated_at: Date;
  payment_status: PaymentStatus | null;
  payment_attempts: number;
}

/**
 * Every booking for a class, whatever its status — the audit view behind the
 * roster. The roster *count* still means confirmed only; these extra rows are
 * what make a decline visible rather than merely absent.
 *
 * The payment column is the latest attempt, plus how many attempts there have
 * been, so a repeated decline reads as "declined x2" instead of looking like
 * one.
 */
export async function listBookingsForClasses(
  db: Queryable,
  classIds: string[],
): Promise<Map<string, ClassBookingRow[]>> {
  const grouped = new Map<string, ClassBookingRow[]>();
  if (classIds.length === 0) return grouped;

  const { rows } = await db.query<ClassBookingJoinRow>(
    `select b.*,
            s.id          as student_row_id,
            s.parent_id   as student_parent_id,
            s.name        as student_name,
            s.grade_level as student_grade_level,
            s.created_at  as student_created_at,
            s.updated_at  as student_updated_at,
            (select p.status from payment_attempts p
              where p.booking_id = b.id
              order by p.created_at desc, p.id desc
              limit 1) as payment_status,
            (select count(*)::int from payment_attempts p
              where p.booking_id = b.id) as payment_attempts
       from bookings b
       join students s on s.id = b.student_id
      where b.trial_class_id = any($1::uuid[])
      order by
        case b.status
          when 'CONFIRMED' then 0
          when 'PENDING_PAYMENT' then 1
          when 'PAYMENT_FAILED' then 2
          else 3
        end,
        b.created_at asc`,
    [classIds],
  );

  for (const row of rows) {
    const entry: ClassBookingRow = {
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
      paymentStatus: row.payment_status,
      paymentAttempts: row.payment_attempts,
    };
    const list = grouped.get(row.trial_class_id);
    if (list) list.push(entry);
    else grouped.set(row.trial_class_id, [entry]);
  }

  return grouped;
}
