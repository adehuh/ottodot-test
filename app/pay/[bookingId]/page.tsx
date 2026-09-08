import { notFound } from 'next/navigation';

import { getPool } from '@/src/db/pool';
import { getBookingDetail } from '@/src/services/booking';
import { TRIAL_CURRENCY, TRIAL_PRICE_CENTS } from '@/src/domain/types';
import { StepHeader } from '@/src/ui/StepHeader';
import { ResultCard } from '@/src/ui/ResultCard';
import { PaymentPanel } from './PaymentPanel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;

  const result = await getBookingDetail(getPool(), bookingId);
  if (!result.ok) notFound();

  const detail = result.value;
  const priceLabel = `${TRIAL_CURRENCY} ${(TRIAL_PRICE_CENTS / 100).toFixed(2)}`;

  if (detail.booking.status !== 'PENDING_PAYMENT') {
    return (
      <main className="mx-auto max-w-xl">
        <ResultCard
          code={detail.booking.status === 'CONFIRMED' ? 'ALREADY_CONFIRMED' : 'BOOKING_NOT_ACTIVE'}
          detail={detail}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <StepHeader current={2} title="Pay for the trial" />
        <div className="mt-6">
          <PaymentPanel detail={detail} priceLabel={priceLabel} />
        </div>
      </div>
    </main>
  );
}
