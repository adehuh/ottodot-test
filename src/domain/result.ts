/**
 * Services return discriminated unions and never throw for an expected
 * outcome (R4.1). A `throw` means a fault: a bug, or the database being
 * unreachable. Losing a race is not a fault.
 */

export const RESULT_CODES = [
  'DUPLICATE',
  'SEAT_TAKEN',
  'CLASS_FULL',
  'PAYMENT_FAILED',
  'ALREADY_CONFIRMED',
  'BOOKING_NOT_ACTIVE',
  'NOT_FOUND',
] as const;

export type ResultCode = (typeof RESULT_CODES)[number];

/**
 * `ALREADY_CONFIRMED` sits in the `ok: false` arm because R4.1 defines the
 * shape that way, but it is a *success* for the parent (R3.2): their child
 * has a seat. The presentation layer maps it to a success tone. The one
 * thing it must never do is trigger a void - see R3.2.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; code: ResultCode };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });

export const err = <T = never>(code: ResultCode): Result<T> => ({ ok: false, code });
