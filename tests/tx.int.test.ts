import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { withTransaction } from '@/src/services/tx';

/**
 * A transaction uses one checked-out client, released in finally (R5.4).
 * Interleaving pool.query inside a transaction takes a *different*
 * connection and silently runs outside it - the failure mode these tests
 * exist to make impossible.
 */
describe('withTransaction', () => {
  let db: TestDb;
  let parentId: string;

  beforeAll(async () => {
    db = await createTestSchema('tx');
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Tx Parent', 'tx@example.com') returning id`,
    );
    parentId = rows[0]?.id ?? '';
  });
  afterAll(async () => {
    await db.drop();
  });

  const studentCount = async (): Promise<number> => {
    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from students`,
    );
    return Number(rows[0]?.count ?? -1);
  };

  it('commits the work when the callback returns', async () => {
    const before = await studentCount();

    const name = await withTransaction(db.pool, async (client) => {
      await client.query(
        `insert into students (parent_id, name, grade_level) values ($1, 'Committed', 'P3')`,
        [parentId],
      );
      return 'Committed';
    });

    expect(name).toBe('Committed');
    expect(await studentCount()).toBe(before + 1);
  });

  it('rolls back and rethrows when the callback throws', async () => {
    const before = await studentCount();

    await expect(
      withTransaction(db.pool, async (client) => {
        await client.query(
          `insert into students (parent_id, name, grade_level) values ($1, 'Rolled back', 'P3')`,
          [parentId],
        );
        throw new Error('deliberate failure');
      }),
    ).rejects.toThrow('deliberate failure');

    expect(await studentCount()).toBe(before);
  });

  it('rolls back when the database itself rejects a statement', async () => {
    const before = await studentCount();

    await expect(
      withTransaction(db.pool, async (client) => {
        await client.query(
          `insert into students (parent_id, name, grade_level) values ($1, 'Orphan', 'P3')`,
          [parentId],
        );
        // No such parent: a foreign key violation aborts the transaction.
        await client.query(
          `insert into students (parent_id, name, grade_level)
           values ('00000000-0000-4000-8000-0000000000ff', 'Orphan2', 'P3')`,
        );
      }),
    ).rejects.toMatchObject({ code: '23503' });

    expect(await studentCount()).toBe(before);
  });

  it('sees its own uncommitted writes inside the transaction but not outside', async () => {
    let insideCount = -1;
    const outsideDuring = { value: -1 };

    await withTransaction(db.pool, async (client) => {
      await client.query(
        `insert into students (parent_id, name, grade_level) values ($1, 'Isolated', 'P3')`,
        [parentId],
      );

      const inside = await client.query<{ count: string }>(
        `select count(*)::text as count from students where name = 'Isolated'`,
      );
      insideCount = Number(inside.rows[0]?.count);

      // A separate pooled connection is a separate transaction. Under READ
      // COMMITTED it cannot see the uncommitted row.
      const outside = await db.pool.query<{ count: string }>(
        `select count(*)::text as count from students where name = 'Isolated'`,
      );
      outsideDuring.value = Number(outside.rows[0]?.count);
    });

    expect(insideCount).toBe(1);
    expect(outsideDuring.value).toBe(0);
  });

  it('always releases the client, so the pool is not exhausted by repeated failures', async () => {
    // The pool has a small max. Without release-in-finally this deadlocks
    // long before the loop ends.
    for (let i = 0; i < 30; i++) {
      await expect(
        withTransaction(db.pool, async () => {
          throw new Error(`failure ${i}`);
        }),
      ).rejects.toThrow(`failure ${i}`);
    }

    expect(await studentCount()).toBeGreaterThanOrEqual(0);
  });
});
