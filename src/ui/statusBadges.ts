import type { BookingStatus, PaymentStatus } from '@/src/domain/types';

/**
 * Badge treatments keyed by code, never by label (R7.9), so reworded copy can
 * never change a colour or break a selector.
 */
export const BOOKING_STATUS_BADGE: Record<BookingStatus, string> = {
  CONFIRMED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  PENDING_PAYMENT: 'border-amber-200 bg-amber-100 text-amber-700',
  PAYMENT_FAILED: 'border-rose-200 bg-rose-50 text-rose-700',
  CANCELLED: 'border-slate-200 bg-slate-50 text-slate-400 line-through',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  AUTHORIZED: 'authorised',
  CAPTURED: 'paid',
  VOIDED: 'voided',
  FAILED: 'declined',
};

/** "declined ×2" reads as a repeated failure; "declined" alone hides it. */
export function paymentLabel(status: PaymentStatus | null, attempts: number): string {
  if (!status) return 'no attempt';
  const label = PAYMENT_STATUS_LABEL[status];
  return attempts > 1 ? `${label} ×${attempts}` : label;
}
