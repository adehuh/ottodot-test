import type { TrialClassRow } from '@/src/domain/types';
import type { Queryable } from './queryable';

/**
 * The class row lock that serialises confirms (R3.1).
 *
 * Exported as a constant because it is load-bearing: without FOR UPDATE two
 * concurrent confirms touch different booking rows, never block, each
 * evaluates the seat count against its own snapshot, and both commit. The
 * lock-disabled proof test reads this constant and strips the lock from it,
 * so the proof cannot drift away from the statement production runs.
 */
export const SELECT_CLASS_FOR_UPDATE_SQL = `
  select id, capacity
    from trial_classes
   where id = $1
   for update
`;

export interface ClassWithCount {
  row: TrialClassRow;
  confirmedCount: number;
}

interface ClassCountRow extends TrialClassRow {
  confirmed_count: number;
}

/**
 * Seat counts are derived here, in the same statement that reads the class
 * (R2.8). There is no counter column, so there is nothing to reconcile and
 * nothing that can drift from the bookings table.
 */
export async function listTrialClassesWithCounts(db: Queryable): Promise<ClassWithCount[]> {
  const { rows } = await db.query<ClassCountRow>(`
    select c.*,
           (select count(*)
              from bookings b
             where b.trial_class_id = c.id
               and b.status = 'CONFIRMED')::int as confirmed_count
      from trial_classes c
     order by c.starts_at asc
  `);

  return rows.map(({ confirmed_count, ...row }) => ({
    row,
    confirmedCount: confirmed_count,
  }));
}

export async function findTrialClass(db: Queryable, id: string): Promise<TrialClassRow | null> {
  const { rows } = await db.query<TrialClassRow>(
    `select * from trial_classes where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Takes the row lock. Only ever called inside a transaction. */
export async function lockClassForUpdate(
  db: Queryable,
  classId: string,
): Promise<{ id: string; capacity: number } | null> {
  const { rows } = await db.query<{ id: string; capacity: number }>(
    SELECT_CLASS_FOR_UPDATE_SQL,
    [classId],
  );
  return rows[0] ?? null;
}
