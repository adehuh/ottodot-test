import type { BookingStatus, ClassSubject } from '@/src/domain/types';

/**
 * The frontend never renders a raw enum code as copy (R7.8).
 *
 * `Record<BookingStatus, string>` makes this map exhaustive: adding a status
 * without wording fails typecheck. Deriving prose with toLowerCase() or
 * replace('_', ' ') would silently invent copy for codes nobody has written
 * wording for yet, which is how a parent ends up reading "seat taken" in a
 * tone meant for an error.
 */
export const BOOKING_STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING_PAYMENT: 'Pending payment',
  CONFIRMED: 'Confirmed',
  PAYMENT_FAILED: 'Payment failed',
  CANCELLED: 'Cancelled',
};

export const CLASS_SUBJECT_LABEL: Record<ClassSubject, string> = {
  SCIENCE: 'Science',
  MATH: 'Math',
};

/** Seat state is never conveyed by colour alone (R7.5) - the words carry it. */
export function seatsLabel(seatsLeft: number, isFull: boolean): string {
  if (isFull) return 'FULL';
  if (seatsLeft === 1) return '1 seat left';
  return `${seatsLeft} seats left`;
}

export function formatStartsAt(iso: string): string {
  return new Date(iso).toLocaleString('en-SG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Singapore',
  });
}
