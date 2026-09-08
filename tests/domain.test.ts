import { describe, it, expect } from 'vitest';
import {
  BOOKING_STATUSES,
  PAYMENT_STATUSES,
  CLASS_SUBJECTS,
  CAPACITY,
  type BookingRow,
  type TrialClassRow,
  type StudentRow,
} from '@/src/domain/types';
import { RESULT_CODES, ok, err, type Result } from '@/src/domain/result';
import { toBookingView, toTrialClassView, toStudentView } from '@/src/domain/dto';

describe('domain enums', () => {
  it('uses the Postgres enum labels verbatim, UPPER_SNAKE_CASE', () => {
    expect(BOOKING_STATUSES).toEqual([
      'PENDING_PAYMENT',
      'CONFIRMED',
      'PAYMENT_FAILED',
      'CANCELLED',
    ]);
    expect(PAYMENT_STATUSES).toEqual(['AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED']);
    expect(CLASS_SUBJECTS).toEqual(['SCIENCE', 'MATH']);
  });

  it('lists exactly the seven result codes the services may return', () => {
    expect([...RESULT_CODES].sort()).toEqual(
      [
        'ALREADY_CONFIRMED',
        'BOOKING_NOT_ACTIVE',
        'CLASS_FULL',
        'DUPLICATE',
        'NOT_FOUND',
        'PAYMENT_FAILED',
        'SEAT_TAKEN',
      ].sort(),
    );
  });

  it('does not admit SEAT_TAKEN or DUPLICATE as stored booking statuses (R3.4)', () => {
    expect(BOOKING_STATUSES).not.toContain('SEAT_TAKEN');
    expect(BOOKING_STATUSES).not.toContain('DUPLICATE');
  });

  it('defaults capacity to 4', () => {
    expect(CAPACITY).toBe(4);
  });
});

describe('Result', () => {
  it('carries a value on success', () => {
    const result: Result<number> = ok(7);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(7);
  });

  it('carries a machine-readable code on failure, never prose', () => {
    const result: Result<number> = err('SEAT_TAKEN');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SEAT_TAKEN');
  });
});

const classRow: TrialClassRow = {
  id: '11111111-1111-4111-8111-111111111111',
  subject: 'MATH',
  title: 'Fractions',
  teacher_name: 'Ms Tan',
  starts_at: new Date('2026-10-01T09:00:00.000Z'),
  capacity: 4,
  created_at: new Date('2026-09-01T00:00:00.000Z'),
  updated_at: new Date('2026-09-01T00:00:00.000Z'),
};

describe('toTrialClassView', () => {
  it('serialises timestamps as ISO strings so no Date crosses to a client component', () => {
    const view = toTrialClassView(classRow, 3);
    expect(view.startsAt).toBe('2026-10-01T09:00:00.000Z');
    expect(typeof view.startsAt).toBe('string');
  });

  it('derives seats left from the confirmed count, never from a stored counter', () => {
    expect(toTrialClassView(classRow, 3).seatsLeft).toBe(1);
    expect(toTrialClassView(classRow, 0).seatsLeft).toBe(4);
  });

  it('is full when the confirmed count reaches capacity', () => {
    expect(toTrialClassView(classRow, 3).isFull).toBe(false);
    expect(toTrialClassView(classRow, 4).isFull).toBe(true);
  });

  it('never reports negative seats if the count somehow exceeds capacity', () => {
    expect(toTrialClassView(classRow, 6).seatsLeft).toBe(0);
    expect(toTrialClassView(classRow, 6).isFull).toBe(true);
  });

  it('exposes no raw column names', () => {
    const view = toTrialClassView(classRow, 1);
    expect(Object.keys(view)).not.toContain('teacher_name');
    expect(Object.keys(view)).not.toContain('starts_at');
    expect(view.teacherName).toBe('Ms Tan');
  });
});

describe('toBookingView', () => {
  const bookingRow: BookingRow = {
    id: '22222222-2222-4222-8222-222222222222',
    student_id: '33333333-3333-4333-8333-333333333333',
    trial_class_id: classRow.id,
    status: 'CONFIRMED',
    cancellation_reason: null,
    hold_expires_at: null,
    confirmed_at: new Date('2026-09-02T10:30:00.000Z'),
    created_at: new Date('2026-09-02T10:29:00.000Z'),
    updated_at: new Date('2026-09-02T10:30:00.000Z'),
  };

  it('keeps the status code verbatim so every layer greps the same string', () => {
    expect(toBookingView(bookingRow).status).toBe('CONFIRMED');
  });

  it('serialises confirmedAt as an ISO string and null stays null', () => {
    expect(toBookingView(bookingRow).confirmedAt).toBe('2026-09-02T10:30:00.000Z');
    expect(toBookingView({ ...bookingRow, confirmed_at: null }).confirmedAt).toBeNull();
  });

  it('carries the cancellation reason through for a lost race', () => {
    const cancelled = toBookingView({
      ...bookingRow,
      status: 'CANCELLED',
      cancellation_reason: 'SEAT_TAKEN',
      confirmed_at: null,
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancellationReason).toBe('SEAT_TAKEN');
  });
});

describe('toStudentView', () => {
  it('drops parent_id and the audit columns', () => {
    const row: StudentRow = {
      id: '44444444-4444-4444-8444-444444444444',
      parent_id: '55555555-5555-4555-8555-555555555555',
      name: 'Mei',
      grade_level: 'P3',
      created_at: new Date(),
      updated_at: new Date(),
    };
    const view = toStudentView(row);
    expect(view).toEqual({ id: row.id, name: 'Mei', gradeLevel: 'P3' });
  });
});
