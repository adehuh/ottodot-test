import Link from 'next/link';

/**
 * One component driven by a code map, not four near-duplicate cards (R7.2).
 *
 * Everything keys off the code, never the copy (R7.9), so rewording a title
 * can never change behaviour or break a test selector.
 */
export type ResultCardCode =
  | 'CONFIRMED'
  | 'ALREADY_CONFIRMED'
  | 'SEAT_TAKEN'
  | 'PAYMENT_FAILED'
  | 'DUPLICATE'
  | 'CLASS_FULL'
  | 'BOOKING_NOT_ACTIVE'
  | 'PENDING_PAYMENT'
  | 'NOT_FOUND'
  | 'UNKNOWN';

interface CardSpec {
  icon: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  title: string;
  body: string;
}

const CARD: Record<ResultCardCode, CardSpec> = {
  CONFIRMED: {
    icon: '✓',
    tone: 'success',
    title: 'Booked',
    body: 'The seat is confirmed and your child is on the class roster.',
  },
  ALREADY_CONFIRMED: {
    icon: '✓',
    tone: 'success',
    title: 'Already booked',
    body: 'This booking was already confirmed. You have not been charged twice.',
  },
  SEAT_TAKEN: {
    icon: '✕',
    tone: 'warning',
    title: 'The last seat went to someone else',
    body: 'Your card was not charged. The authorisation has been released. Pick another class.',
  },
  PAYMENT_FAILED: {
    icon: '✕',
    tone: 'danger',
    title: 'Payment declined',
    body: 'No seat was taken and nothing was charged. You can try booking again.',
  },
  DUPLICATE: {
    icon: '!',
    tone: 'warning',
    title: 'Already booked into this class',
    body: 'This child already has a live booking for this trial class.',
  },
  CLASS_FULL: {
    icon: '!',
    tone: 'warning',
    title: 'This class is full',
    body: 'All seats are confirmed. Choose a different class.',
  },
  BOOKING_NOT_ACTIVE: {
    icon: '!',
    tone: 'neutral',
    title: 'This booking is no longer active',
    body: 'It was cancelled or its payment failed. Start a new booking.',
  },
  PENDING_PAYMENT: {
    icon: '…',
    tone: 'neutral',
    title: 'Waiting for payment',
    body: 'This booking is not confirmed yet. A pending booking does not hold a seat.',
  },
  NOT_FOUND: {
    icon: '?',
    tone: 'neutral',
    title: 'Booking not found',
    body: 'We could not find that booking.',
  },
  // R4.3: a transport failure is not a decline. Never show the declined card
  // for a 5xx or a dropped connection - a parent who reads "declined" pays
  // again, and that is how you get two bookings.
  UNKNOWN: {
    icon: '…',
    tone: 'neutral',
    title: "We're still confirming - do not pay again",
    body: 'We lost contact before we knew the outcome. This page is checking for you.',
  },
};

const TONE_CLASS: Record<CardSpec['tone'], string> = {
  success: 'border-green-600 bg-green-50',
  warning: 'border-amber-600 bg-amber-50',
  danger: 'border-red-600 bg-red-50',
  neutral: 'border-slate-400 bg-slate-50',
};

export function ResultCard({
  code,
  bookingStatusLabel,
  children,
}: {
  code: ResultCardCode;
  bookingStatusLabel?: string;
  children?: React.ReactNode;
}) {
  const spec = CARD[code];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`rounded border p-5 ${TONE_CLASS[spec.tone]}`}
    >
      <p className="text-lg font-semibold text-slate-900">
        <span aria-hidden="true" className="mr-2">
          {spec.icon}
        </span>
        {spec.title}
      </p>
      <p className="mt-2 text-sm text-slate-700">{spec.body}</p>

      {bookingStatusLabel ? (
        <p className="mt-3 text-sm text-slate-700">
          Booking status: <span className="font-medium">{bookingStatusLabel}</span>
        </p>
      ) : null}

      {/* The literal code shown AS technical detail, next to the human label -
          never instead of it (R7.8's one deliberate exception). */}
      <p className="mt-3 font-mono text-xs text-slate-500">{code}</p>

      {children}

      <p className="mt-4">
        <Link href="/book" className="text-sm font-medium text-blue-700 underline">
          Back to booking
        </Link>
      </p>
    </div>
  );
}
