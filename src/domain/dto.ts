/**
 * The service/dto boundary (R1.4). No database row shape crosses into a
 * client component: timestamps become ISO strings, snake_case becomes
 * camelCase, and columns the client has no business seeing are dropped.
 */

import type {
  BookingRow,
  BookingStatus,
  ClassSubject,
  PaymentStatus,
  StudentRow,
  TrialClassRow,
} from './types';

export interface StudentView {
  id: string;
  name: string;
  gradeLevel: string;
}

export interface TrialClassView {
  id: string;
  subject: ClassSubject;
  title: string;
  teacherName: string;
  startsAt: string;
  capacity: number;
  confirmedCount: number;
  seatsLeft: number;
  isFull: boolean;
}

export interface BookingView {
  id: string;
  studentId: string;
  trialClassId: string;
  status: BookingStatus;
  cancellationReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface RosterEntryView {
  bookingId: string;
  studentName: string;
  gradeLevel: string;
  confirmedAt: string | null;
}

export interface RosterView {
  classId: string;
  title: string;
  subject: ClassSubject;
  teacherName: string;
  startsAt: string;
  capacity: number;
  confirmedCount: number;
  entries: RosterEntryView[];
}

export const toStudentView = (row: StudentRow): StudentView => ({
  id: row.id,
  name: row.name,
  gradeLevel: row.grade_level,
});

/**
 * `confirmedCount` is passed in because it is derived by the query, not
 * stored on the row (R2.8). There is no counter column to read.
 */
export const toTrialClassView = (row: TrialClassRow, confirmedCount: number): TrialClassView => ({
  id: row.id,
  subject: row.subject,
  title: row.title,
  teacherName: row.teacher_name,
  startsAt: row.starts_at.toISOString(),
  capacity: row.capacity,
  confirmedCount,
  seatsLeft: Math.max(0, row.capacity - confirmedCount),
  isFull: confirmedCount >= row.capacity,
});

export const toBookingView = (row: BookingRow): BookingView => ({
  id: row.id,
  studentId: row.student_id,
  trialClassId: row.trial_class_id,
  status: row.status,
  cancellationReason: row.cancellation_reason,
  confirmedAt: row.confirmed_at ? row.confirmed_at.toISOString() : null,
  createdAt: row.created_at.toISOString(),
});

/**
 * Everything the status and payment screens render, in one shape. The result
 * card needs the class and child to say *what* was booked, and the payment
 * reference to show that the authorisation was released rather than charged.
 */
export interface BookingDetailView {
  booking: BookingView;
  studentName: string;
  trialClass: TrialClassView;
  /** Latest attempt for this booking, if it ever reached the gateway. */
  payment: { status: PaymentStatus; providerRef: string | null } | null;
}

/** One booking row inside an expanded class, whatever its status. */
export interface ClassBookingView {
  bookingId: string;
  studentName: string;
  gradeLevel: string;
  status: BookingStatus;
  cancellationReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  paymentStatus: PaymentStatus | null;
  paymentAttempts: number;
}

/** A class plus every booking against it — the admin/teacher view. */
export interface ClassRosterView {
  trialClass: TrialClassView;
  confirmed: ClassBookingView[];
  /** Pending, failed and cancelled. Kept for audit; never on the roster. */
  other: ClassBookingView[];
}
