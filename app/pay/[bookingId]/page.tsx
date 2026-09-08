import { notFound } from 'next/navigation';

import { getPool } from '@/src/db/pool';
import { getBooking } from '@/src/services/booking';
import { findTrialClass } from '@/src/db/classes';
import { findStudent } from '@/src/db/students';
import { toStudentView, toTrialClassView } from '@/src/domain/dto';
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
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <StepHeader
        step={2}
        of={3}
        title="Pay for the trial"
        subtitle="A pending booking does not hold the seat. The seat is assigned when payment succeeds."
      />

      <BookingSummary
        child={toStudentView(student)}
        trialClass={toTrialClassView(trialClass, 0)}
        priceLabel={priceLabel}
      />

      {booking.status === 'PENDING_PAYMENT' ? (
        <PaymentPanel bookingId={booking.id} priceLabel={priceLabel} />
      ) : (
        <ResultCard
          code={booking.status === 'CONFIRMED' ? 'ALREADY_CONFIRMED' : 'BOOKING_NOT_ACTIVE'}
          bookingStatusLabel={BOOKING_STATUS_LABEL[booking.status]}
        />
      )}
    </main>
  );
}
