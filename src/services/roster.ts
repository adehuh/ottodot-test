import type { Pool } from 'pg';

import { findTrialClass } from '@/src/db/classes';
import { listRoster } from '@/src/db/bookings';
import { err, ok, type Result } from '@/src/domain/result';
import type { RosterView } from '@/src/domain/dto';

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
