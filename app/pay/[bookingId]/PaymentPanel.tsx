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
         * may well have confirmed. Poll instead.
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
    return <ResultCard code="UNKNOWN" />;
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => pay('SUCCESS')}
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:bg-slate-400"
      >
        {pending ? 'Processing…' : `Pay ${priceLabel}`}
      </button>

      <button
        type="button"
        onClick={() => pay('DECLINE')}
        disabled={pending}
        aria-busy={pending}
        className="w-full rounded border border-slate-400 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 hover:border-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700 disabled:opacity-60"
      >
        Simulate a declined card
      </button>

      <p className="text-xs text-slate-500">
        Payment is mocked. The decline button forces the gateway to refuse, so the failure path
        can be demonstrated on purpose rather than waited for.
      </p>
    </div>
  );
}
