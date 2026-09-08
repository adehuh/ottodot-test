import type { BookingStatus, ClassSubject } from '@/src/domain/types';

/**
 * The frontend never renders a raw enum code as copy (R7.8).
 *
 * `Record<BookingStatus, string>` makes this map exhaustive: adding a status
 * without wording fails typecheck. Deriving prose with toLowerCase() or
 * replace('_', ' ') would silently invent copy for codes nobody has written
 * wording for yet.
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

/** Subject tags, per the design system. Keyed by code, never by label (R7.9). */
export const CLASS_SUBJECT_TAG: Record<ClassSubject, string> = {
  SCIENCE: 'bg-teal-100 text-teal-700',
  MATH: 'bg-blue-100 text-blue-700',
};

/** Seat state is never conveyed by colour alone (R7.5) - the words carry it. */
export function seatsLabel(seatsLeft: number, isFull: boolean, capacity?: number): string {
  if (isFull) return 'FULL';
  if (seatsLeft === 1) return '1 seat left';
  return capacity ? `${seatsLeft} of ${capacity} seats left` : `${seatsLeft} seats left`;
}

/**
 * Three badge treatments: plain when there is room, amber when one seat is
 * left, muted when full. The urgency is in the wording too, so the colour is
 * reinforcement rather than the message.
 */
export function seatsBadgeClass(seatsLeft: number, isFull: boolean): string {
  if (isFull) {
    return 'rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500';
  }
  if (seatsLeft === 1) {
    return 'rounded-full border border-amber-200 bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800';
  }
  return 'text-sm font-semibold text-slate-700';
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
