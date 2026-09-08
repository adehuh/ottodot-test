import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

/**
 * One seed() used by the integration tests AND by POST /api/dev/reset (R2.3),
 * so demo state and test fixtures cannot drift apart.
 *
 * Fixed UUIDs make it deterministic: the reviewer runs it more than once, the
 * video depends on the same ids appearing every time, and a test can name a
 * row without querying for it first.
 *
 * Idempotency is a truncate followed by inserts rather than a pile of
 * ON CONFLICT clauses. It is the simplest thing that gives identical row
 * counts and identical ids on every run, which is exactly what "reset" means.
 */
export const SEED_IDS = {
  parents: {
    tan: '00000000-0000-4000-8000-000000000001',
    nair: '00000000-0000-4000-8000-000000000002',
    classmates: '00000000-0000-4000-8000-000000000003',
  },
  students: {
    mei: '00000000-0000-4000-8000-000000000101',
    arun: '00000000-0000-4000-8000-000000000102',
    sara: '00000000-0000-4000-8000-000000000103',
    filler1: '00000000-0000-4000-8000-000000000111',
    filler2: '00000000-0000-4000-8000-000000000112',
    filler3: '00000000-0000-4000-8000-000000000113',
    filler4: '00000000-0000-4000-8000-000000000114',
  },
  classes: {
    volcanoes: '00000000-0000-4000-8000-000000000201',
    fractions: '00000000-0000-4000-8000-000000000202',
    circuits: '00000000-0000-4000-8000-000000000203',
    geometry: '00000000-0000-4000-8000-000000000204',
  },
} as const;

const S = SEED_IDS;

/** Fixed ids for seeded rows: the reviewer reruns the seed and the video
 *  depends on the same ids appearing every time. */
const b = (n: number) => `00000000-0000-4000-8000-${String(300 + n).padStart(12, '0')}`;
const p = (n: number) => `00000000-0000-4000-8000-${String(400 + n).padStart(12, '0')}`;

/**
 * Which class exercises which edge case:
 *
 *   Volcanoes  1 of 4 confirmed  seats available; Mei's row makes the
 *                                duplicate attempt demonstrable
 *   Fractions  3 of 4 confirmed  the last-seat race
 *   Circuits   4 of 4 confirmed  full class rejection
 *   Geometry   2 confirmed +     a declined payment consumed no seat, and
 *              1 PAYMENT_FAILED  Sara can retry because the failed row falls
 *                                out of the partial unique index
 */
interface SeededBooking {
  bookingId: string;
  paymentId: string;
  studentId: string;
  classId: string;
}

const CONFIRMED: readonly SeededBooking[] = [
  { bookingId: b(1), paymentId: p(1), studentId: S.students.mei, classId: S.classes.volcanoes },

  { bookingId: b(2), paymentId: p(2), studentId: S.students.filler1, classId: S.classes.fractions },
  { bookingId: b(3), paymentId: p(3), studentId: S.students.filler2, classId: S.classes.fractions },
  { bookingId: b(4), paymentId: p(4), studentId: S.students.filler3, classId: S.classes.fractions },

  { bookingId: b(5), paymentId: p(5), studentId: S.students.filler1, classId: S.classes.circuits },
  { bookingId: b(6), paymentId: p(6), studentId: S.students.filler2, classId: S.classes.circuits },
  { bookingId: b(7), paymentId: p(7), studentId: S.students.filler3, classId: S.classes.circuits },
  { bookingId: b(8), paymentId: p(8), studentId: S.students.filler4, classId: S.classes.circuits },

  { bookingId: b(9), paymentId: p(9), studentId: S.students.filler1, classId: S.classes.geometry },
  { bookingId: b(10), paymentId: p(10), studentId: S.students.filler2, classId: S.classes.geometry },
];

/** Sara's declined attempt at Geometry. Survives as audit; blocks no retry. */
const FAILED_BOOKING_ID = '00000000-0000-4000-8000-000000000399';

export async function seed(db: Queryable): Promise<typeof SEED_IDS> {
  await db.query(
    `truncate parents, students, trial_classes, bookings, payment_attempts cascade`,
  );

  await db.query(
    `insert into parents (id, name, email) values
       ($1, 'Wei Ling Tan', 'weiling.tan@example.com'),
       ($2, 'Priya Nair',   'priya.nair@example.com'),
       ($3, 'Seeded Classmates', 'classmates@example.com')`,
    [S.parents.tan, S.parents.nair, S.parents.classmates],
  );

  await db.query(
    `insert into students (id, parent_id, name, grade_level) values
       ($1,  $8, 'Mei Tan',      'P3'),
       ($2,  $8, 'Arun Tan',     'P4'),
       ($3,  $9, 'Sara Nair',    'P5'),
       ($4, $10, 'Classmate A',  'P3'),
       ($5, $10, 'Classmate B',  'P4'),
       ($6, $10, 'Classmate C',  'P4'),
       ($7, $10, 'Classmate D',  'P5')`,
    [
      S.students.mei,
      S.students.arun,
      S.students.sara,
      S.students.filler1,
      S.students.filler2,
      S.students.filler3,
      S.students.filler4,
      S.parents.tan,
      S.parents.nair,
      S.parents.classmates,
    ],
  );

  // Start times are relative so the demo never looks stale. Ids stay fixed,
  // which is what determinism is actually for here.
  await db.query(
    `insert into trial_classes (id, subject, title, teacher_name, starts_at, capacity) values
       ($1, 'SCIENCE', 'Volcanoes and Earthquakes', 'Mr Lim',   now() + interval '3 days', 4),
       ($2, 'MATH',    'Fractions Made Easy',       'Ms Tan',   now() + interval '4 days', 4),
       ($3, 'SCIENCE', 'Circuits and Currents',     'Ms Rao',   now() + interval '5 days', 4),
       ($4, 'MATH',    'Geometry Basics',           'Mr Chen',  now() + interval '6 days', 4)`,
    [S.classes.volcanoes, S.classes.fractions, S.classes.circuits, S.classes.geometry],
  );

  for (const booking of CONFIRMED) {
    await db.query(
      `insert into bookings (id, student_id, trial_class_id, status, confirmed_at)
       values ($1, $2, $3, 'CONFIRMED', now())`,
      [booking.bookingId, booking.studentId, booking.classId],
    );

    await db.query(
      `insert into payment_attempts (id, booking_id, amount_cents, currency, status, provider_ref)
       values ($1, $2, 4500, 'SGD', 'CAPTURED', $3)`,
      [booking.paymentId, booking.bookingId, `seed_cap_${booking.bookingId.slice(-4)}`],
    );
  }

  await db.query(
    `insert into bookings (id, student_id, trial_class_id, status)
     values ($1, $2, $3, 'PAYMENT_FAILED')`,
    [FAILED_BOOKING_ID, S.students.sara, S.classes.geometry],
  );

  await db.query(
    `insert into payment_attempts (id, booking_id, amount_cents, currency, status, provider_ref)
     values ($1, $2, 4500, 'SGD', 'FAILED', 'seed_declined')`,
    ['00000000-0000-4000-8000-000000000499', FAILED_BOOKING_ID],
  );

  return SEED_IDS;
}
