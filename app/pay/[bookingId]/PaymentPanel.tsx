'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { ResultCard } from '@/src/ui/ResultCard';
import { confirmBookingAction, getBookingAction } from '@/app/actions';

/**
 * One in-flight request at a time (R7.6): both buttons disable on submit.
 * Double-submit is a duplicate source, and this is the UX half of a guard
 * whose real half is the partial unique index.
 */
export function PaymentPanel({ bookingId, priceLabel }: { bookingId: string; priceLabel: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [unknown, setUnknown] = useState(false);

  function pay(simulate: 'SUCCESS' | 'DECLINE') {
    setUnknown(false);

    startTransition(async () => {
      try {
        await confirmBookingAction({ bookingId, simulate });
        router.push(`/status/${bookingId}`);
      } catch {
        /*
         * We do not know the outcome. R4.3: never render the declined card
         * here - a parent who reads "declined" pays again, and the booking
         * may well have confirmed. Poll instead; the stored status stays the
         * only answer.
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
        const result = await getBookingAction(bookingId);
        if (result.ok && result.value.status !== 'PENDING_PAYMENT') {
          router.push(`/status/${bookingId}`);
          return;
        }
      } catch {
        // Keep polling: still no answer.
      }
    }
  }

  if (unknown) {
    return <ResultCard code="UNKNOWN" bookingId={bookingId} />;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => pay('SUCCESS')}
        disabled={pending}
        aria-busy={pending}
        aria-label={`Pay ${priceLabel}`}
        className="min-h-[44px] w-full rounded-lg bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400"
      >
        {pending ? 'Processing payment…' : `Pay ${priceLabel}`}
      </button>

      <button
        type="button"
        onClick={() => pay('DECLINE')}
        disabled={pending}
        aria-busy={pending}
        aria-label="Simulate a declined payment"
        className="min-h-[44px] w-full rounded-lg border border-rose-200 bg-white px-5 py-3 font-semibold text-rose-700 hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:text-slate-400"
      >
        Simulate a declined payment
      </button>

      <p className="text-[13px] text-slate-500">
        Payment is mocked. The decline button forces the gateway to refuse, so the failure path can
        be demonstrated on purpose rather than waited for.
      </p>
    </div>
  );
}
