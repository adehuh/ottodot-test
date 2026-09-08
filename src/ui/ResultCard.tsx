import Link from 'next/link';

import type { BookingDetailView } from '@/src/domain/dto';
import { CLASS_SUBJECT_LABEL, formatStartsAt, seatsLabel } from './labels';

/**
 * One component driven by a code map, not four near-duplicate cards (R7.2).
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

type Action = { label: string; href: string; kind: 'primary' | 'secondary' };

interface CardSpec {
  icon: string;
  iconClass: string;
  title: string;
  /** The second half of the monospace code line: CONFIRMED · ON ROSTER. */
  rosterNote: string;
  body: string;
  actions: Action[];
}

const BOOK: Action = { label: 'Back to classes', href: '/book', kind: 'secondary' };
const ANOTHER: Action = { label: 'Choose another class', href: '/book', kind: 'primary' };

const CARD: Record<ResultCardCode, CardSpec> = {
  CONFIRMED: {
    icon: '✓',
    iconClass: 'bg-emerald-50 text-emerald-700',
    title: 'Booking confirmed',
    rosterNote: 'ON ROSTER',
    body: 'The seat is secured and your child is on the class roster.',
    actions: [{ label: 'Done', href: '/book', kind: 'primary' }],
  },
  ALREADY_CONFIRMED: {
    icon: '✓',
    iconClass: 'bg-emerald-50 text-emerald-700',
    title: 'Already confirmed',
    rosterNote: 'ON ROSTER',
    body: 'This booking was already confirmed. You have not been charged twice.',
    actions: [{ label: 'Done', href: '/book', kind: 'primary' }],
  },
  SEAT_TAKEN: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'The last seat was booked',
    rosterNote: 'NOT ON ROSTER',
    body: 'Another booking was confirmed a moment before yours. Nothing here was your mistake — both payments were in flight at once.',
    actions: [ANOTHER],
  },
  PAYMENT_FAILED: {
    icon: '✕',
    iconClass: 'bg-rose-50 text-rose-700',
    title: "Payment wasn't completed",
    rosterNote: 'NOT ON ROSTER',
    body: 'Nothing was charged. The booking was not added to the roster and no seat was consumed.',
    actions: [
      { label: 'Try booking again', href: '/book', kind: 'primary' },
      BOOK,
    ],
  },
  DUPLICATE: {
    icon: '↺',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'This child is already booked',
    rosterNote: 'NO SECOND BOOKING',
    body: 'This child already has a live booking for this class. No additional booking was created and nothing was charged.',
    actions: [{ label: 'Book a different class', href: '/book', kind: 'primary' }],
  },
  CLASS_FULL: {
    icon: '!',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'This class is full',
    rosterNote: 'NO SEATS',
    body: 'All seats are confirmed. Choose a different class.',
    actions: [ANOTHER],
  },
  BOOKING_NOT_ACTIVE: {
    icon: '!',
    iconClass: 'bg-slate-100 text-slate-500',
    title: 'This booking is no longer active',
    rosterNote: 'NOT ON ROSTER',
    body: 'It was cancelled or its payment failed. Start a new booking.',
    actions: [ANOTHER],
  },
  PENDING_PAYMENT: {
    icon: '…',
    iconClass: 'bg-amber-100 text-amber-700',
    title: 'Waiting for payment',
    rosterNote: 'NOT ON ROSTER',
    body: 'This booking is not confirmed yet. A pending booking does not hold a seat.',
    actions: [BOOK],
  },
  NOT_FOUND: {
    icon: '?',
    iconClass: 'bg-slate-100 text-slate-500',
    title: 'Booking not found',
    rosterNote: 'NO SUCH BOOKING',
    body: 'We could not find that booking.',
    actions: [BOOK],
  },
  /*
   * R4.3, both of these. A transport failure is not a decline: a parent who
   * reads "declined" pays again, and the booking may well have succeeded.
   */
  UNREACHABLE: {
    icon: '!',
    iconClass: 'bg-rose-50 text-rose-700',
    title: "We couldn't reach the booking service",
    rosterNote: 'NO BOOKING CREATED',
    body: 'Nothing was charged and no booking was created. Try again.',
    actions: [{ label: 'Try again', href: '/book', kind: 'primary' }],
  },
  UNKNOWN: {
    icon: '?',
    iconClass: 'bg-slate-100 text-slate-500',
    title: "We're still confirming — do not pay again",
    rosterNote: 'OUTCOME UNKNOWN',
    body: 'We lost contact before we knew the outcome. This page is checking for you.',
    actions: [],
  },
};

