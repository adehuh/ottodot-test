'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { BookingDetailView } from '@/src/domain/dto';
import { ResultCard } from '@/src/ui/ResultCard';
import { BOOKING_STATUS_LABEL, CLASS_SUBJECT_LABEL, formatStartsAt } from '@/src/ui/labels';
import { confirmBookingAction, getBookingAction } from '@/app/actions';

/** What each stored status means, in the parent's words. */
const STATE_LEGEND = [
  ['PENDING_PAYMENT', 'Payment is being processed. No seat is reserved yet.'],
  ['CONFIRMED', 'Seat secured and the child is on the roster.'],
  ['SEAT_TAKEN', 'Payment succeeded but another booking took the last seat — the authorisation is voided, never captured.'],
  ['PAYMENT_FAILED', 'Payment declined. The child is not added to the roster.'],
] as const;

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span
        className={`text-right text-sm font-semibold text-slate-900 ${mono ? 'font-mono text-[13px]' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * One in-flight request at a time (R7.6): both buttons disable on submit.
 * Double-submit is a duplicate source, and this is the UX half of a guard
 * whose real half is the partial unique index.
 */
export function PaymentPanel({
  detail,
  priceLabel,
}: {
  detail: BookingDetailView;
  priceLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [unknown, setUnknown] = useState(false);
  const { booking, trialClass, studentName } = detail;

  function pay(simulate: 'SUCCESS' | 'DECLINE') {
    setUnknown(false);

    startTransition(async () => {
      try {
        await confirmBookingAction({ bookingId: booking.id, simulate });
        router.push(`/status/${booking.id}`);
      } catch {
        /*
         * We do not know the outcome. R4.3: never render the declined card
         * here - a parent who reads "declined" pays again, and the booking may
         * well have confirmed. Poll instead; the stored status is the only
         * answer.
         */
        setUnknown(true);
        void pollUntilResolved();
      }
    });
  }

  async function pollUntilResolved() {
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      try {
        const result = await getBookingAction(booking.id);
        if (result.ok && result.value.status !== 'PENDING_PAYMENT') {
          router.push(`/status/${booking.id}`);
          return;
        }
      } catch {
        // Keep polling: still no answer.
      }
    }
  }

  if (unknown) return <ResultCard code="UNKNOWN" detail={detail} />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-slate-900">Mock payment</h2>
          <span className="rounded border border-slate-300 bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-slate-600">
            DEMO
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">No payment provider is connected.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <Row label="Child" value={studentName} />
        <Row label="Subject" value={CLASS_SUBJECT_LABEL[trialClass.subject]} />
        <Row label="Class" value={trialClass.title} />
        <Row label="Date & time" value={formatStartsAt(trialClass.startsAt)} />
        <Row label="Teacher" value={trialClass.teacherName} />
        <Row
          label="Reference"
          mono
          value={`${booking.id.slice(-8)} · ${BOOKING_STATUS_LABEL[booking.status]}`}
        />
        <div className="h-px bg-slate-200" />
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-semibold text-slate-900">Total</span>
          <span className="text-[22px] font-bold text-slate-900">{priceLabel}</span>
        </div>
      </div>

      <div className="flex gap-2.5 rounded-lg border border-teal-200 bg-teal-50 px-3.5 py-3">
        <span aria-hidden="true" className="shrink-0 text-sm">
          🔒
        </span>
        <p className="text-[13px] leading-relaxed text-teal-800">
          Your booking is being processed. The seat is only confirmed after payment succeeds. If
          another parent confirms the last seat first, your authorisation is voided automatically
          and nothing is captured — so there is no charge to reverse and no refund to wait for.
        </p>
      </div>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => pay('SUCCESS')}
          disabled={pending}
          aria-busy={pending}
          aria-label="Simulate successful payment"
          className="min-h-[44px] w-full rounded-lg bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {pending ? 'Processing payment…' : 'Simulate successful payment'}
        </button>

        <button
          type="button"
          onClick={() => pay('DECLINE')}
          disabled={pending}
          aria-busy={pending}
          aria-label="Simulate declined payment"
          className="min-h-[44px] w-full rounded-lg border border-rose-200 bg-white px-5 py-3 font-semibold text-rose-700 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:text-slate-400"
        >
          Simulate declined payment
        </button>

        <p className="text-[13px] text-slate-500">Mock controls — no card is collected and nothing is charged.</p>
        <p className="text-[13px] font-medium text-slate-600">
          Paying doesn&rsquo;t guarantee the seat. The database is the final authority — the booking
          is confirmed only once the server confirms it.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <p className="border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          What each state means
        </p>
        <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-2.5 px-4 py-3.5">
          {STATE_LEGEND.map(([code, meaning]) => (
            <div key={code} className="contents">
              <dt className="justify-self-start rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-bold whitespace-nowrap text-slate-600">
                {code}
              </dt>
              <dd className="text-[13px] leading-snug text-slate-600">{meaning}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
