import type { PaymentAttemptRow, PaymentStatus } from '@/src/domain/types';
import type { Queryable } from './queryable';

export interface NewPaymentAttempt {
  bookingId: string;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  providerRef: string | null;
}

/** Every attempt is recorded regardless of outcome (A3). */
export async function insertPaymentAttempt(
  db: Queryable,
  attempt: NewPaymentAttempt,
): Promise<PaymentAttemptRow> {
  const { rows } = await db.query<PaymentAttemptRow>(
    `insert into payment_attempts (booking_id, amount_cents, currency, status, provider_ref)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [
      attempt.bookingId,
      attempt.amountCents,
      attempt.currency,
      attempt.status,
      attempt.providerRef,
    ],
  );

  const row = rows[0];
  if (!row) throw new Error('insertPaymentAttempt returned no row');
  return row;
}

export async function listPaymentAttempts(
  db: Queryable,
  bookingId: string,
): Promise<PaymentAttemptRow[]> {
  const { rows } = await db.query<PaymentAttemptRow>(
    `select * from payment_attempts where booking_id = $1 order by created_at asc, id asc`,
    [bookingId],
  );
  return rows;
}

/**
 * One row per attempt, updated as the attempt resolves. Inserting the
 * AUTHORIZED row before the confirm transaction means the record exists even
 * if the process dies mid-flight, which is what makes reconciliation possible
 * at all.
 */
export async function updatePaymentAttemptStatus(
  db: Queryable,
  id: string,
  status: PaymentStatus,
  providerRef: string | null,
): Promise<PaymentAttemptRow | null> {
  const { rows } = await db.query<PaymentAttemptRow>(
    `update payment_attempts
        set status = $2,
            provider_ref = coalesce($3, provider_ref),
            updated_at = now()
      where id = $1
      returning *`,
    [id, status, providerRef],
  );
  return rows[0] ?? null;
}
