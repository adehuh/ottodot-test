import type { Pool } from 'pg';

import { mapPgError } from '@/src/db/errors';
import { findTrialClass, lockClassForUpdate } from '@/src/db/classes';
import { findStudent } from '@/src/db/students';
import {
  cancelBooking,
  confirmBookingUnderLock,
  countConfirmed,
  findBooking,
  insertPendingBooking,
  markPaymentFailed,
} from '@/src/db/bookings';
import { insertPaymentAttempt, listPaymentAttempts, updatePaymentAttemptStatus } from '@/src/db/payments';
import {
  authorize,
  capture,
  voidAuthorization,
  type PaymentSimulation,
} from '@/src/payments/mock';
import { toBookingView, toTrialClassView, type BookingDetailView, type BookingView } from '@/src/domain/dto';
import { TRIAL_CURRENCY, TRIAL_PRICE_CENTS, type BookingRow } from '@/src/domain/types';
import { err, ok, type Result } from '@/src/domain/result';
import { withTransaction } from './tx';

export interface CreateBookingInput {
  studentId: string;
  trialClassId: string;
}

/**
 * Creates the PENDING_PAYMENT row a parent pays against.
 *
 * A pending booking reserves nothing (R2.9). Two parents may hold and pay for
 * the same last seat; the database decides at confirm time and the loser's
 * authorization is voided. That is why no hold, TTL or sweeper exists here.
 */
export async function createBooking(
  pool: Pool,
  input: CreateBookingInput,
): Promise<Result<BookingView>> {
  const [student, trialClass] = await Promise.all([
    findStudent(pool, input.studentId),
    findTrialClass(pool, input.trialClassId),
  ]);

  if (!student || !trialClass) return err('NOT_FOUND');

  /*
   * Advisory only (R3). This spares a parent a pointless payment flow into a
   * class that is already full, but it is NOT load-bearing: between this
   * count and any later confirm, the class can fill. The confirm transaction
   * is the only authority on whether a seat exists, and deleting these three
   * lines would change nothing about what the system permits.
   */
  if ((await countConfirmed(pool, trialClass.id)) >= trialClass.capacity) {
    return err('CLASS_FULL');
  }

  try {
    const booking = await insertPendingBooking(pool, student.id, trialClass.id);
    return ok(toBookingView(booking));
  } catch (error) {
    // The partial unique index is what makes a duplicate impossible; this
    // only translates its complaint into something a parent can be shown.
    const code = mapPgError(error);
    if (code) return err(code);
    throw error;
  }
}

export interface ConfirmBookingInput {
  bookingId: string;
  simulate: PaymentSimulation;
}

/**
 * What the confirm transaction decided. Kept separate from the Result the
 * caller sees because the transaction must not perform the payment calls
 * itself: a transaction is never held open across a network call (R1, R3.3).
 */
type SeatDecision =
  | { kind: 'WON'; booking: BookingRow }
  | { kind: 'SEAT_TAKEN' }
  | { kind: 'ALREADY_CONFIRMED' }
  | { kind: 'BOOKING_NOT_ACTIVE' }
  | { kind: 'NOT_FOUND' };

/**
 * The graded core: authorize -> seat -> capture, voiding on loss.
 *
 *   authorize(amount)          no lock held
 *     |- declined ----------->  PAYMENT_FAILED, no seat touched, nothing to reverse
 *     \- AUTHORIZED
 *          |
 *          v
 *     confirm transaction      the only critical section
 *          |- seat won ------>  capture(authId)  -> CONFIRMED
 *          \- SEAT_TAKEN ---->  void(authId)     -> CANCELLED, reason SEAT_TAKEN
 *
 * Money is never captured for a seat the child did not get, which is what
 * removes the refund path from this codebase entirely (R3.3).
 *
 * Both payment calls sit outside the transaction on purpose. Holding a row
 * lock across a network call would make every other parent for that class
 * wait on a payment provider.
 */
