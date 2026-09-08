/**
 * Pure domain types. Zero I/O, zero imports from any layer below (R1.1).
 *
 * Every label below is the *same string* the Postgres enum stores, the API
 * returns and the UI switches on (R2.6). One string end to end means a typo
 * is a type error rather than a silent mismatch, and any value can be
 * grepped from migration to component.
 *
 * Row types are hand-written to match the schema (R2.2). They live here,
 * not in src/db, because src/domain may not import from src/db and both
 * repositories and services need to name them.
 */

export const BOOKING_STATUSES = [
  'PENDING_PAYMENT',
  'CONFIRMED',
  'PAYMENT_FAILED',
  'CANCELLED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const PAYMENT_STATUSES = ['AUTHORIZED', 'CAPTURED', 'VOIDED', 'FAILED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const CLASS_SUBJECTS = ['SCIENCE', 'MATH'] as const;
export type ClassSubject = (typeof CLASS_SUBJECTS)[number];

/** Default seats per trial class. Per-class data, not a constant the code relies on. */
export const CAPACITY = 4;

/** Trial price. Integer cents plus a currency, never a float (R2.5). */
export const TRIAL_PRICE_CENTS = 4500;
export const TRIAL_CURRENCY = 'SGD';

// --- row types: one per table, matching the migration exactly -------------

export interface ParentRow {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

export interface StudentRow {
  id: string;
  parent_id: string;
  name: string;
  grade_level: string;
  created_at: Date;
  updated_at: Date;
}

export interface TrialClassRow {
  id: string;
  subject: ClassSubject;
  title: string;
  teacher_name: string;
  starts_at: Date;
  capacity: number;
  created_at: Date;
  updated_at: Date;
}

export interface BookingRow {
  id: string;
  student_id: string;
  trial_class_id: string;
  status: BookingStatus;
  cancellation_reason: string | null;
  hold_expires_at: Date | null;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentAttemptRow {
  id: string;
  booking_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider_ref: string | null;
  created_at: Date;
  updated_at: Date;
}
