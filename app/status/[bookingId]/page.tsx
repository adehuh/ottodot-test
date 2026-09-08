import { notFound } from 'next/navigation';

import { getPool } from '@/src/db/pool';
import { getBookingDetail } from '@/src/services/booking';
import type { BookingView } from '@/src/domain/dto';
import { StepHeader } from '@/src/ui/StepHeader';
import { ResultCard, type ResultCardCode } from '@/src/ui/ResultCard';
import { RosterHintTrigger } from '@/src/ui/RosterHint';

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

  const result = await getBookingDetail(getPool(), bookingId);
  if (!result.ok) notFound();

  const detail = result.value;

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white px-7 pt-7 pb-1 shadow-sm">
        <StepHeader current={3} title="Booking status" />
      </div>

      {/* Points the header's Admin roster tab at this class. The hint lives
          up there because that is the control a reader has to click; a
          callout inside the card would explain the move without showing it. */}
      {detail.booking.status === 'CONFIRMED' ? (
        <RosterHintTrigger classId={detail.booking.trialClassId} />
      ) : null}

      <ResultCard code={cardCodeFor(detail.booking)} detail={detail} />
    </main>
  );
}