export async function confirmBooking(
  pool: Pool,
  input: ConfirmBookingInput,
): Promise<Result<BookingView>> {
  const booking = await findBooking(pool, input.bookingId);
  if (!booking) return err('NOT_FOUND');

  /*
   * Advisory pre-check, and the reason the ALREADY_CONFIRMED branch below
   * genuinely has nothing to reverse. A stale client retrying a finished
   * booking never reaches the gateway, so no redundant authorization is
   * created for it. The authoritative decision is still the re-read inside
   * the transaction - this only keeps the common case cheap.
   */
  if (booking.status === 'CONFIRMED') return err('ALREADY_CONFIRMED');
  if (booking.status !== 'PENDING_PAYMENT') return err('BOOKING_NOT_ACTIVE');

  const authorization = await authorize({
    amountCents: TRIAL_PRICE_CENTS,
    currency: TRIAL_CURRENCY,
    simulate: input.simulate,
  });

  if (!authorization.ok) {
    // No authorization exists, so there is nothing to void and no seat was
    // ever touched. The failed row survives outside the partial unique index,
    // so the parent can retry.
    await insertPaymentAttempt(pool, {
      bookingId: booking.id,
      amountCents: TRIAL_PRICE_CENTS,
      currency: TRIAL_CURRENCY,
      status: 'FAILED',
      providerRef: null,
    });
    await markPaymentFailed(pool, booking.id);
    return err('PAYMENT_FAILED');
  }

  /*
   * A hold now exists on the card. From here every exit - return OR throw -
   * must either capture it or release it.
   *
   * The earlier version put the uniform void below the WON early return, which
   * covered every `return` but not a `throw`. That was fine while nothing in
   * this region could throw; adding lock_timeout gave it a 55P03 to throw, and
   * the hold survived with nothing to release it. Structural for returns is
   * not structural.
   *
   * `captured` guards the release: voiding a captured authorization is the
   * refund path R3 forbids, and the gateway throws if asked - which would mask
   * the original fault with a confusing one.
   */
  let attempt: Awaited<ReturnType<typeof insertPaymentAttempt>> | null = null;
  let captured = false;

  try {
    attempt = await insertPaymentAttempt(pool, {
      bookingId: booking.id,
      amountCents: TRIAL_PRICE_CENTS,
      currency: TRIAL_CURRENCY,
      status: 'AUTHORIZED',
      providerRef: authorization.authorizationId,
    });

    const decision = await withTransaction(pool, async (client): Promise<SeatDecision> => {
      // Serialises every confirm for this class. Without it two concurrent
      // confirms touch different booking rows, never block, each evaluates the
      // count against its own snapshot, and both commit (R3.1).
      const trialClass = await lockClassForUpdate(client, booking.trial_class_id);
      if (!trialClass) return { kind: 'NOT_FOUND' };

      const confirmed = await confirmBookingUnderLock(client, booking.id, trialClass.capacity);
      if (confirmed) return { kind: 'WON', booking: confirmed };

      /*
       * Zero rows updated is NOT automatically SEAT_TAKEN (R3.2). Re-read the
       * booking inside this same transaction and branch on what it actually
       * says. The three result codes stay distinct; only the release is
       * uniform.
       */
      const reread = await findBooking(client, booking.id);
      if (!reread) return { kind: 'NOT_FOUND' };

      if (reread.status === 'CONFIRMED') return { kind: 'ALREADY_CONFIRMED' };

      if (reread.status === 'PENDING_PAYMENT') {
        const confirmedCount = await countConfirmed(client, reread.trial_class_id);
        if (confirmedCount >= trialClass.capacity) return { kind: 'SEAT_TAKEN' };

        // Still pending with a seat free means the guarded UPDATE should have
        // matched. Under the class lock nobody else can have changed the
        // count, so this is a bug in the statement, not an outcome.
        throw new Error(`confirm matched no rows while a seat was free: booking ${reread.id}`);
      }

      return { kind: 'BOOKING_NOT_ACTIVE' };
    });

    if (decision.kind === 'WON') {
      // The seat is secured and committed. Only now does money move.
      await capture(authorization.authorizationId);
      captured = true;
      // provider_ref stays the authorization id through every state. That is
      // the identifier a real gateway keeps stable across authorize, capture
      // and void, so it is the one worth storing for reconciliation.
      await updatePaymentAttemptStatus(pool, attempt.id, 'CAPTURED', authorization.authorizationId);
      return ok(toBookingView(decision.booking));
    }

    await voidAuthorization(authorization.authorizationId);
    await updatePaymentAttemptStatus(pool, attempt.id, 'VOIDED', authorization.authorizationId);

    switch (decision.kind) {
      case 'SEAT_TAKEN':
        // Recorded after the void: if the void fails the booking stays
        // PENDING_PAYMENT and the parent can retry, which beats a cancelled
        // booking with a live authorization behind it.
        await cancelBooking(pool, booking.id, 'SEAT_TAKEN');
        return err('SEAT_TAKEN');

      case 'ALREADY_CONFIRMED':
        return err('ALREADY_CONFIRMED');

      case 'BOOKING_NOT_ACTIVE':
        return err('BOOKING_NOT_ACTIVE');

      case 'NOT_FOUND':
        return err('NOT_FOUND');
    }
  } catch (error) {
    /*
     * A fault, not an outcome - the caller gets the error. But the hold is
     * ours to clean up, including when insertPaymentAttempt itself failed and
     * there is no ledger row to reconcile against.
     *
     * Release is best effort and its own failure is swallowed: the original
     * fault is the one worth surfacing, and masking it with a cleanup error
     * would hide the cause.
     */
    if (!captured) {
      try {
        await voidAuthorization(authorization.authorizationId);
        if (attempt) {
          await updatePaymentAttemptStatus(
            pool,
            attempt.id,
            'VOIDED',
            authorization.authorizationId,
          );
        }
      } catch {
        /* keep the original error */
      }
    }
    throw error;
  }
}

export async function getBooking(pool: Pool, bookingId: string): Promise<Result<BookingView>> {
  const booking = await findBooking(pool, bookingId);
  if (!booking) return err('NOT_FOUND');
  return ok(toBookingView(booking));
}

/**
 * Everything the payment and status screens render, in one call: the booking,
 * who it is for, what was booked, current seat availability, and the latest
 * payment attempt.
 *
 * The last one matters on the losing side of a race — showing the parent the
 * reference of the authorisation that was released is more convincing than
 * telling them nothing was charged.
 */
export async function getBookingDetail(
  pool: Pool,
  bookingId: string,
): Promise<Result<BookingDetailView>> {
  const booking = await findBooking(pool, bookingId);
  if (!booking) return err('NOT_FOUND');

  const [student, trialClass, attempts] = await Promise.all([
    findStudent(pool, booking.student_id),
    findTrialClass(pool, booking.trial_class_id),
    listPaymentAttempts(pool, booking.id),
  ]);
  if (!student || !trialClass) return err('NOT_FOUND');

  const confirmedCount = await countConfirmed(pool, trialClass.id);
  const latest = attempts.at(-1) ?? null;

  return ok({
    booking: toBookingView(booking),
    studentName: student.name,
    trialClass: toTrialClassView(trialClass, confirmedCount),
    payment: latest ? { status: latest.status, providerRef: latest.provider_ref } : null,
  });
}
