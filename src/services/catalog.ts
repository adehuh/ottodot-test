import type { Pool } from 'pg';

import { listTrialClassesWithCounts } from '@/src/db/classes';
import { listStudentsByParent } from '@/src/db/students';
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
