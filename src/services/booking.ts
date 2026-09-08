import type { Pool } from 'pg';

import { mapPgError } from '@/src/db/errors';
import { findTrialClass } from '@/src/db/classes';
import { findStudent } from '@/src/db/students';
import { countConfirmed, insertPendingBooking } from '@/src/db/bookings';
import { toBookingView, type BookingView } from '@/src/domain/dto';
import { err, ok, type Result } from '@/src/domain/result';

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
