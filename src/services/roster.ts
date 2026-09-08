import type { Pool } from 'pg';

import { findTrialClass, listTrialClassesWithCounts } from '@/src/db/classes';
import { listBookingsForClasses, listRoster, type ClassBookingRow } from '@/src/db/bookings';
import { err, ok, type Result } from '@/src/domain/result';
import { toTrialClassView, type ClassBookingView, type ClassRosterView, type RosterView } from '@/src/domain/dto';

/**
 * The teacher's view before class. CONFIRMED only: a pending or failed
 * booking is not a child in the room, and the count here is the same derived
 * count the confirm transaction guards.
 */
export async function getRoster(pool: Pool, classId: string): Promise<Result<RosterView>> {
  const trialClass = await findTrialClass(pool, classId);
  if (!trialClass) return err('NOT_FOUND');

  const entries = await listRoster(pool, classId);

  return ok({
    classId: trialClass.id,
    title: trialClass.title,
    subject: trialClass.subject,
    teacherName: trialClass.teacher_name,
    startsAt: trialClass.starts_at.toISOString(),
    capacity: trialClass.capacity,
    confirmedCount: entries.length,
    entries: entries.map(({ booking, student }) => ({
      bookingId: booking.id,
      studentName: student.name,
      gradeLevel: student.grade_level,
      confirmedAt: booking.confirmed_at ? booking.confirmed_at.toISOString() : null,
    })),
  });
}

const toClassBookingView = (row: ClassBookingRow): ClassBookingView => ({
  bookingId: row.booking.id,
  studentName: row.student.name,
  gradeLevel: row.student.grade_level,
  status: row.booking.status,
  cancellationReason: row.booking.cancellation_reason,
  createdAt: row.booking.created_at.toISOString(),
  confirmedAt: row.booking.confirmed_at ? row.booking.confirmed_at.toISOString() : null,
  paymentStatus: row.paymentStatus,
  paymentAttempts: row.paymentAttempts,
});

/**
 * Every class with every booking against it, split into what is on the roster
 * and what is not.
 *
 * The split is the point. The confirmed list is the roster and its length is
 * the count the confirm transaction guards; everything else is audit. Showing
 * a PAYMENT_FAILED row sitting next to a 3 / 4 count is what makes "the
 * decline consumed no seat" something you can see rather than infer.
 */
export async function listClassRosters(pool: Pool): Promise<ClassRosterView[]> {
  const classes = await listTrialClassesWithCounts(pool);
  const bookings = await listBookingsForClasses(
    pool,
    classes.map((c) => c.row.id),
  );

  return classes.map(({ row, confirmedCount }) => {
    const all = (bookings.get(row.id) ?? []).map(toClassBookingView);
    return {
      trialClass: toTrialClassView(row, confirmedCount),
      confirmed: all.filter((b) => b.status === 'CONFIRMED'),
      other: all.filter((b) => b.status !== 'CONFIRMED'),
    };
  });
}
