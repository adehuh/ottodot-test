import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createTestSchema, type TestDb } from './helpers/schema';
import { seed, SEED_IDS } from '@/db/seed';

/**
 * The route handler is the thin edge: parse, validate, call one service, map
 * the result to HTTP (R1.3). These tests exercise it through the real handler
 * so the problem+json contract and the Zod boundary are both covered.
 */
let db: TestDb;

vi.mock('@/src/db/pool', () => ({
  getPool: () => db.pool,
}));

const { GET } = await import('@/app/api/roster/[classId]/route');

describe('GET /api/roster/[classId]', () => {
  beforeAll(async () => {
    db = await createTestSchema('rosterroute');
  });
  afterAll(async () => {
    await db.drop();
  });
  beforeEach(async () => {
    await seed(db.pool);
  });

  const call = (classId: string) =>
    GET(new Request(`http://localhost/api/roster/${classId}`), {
      params: Promise.resolve({ classId }),
    });

  it('returns the roster for a class (A5)', async () => {
    const response = await call(SEED_IDS.classes.geometry);
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.classId).toBe(SEED_IDS.classes.geometry);
    expect(body.title).toBe('Geometry Basics');
    expect(body.capacity).toBe(4);
  });

  it('counts CONFIRMED only, so a failed payment never appears on the roster', async () => {
    const body = await (await call(SEED_IDS.classes.geometry)).json();

    // Geometry holds 2 CONFIRMED plus Sara's PAYMENT_FAILED row.
    expect(body.confirmedCount).toBe(2);
    expect(body.entries).toHaveLength(2);
    expect(body.entries.every((e: { confirmedAt: string | null }) => e.confirmedAt)).toBe(true);
  });

  it('names the children so a teacher can take attendance', async () => {
    const body = await (await call(SEED_IDS.classes.volcanoes)).json();
    expect(body.entries[0].studentName).toBe('Mei Tan');
    expect(body.entries[0].gradeLevel).toBe('P3');
  });

  it('returns a full class as full', async () => {
    const body = await (await call(SEED_IDS.classes.circuits)).json();
    expect(body.confirmedCount).toBe(4);
    expect(body.entries).toHaveLength(4);
  });

  it('returns problem+json with a stable code for an unknown class', async () => {
    const response = await call('00000000-0000-4000-8000-0000000009ff');

    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');

    const body = await response.json();
    expect(body.code).toBe('NOT_FOUND');
    expect(typeof body.title).toBe('string');
  });

  it('rejects a malformed id at the boundary before it reaches SQL (R4.4)', async () => {
    const response = await call('not-a-uuid');

    // Zod stops this before any SQL runs. It maps to NOT_FOUND rather than a
    // new validation code: the result-code list is closed (R4.1), and to a
    // client there is no such class either way.
    expect(response.status).toBe(404);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
    expect((await response.json()).code).toBe('NOT_FOUND');
  });

  it('exposes no database column names to the client', async () => {
    const body = await (await call(SEED_IDS.classes.volcanoes)).json();
    const serialised = JSON.stringify(body);

    expect(serialised).not.toContain('teacher_name');
    expect(serialised).not.toContain('trial_class_id');
    expect(serialised).not.toContain('student_id');
  });
});
