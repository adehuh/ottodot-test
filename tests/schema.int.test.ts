import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Pool } from 'pg';
import { createTestSchema, type TestDb } from './helpers/schema';

/**
 * B1 at the database level, with the application removed.
 *
 * Everything here is raw SQL. No service, no repository, no TypeScript guard
 * is in the path. If these pass, the invariant holds even for someone who
 * connects with psql and ignores every line of application code - which is
 * the whole point of putting invariants in the schema rather than in an `if`.
 */
describe('schema invariants (raw SQL, application removed)', () => {
  let db: TestDb;
  let pool: Pool;
  let studentId: string;
  let classId: string;
  let otherClassId: string;

  beforeAll(async () => {
    db = await createTestSchema('schema');
    pool = db.pool;

    const parent = await pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Parent One', 'p1@example.com') returning id`,
    );
    const parentId = parent.rows[0]?.id;
    expect(parentId).toBeDefined();

    const student = await pool.query<{ id: string }>(
      `insert into students (parent_id, name, grade_level) values ($1, 'Mei', 'P3') returning id`,
      [parentId],
    );
    studentId = student.rows[0]?.id ?? '';

    const klass = await pool.query<{ id: string }>(
      `insert into trial_classes (subject, title, teacher_name, starts_at)
       values ('MATH', 'Fractions', 'Ms Tan', now() + interval '7 days') returning id`,
    );
    classId = klass.rows[0]?.id ?? '';

    const other = await pool.query<{ id: string }>(
      `insert into trial_classes (subject, title, teacher_name, starts_at)
       values ('SCIENCE', 'Volcanoes', 'Mr Lim', now() + interval '8 days') returning id`,
    );
    otherClassId = other.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await db.drop();
  });

  it('rejects a second PENDING_PAYMENT booking for the same child and class', async () => {
    await pool.query(
      `insert into bookings (student_id, trial_class_id, status) values ($1, $2, 'PENDING_PAYMENT')`,
      [studentId, classId],
    );

    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status)
         values ($1, $2, 'PENDING_PAYMENT')`,
        [studentId, classId],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'bookings_one_live_per_student_class',
    });
  });

  it('rejects a CONFIRMED booking alongside a live PENDING_PAYMENT one', async () => {
    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status) values ($1, $2, 'CONFIRMED')`,
        [studentId, classId],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('allows the same child to book a different class', async () => {
    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status)
         values ($1, $2, 'PENDING_PAYMENT')`,
        [studentId, otherClassId],
      ),
    ).resolves.toBeDefined();
  });

  it('lets a parent retry after a decline: PAYMENT_FAILED falls out of the index', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Parent Two', 'p2@example.com') returning id`,
    );
    const { rows: kids } = await pool.query<{ id: string }>(
      `insert into students (parent_id, name, grade_level) values ($1, 'Arun', 'P4') returning id`,
      [rows[0]?.id],
    );
    const retryStudent = kids[0]?.id;

    await pool.query(
      `insert into bookings (student_id, trial_class_id, status)
       values ($1, $2, 'PAYMENT_FAILED')`,
      [retryStudent, classId],
    );

    // The audit row survives AND a fresh attempt is allowed. Both matter.
    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status)
         values ($1, $2, 'PENDING_PAYMENT')`,
        [retryStudent, classId],
      ),
    ).resolves.toBeDefined();

    const { rows: audit } = await pool.query<{ count: string }>(
      `select count(*)::text as count from bookings
        where student_id = $1 and status = 'PAYMENT_FAILED'`,
      [retryStudent],
    );
    expect(audit[0]?.count).toBe('1');
  });

  it('lets a race loser rebook: CANCELLED also falls out of the index', async () => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into parents (name, email) values ('Parent Three', 'p3@example.com') returning id`,
    );
    const { rows: kids } = await pool.query<{ id: string }>(
      `insert into students (parent_id, name, grade_level) values ($1, 'Sara', 'P5') returning id`,
      [rows[0]?.id],
    );
    const loser = kids[0]?.id;

    await pool.query(
      `insert into bookings (student_id, trial_class_id, status, cancellation_reason)
       values ($1, $2, 'CANCELLED', 'SEAT_TAKEN')`,
      [loser, classId],
    );

    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status)
         values ($1, $2, 'PENDING_PAYMENT')`,
        [loser, classId],
      ),
    ).resolves.toBeDefined();
  });

  it('rejects a booking status Postgres does not know about', async () => {
    // Enum labels are case-sensitive (R2.6): lowercase is not the same label.
    await expect(
      pool.query(
        `insert into bookings (student_id, trial_class_id, status) values ($1, $2, 'confirmed')`,
        [studentId, otherClassId],
      ),
    ).rejects.toMatchObject({ code: '22P02' });
  });
});

describe('required database objects', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestSchema('objects');
  });
  afterAll(async () => {
    await db.drop();
  });

  /**
   * Named-index assertions exist so that dropping either object turns this
   * suite red. bookings_confirmed_by_class is a performance object - no
   * behavioural test would notice its absence - so without this assertion the
   * Definition of Done's claim about "either index" would be untrue.
   */
  it.each(['bookings_one_live_per_student_class', 'bookings_confirmed_by_class'])(
    'has the index %s',
    async (indexName) => {
      const { rows } = await db.pool.query<{ indexdef: string }>(
        `select indexdef from pg_indexes where schemaname = $1 and indexname = $2`,
        [db.schema, indexName],
      );
      expect(rows).toHaveLength(1);
    },
  );

  it('makes the duplicate index unique and partial on the two live statuses', async () => {
    const { rows } = await db.pool.query<{ indexdef: string }>(
      `select indexdef from pg_indexes
        where schemaname = $1 and indexname = 'bookings_one_live_per_student_class'`,
      [db.schema],
    );
    const def = rows[0]?.indexdef ?? '';
    expect(def).toContain('CREATE UNIQUE INDEX');
    expect(def).toContain('PENDING_PAYMENT');
    expect(def).toContain('CONFIRMED');
  });

  it.each(['parents', 'students', 'trial_classes', 'bookings', 'payment_attempts'])(
    'enables row level security on %s',
    async (table) => {
      const { rows } = await db.pool.query<{ relrowsecurity: boolean }>(
        `select c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = $1 and c.relname = $2`,
        [db.schema, table],
      );
      expect(rows[0]?.relrowsecurity).toBe(true);
    },
  );

  it('grants no RLS policies, so the deny-all default stands', async () => {
    const { rows } = await db.pool.query<{ count: string }>(
      `select count(*)::text as count from pg_policies where schemaname = $1`,
      [db.schema],
    );
    expect(rows[0]?.count).toBe('0');
  });
});