/**
 * The reassurance list on the losing side of a race. Three plain facts, because
 * the parent's questions are "was I charged", "is my child in" and "did I burn
 * the free trial" — in that order.
 *
 * It says voided, not refunded. Nothing was ever captured, so there is nothing
 * to refund; saying "refunded" would describe a money movement that did not
 * happen and imply a wait for it to arrive.
 */
function SeatTakenAssurances({ detail }: { detail: BookingDetailView | null }) {
  const ref = detail?.payment?.providerRef;
  const items = [
    ref
      ? `Your payment was voided in full — nothing was captured (${ref})`
      : 'Your payment was voided in full — nothing was captured',
    'Your child was not added to the roster',
    'The free trial is still unused',
  ];

  return (
    <ul className="w-full space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-left">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-[13px] text-slate-700">
          <span aria-hidden="true" className="mt-px font-bold text-emerald-700">
            ✓
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DetailBlock({ detail }: { detail: BookingDetailView }) {
  const { trialClass, studentName, booking } = detail;

  return (
    <dl className="w-full min-w-60 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 px-6 py-4 text-left">
      <div className="flex justify-between gap-4">
        <dt className="text-[13px] text-slate-500">Child</dt>
        <dd className="text-[13px] font-semibold text-slate-900">{studentName}</dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-[13px] text-slate-500">Class</dt>
        <dd className="text-right text-[13px] font-semibold text-slate-900">
          {CLASS_SUBJECT_LABEL[trialClass.subject]} · {trialClass.title}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-[13px] text-slate-500">Starts</dt>
        <dd className="text-right text-[13px] font-semibold text-slate-900">
          {formatStartsAt(trialClass.startsAt)}
        </dd>
      </div>
      <div className="flex justify-between gap-4">
        <dt className="text-[13px] text-slate-500">Teacher</dt>
        <dd className="text-[13px] font-semibold text-slate-900">{trialClass.teacherName}</dd>
      </div>
      <div className="flex justify-between gap-4 border-t border-slate-200 pt-1.5">
        <dt className="text-[13px] text-slate-500">Booking</dt>
        <dd className="font-mono text-[12px] text-slate-600">{booking.id.slice(-8)}</dd>
      </div>
      {booking.status !== 'CONFIRMED' ? (
        <div className="flex justify-between gap-4">
          <dt className="text-[13px] text-slate-500">Seats now</dt>
          <dd className="text-[13px] font-semibold text-slate-900">
            {seatsLabel(trialClass.seatsLeft, trialClass.isFull)}
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

export function ResultCard({
  code,
  detail = null,
  children,
}: {
  code: ResultCardCode;
  detail?: BookingDetailView | null;
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
        {/* The literal code shown AS technical detail, alongside the human
            title - never instead of it (R7.8's one deliberate exception). */}
        <p className="text-[11px] font-bold tracking-widest text-slate-400">
          {code} · {spec.rosterNote}
        </p>
        <p className="mx-auto max-w-md text-sm text-slate-500">{spec.body}</p>
      </div>

      {code === 'SEAT_TAKEN' ? <SeatTakenAssurances detail={detail} /> : null}
      {detail && code !== 'SEAT_TAKEN' ? <DetailBlock detail={detail} /> : null}

      {children}

      {spec.actions.length > 0 ? (
        <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
          {spec.actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className={
                action.kind === 'primary'
                  ? 'flex min-h-[44px] items-center justify-center rounded-lg bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2'
                  : 'flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-3 text-[15px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2'
              }
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
