/**
 * Deterministic in-process payment gateway.
 *
 * Payment is mocked, not integrated. The only property that matters for
 * correctness is that a decline is an *explicit input* and never random
 * (R3.3): a gateway that declines on its own makes the payment-failure test
 * flaky, and a flaky test guarding a money invariant is worse than none.
 *
 * The gateway holds authorizations in memory. It is not durable and does not
 * need to be — nothing about the seat invariant depends on it surviving a
 * restart, because the database is the only authority on whether a seat
 * exists.
 */

export type PaymentSimulation = 'SUCCESS' | 'DECLINE' | 'SLOW';

export type AuthorizeOutcome =
  | { ok: true; authorizationId: string }
  | { ok: false; declineReason: string };

export interface AuthorizationRecord {
  id: string;
  amountCents: number;
  currency: string;
  status: 'AUTHORIZED' | 'CAPTURED' | 'VOIDED';
}

export interface AuthorizeInput {
  amountCents: number;
  currency: string;
  simulate: PaymentSimulation;
}

/** Widens the window between authorize and the confirm transaction on demand. */
const SLOW_AUTHORIZE_MS = 50;

const authorizations = new Map<string, AuthorizationRecord>();
let counter = 0;

/** Ids are sequential, not random: reruns produce the same trace. */
const nextId = (): string => `auth_${++counter}`;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function resetGateway(): void {
  authorizations.clear();
  counter = 0;
}

export function getAuthorization(id: string): AuthorizationRecord | undefined {
  return authorizations.get(id);
}

export async function authorize(input: AuthorizeInput): Promise<AuthorizeOutcome> {
  if (input.simulate === 'SLOW') {
    await sleep(SLOW_AUTHORIZE_MS);
  }

  if (input.simulate === 'DECLINE') {
    // No authorization record is created, so there is nothing to reverse.
    // This is why a decline touches no seat and needs no void.
    return { ok: false, declineReason: 'CARD_DECLINED' };
  }

  const id = nextId();
  authorizations.set(id, {
    id,
    amountCents: input.amountCents,
    currency: input.currency,
    status: 'AUTHORIZED',
  });

  return { ok: true, authorizationId: id };
}

export async function capture(authorizationId: string): Promise<{ providerRef: string }> {
  const record = authorizations.get(authorizationId);
  if (!record) throw new Error(`unknown authorization: ${authorizationId}`);

  // Both of these are faults, not outcomes: they mean the caller has the
  // authorize -> seat -> capture ordering wrong (R3.3).
  if (record.status === 'VOIDED') {
    throw new Error(`cannot capture a voided authorization: ${authorizationId}`);
  }
  if (record.status === 'CAPTURED') {
    throw new Error(`authorization already captured: ${authorizationId}`);
  }

  record.status = 'CAPTURED';
  return { providerRef: `cap_${authorizationId}` };
}

export async function voidAuthorization(authorizationId: string): Promise<void> {
  const record = authorizations.get(authorizationId);
  if (!record) throw new Error(`unknown authorization: ${authorizationId}`);

  // Voiding twice is harmless; the outcome the caller wanted already holds.
  if (record.status === 'VOIDED') return;

  // There is no refund path in this codebase and there must not be one
  // (R3.3). Reaching here means money was captured for a seat that was not
  // secured, which the confirm ordering is designed to make impossible.
  if (record.status === 'CAPTURED') {
    throw new Error(
      `cannot void a captured authorization - that would need a refund path: ${authorizationId}`,
    );
  }

  record.status = 'VOIDED';
}
