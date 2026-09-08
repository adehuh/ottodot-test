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
  | 'UNREACHABLE'
  | 'UNKNOWN';

interface CardSpec {
  icon: string;
  iconClass: string;
  title: string;
  body: string;
}

const CARD: Record<ResultCardCode, CardSpec> = {
  CONFIRMED: {
    icon: '✓',
    iconClass: 'bg-emerald-50 text-emerald-700',
    title: 'Booked',
    body: 'The seat is confirmed and your child is on the class roster.',
  },
  ALREADY_CONFIRMED: {
    icon: '✓',
    iconClass: 'bg-emerald-50 text-emerald-700',
    title: 'Already booked',
    body: 'This booking was already confirmed. You have not been charged twice.',
  },
  SEAT_TAKEN: {
    icon: '✕',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'The last seat went to someone else',
    body: 'Another parent confirmed a moment before this booking. Your card was not charged and the authorisation has been released.',
  },
  PAYMENT_FAILED: {
    icon: '✕',
    iconClass: 'bg-rose-50 text-rose-700',
    title: 'Payment declined',
    body: 'No seat was taken and nothing was charged. You can try booking again.',
  },
  DUPLICATE: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'Already booked into this class',
    body: 'This child already has a live booking for this trial class.',
  },
  CLASS_FULL: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'This class is full',
    body: 'All seats are confirmed. Choose a different class.',
  },
  BOOKING_NOT_ACTIVE: {
    icon: '!',
    iconClass: 'bg-slate-100 text-slate-500',
    title: 'This booking is no longer active',
    body: 'It was cancelled or its payment failed. Start a new booking.',
  },
  PENDING_PAYMENT: {
    icon: '…',
    iconClass: 'bg-slate-100 text-slate-500',
    title: 'Waiting for payment',
    body: 'This booking is not confirmed yet. A pending booking does not hold a seat.',
  },
  NOT_FOUND: {
    icon: '?',
    iconClass: 'bg-slate-100 text-slate-500',
    title: 'Booking not found',
    body: 'We could not find that booking.',
  },
  /*
   * R4.3, both of these. A transport failure is not a decline: a parent who
   * reads "declined" pays again, and the booking may well have succeeded.
   * UNREACHABLE is for a request that never landed; UNKNOWN is for one whose
   * outcome we lost track of.
   */
  UNREACHABLE: {
    icon: '!',
    iconClass: 'bg-rose-50 text-rose-700',
    title: "We couldn't reach the booking service",
    body: 'Nothing was charged and no booking was created. Try again.',
  },
  UNKNOWN: {
    icon: '?',
    iconClass: 'bg-slate-100 text-slate-500',
    title: "We're still confirming - do not pay again",
    body: 'We lost contact before we knew the outcome. This page is checking for you.',
  },
};

export function ResultCard({
  code,
  bookingStatusLabel,
  bookingId,
  children,
}: {
  code: ResultCardCode;
  bookingStatusLabel?: string;
  bookingId?: string;
  children?: React.ReactNode;
}) {
  const spec = CARD[code];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-[18px] rounded-2xl border border-slate-200 bg-white px-8 py-10 text-center shadow-sm"
    >
      <span
        aria-hidden="true"
        className={`flex h-16 w-16 items-center justify-center rounded-full text-3xl ${spec.iconClass}`}
      >
        {spec.icon}
      </span>

      <div className="space-y-2">
        <p className="text-2xl font-bold text-slate-900">{spec.title}</p>
        <p className="mx-auto max-w-sm text-sm text-slate-500">{spec.body}</p>
      </div>

      {bookingStatusLabel ? (
        <dl className="min-w-60 rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-left">
          <div className="flex items-center justify-between gap-6">
            <dt className="text-[13px] text-slate-500">Booking status</dt>
            <dd className="text-[13px] font-semibold text-slate-900">{bookingStatusLabel}</dd>
          </div>
          {bookingId ? (
            <div className="mt-1.5 flex items-center justify-between gap-6">
              <dt className="text-[13px] text-slate-500">Reference</dt>
              <dd className="font-mono text-[12px] text-slate-600">{bookingId.slice(-8)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* The literal code shown AS technical detail, alongside the human
          label - never instead of it (R7.8's one deliberate exception). */}
      <p className="text-[11px] font-bold tracking-widest text-slate-400">{code}</p>

      {children}

      <Link
        href="/book"
        className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
      >
        Back to booking
      </Link>
    </div>
  );
}
