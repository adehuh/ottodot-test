import { notFound } from 'next/navigation';

import { getPool } from '@/src/db/pool';
import { getBooking } from '@/src/services/booking';
import { findTrialClass } from '@/src/db/classes';
import { findStudent } from '@/src/db/students';
import { TRIAL_CURRENCY, TRIAL_PRICE_CENTS } from '@/src/domain/types';
import { StepHeader } from '@/src/ui/StepHeader';
import { BookingSummary } from '@/src/ui/BookingSummary';
import { ResultCard } from '@/src/ui/ResultCard';
import { BOOKING_STATUS_LABEL } from '@/src/ui/labels';
import { PaymentPanel } from './PaymentPanel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PayPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  const pool = getPool();

  const result = await getBooking(pool, bookingId);
  if (!result.ok) notFound();

  const booking = result.value;
  const [student, trialClass] = await Promise.all([
    findStudent(pool, booking.studentId),
    findTrialClass(pool, booking.trialClassId),
  ]);
  if (!student || !trialClass) notFound();

  const priceLabel = `${TRIAL_CURRENCY} ${(TRIAL_PRICE_CENTS / 100).toFixed(2)}`;

  return (
    <main className="mx-auto max-w-xl">
      {booking.status === 'PENDING_PAYMENT' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
          <StepHeader
            current={2}
            title="Pay for the trial"
            subtitle="A pending booking does not hold the seat. The seat is assigned when payment succeeds."
          />
          <div className="mt-6 space-y-6">
            <BookingSummary
              childName={student.name}
              trialClass={{
                subject: trialClass.subject,
                title: trialClass.title,
                startsAt: trialClass.starts_at.toISOString(),
              }}
              priceLabel={priceLabel}
            />
            <PaymentPanel bookingId={booking.id} priceLabel={priceLabel} />
          </div>
        </div>
      ) : (
        <ResultCard
          code={booking.status === 'CONFIRMED' ? 'ALREADY_CONFIRMED' : 'BOOKING_NOT_ACTIVE'}
          bookingStatusLabel={BOOKING_STATUS_LABEL[booking.status]}
          bookingId={booking.id}
        />
      )}
    </main>
  );
}
