import type { ResultCode } from '@/src/domain/result';

/**
 * RFC 7807 problem+json (R4.2). The `code` is the stable machine-readable
 * part; the UI switches on it and never on the prose, so rewording `title`
 * can never break behaviour or a test.
 */
const STATUS_BY_CODE: Record<ResultCode, number> = {
  NOT_FOUND: 404,
  DUPLICATE: 409,
  SEAT_TAKEN: 409,
  CLASS_FULL: 409,
  BOOKING_NOT_ACTIVE: 409,
  ALREADY_CONFIRMED: 200,
  PAYMENT_FAILED: 402,
};

const TITLE_BY_CODE: Record<ResultCode, string> = {
  NOT_FOUND: 'Not found',
  DUPLICATE: 'This child is already booked into this class',
  SEAT_TAKEN: 'The last seat was taken',
  CLASS_FULL: 'This class is full',
  BOOKING_NOT_ACTIVE: 'This booking is no longer active',
  ALREADY_CONFIRMED: 'This booking is already confirmed',
  PAYMENT_FAILED: 'The payment was declined',
};

export function problemResponse(code: ResultCode): Response {
  return Response.json(
    { type: 'about:blank', title: TITLE_BY_CODE[code], status: STATUS_BY_CODE[code], code },
    {
      status: STATUS_BY_CODE[code],
      headers: { 'content-type': 'application/problem+json' },
    },
  );
}
