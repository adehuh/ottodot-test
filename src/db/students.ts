import type { StudentRow } from '@/src/domain/types';
import type { Queryable } from './queryable';

export async function listStudentsByParent(
  db: Queryable,
  parentId: string,
): Promise<StudentRow[]> {
  const { rows } = await db.query<StudentRow>(
    `select * from students where parent_id = $1 order by name asc`,
    [parentId],
  );
  return rows;
}

export async function findStudent(db: Queryable, id: string): Promise<StudentRow | null> {
  const { rows } = await db.query<StudentRow>(`select * from students where id = $1`, [id]);
  return rows[0] ?? null;
}
