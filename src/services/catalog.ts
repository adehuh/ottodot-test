import type { Pool } from 'pg';

import { listTrialClassesWithCounts } from '@/src/db/classes';
import { listStudentsByParent } from '@/src/db/students';
import { listLiveBookingsForStudents } from '@/src/db/bookings';
import { toStudentView, toTrialClassView, type StudentView, type TrialClassView } from '@/src/domain/dto';

/**
 * Seat counts here are advisory: they let the UI grey out a full class for
 * kindness (R7.1). They are read at render time and can be stale by the time
 * a parent clicks. The confirm transaction re-checks everything.
 */
export async function listTrialClasses(pool: Pool): Promise<TrialClassView[]> {
  const rows = await listTrialClassesWithCounts(pool);
  return rows.map(({ row, confirmedCount }) => toTrialClassView(row, confirmedCount));
}

export async function listChildren(pool: Pool, parentId: string): Promise<StudentView[]> {
  const students = await listStudentsByParent(pool, parentId);
  return students.map(toStudentView);
}

/**
 * studentId -> the classes that child already holds a live booking for.
 *
 * Lets the class list name the reason a row is disabled ("Mei is already
 * booked for this class") instead of leaving grey to carry it (R7.5). Purely
 * a kindness: the partial unique index is what makes the duplicate
 * impossible, and this map going stale changes nothing.
 */
export async function listAlreadyBookedByStudent(
  pool: Pool,
  studentIds: string[],
): Promise<Record<string, string[]>> {
  const rows = await listLiveBookingsForStudents(pool, studentIds);

  const byStudent: Record<string, string[]> = {};
  for (const row of rows) {
    (byStudent[row.student_id] ??= []).push(row.trial_class_id);
  }
  return byStudent;
}
