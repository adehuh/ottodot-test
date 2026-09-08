import { notFound } from 'next/navigation';
import Link from 'next/link';

import { getPool } from '@/src/db/pool';
import { getBooking } from '@/src/services/booking';
import type { BookingView } from '@/src/domain/dto';
import { StepHeader } from '@/src/ui/StepHeader';
import { ResultCard, type ResultCardCode } from '@/src/ui/ResultCard';
import { BOOKING_STATUS_LABEL } from '@/src/ui/labels';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The card keys off the stored status plus the cancellation reason, not off a
 * code passed through the URL. A URL a parent can edit is not a source of
 * truth, and the database already knows what happened.
 */
function cardCodeFor(booking: BookingView): ResultCardCode {
  switch (booking.status) {
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'PAYMENT_FAILED':
      return 'PAYMENT_FAILED';
    case 'PENDING_PAYMENT':
      return 'PENDING_PAYMENT';
    case 'CANCELLED':
      return booking.cancellationReason === 'SEAT_TAKEN' ? 'SEAT_TAKEN' : 'BOOKING_NOT_ACTIVE';
  }
}

export default async function StatusPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;

  const result = await getBooking(getPool(), bookingId);
  if (!result.ok) notFound();

  const booking = result.value;

  return (
    <main className="mx-auto max-w-xl space-y-6 p-6">
      <StepHeader step={3} of={3} title="Booking status" />

      <ResultCard
        code={cardCodeFor(booking)}
        bookingStatusLabel={BOOKING_STATUS_LABEL[booking.status]}
      >
        {booking.status === 'CONFIRMED' ? (
          <p className="mt-3">
            <Link
              href={`/roster/${booking.trialClassId}`}
              className="text-sm font-medium text-blue-700 underline"
            >
              View the class roster
            </Link>
          </p>
        ) : null}
      </ResultCard>
    </main>
  );
}
