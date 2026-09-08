import { describe, it, expect } from 'vitest';
import { mapPgError, DUPLICATE_LIVE_BOOKING_INDEX } from '@/src/db/errors';

/**
 * This is the only file in the codebase that knows what 23505 means (R4.6).
 * Everything above it speaks in result codes. If a layer above ever reads a
 * Postgres error code, that layer has taken on a database concern it has no
 * business owning.
 */
describe('mapPgError', () => {
  it('maps a unique violation on the duplicate index to DUPLICATE', () => {
    expect(mapPgError({ code: '23505', constraint: DUPLICATE_LIVE_BOOKING_INDEX })).toBe(
      'DUPLICATE',
    );
  });

  it('names the index exactly as the migration creates it', () => {
    expect(DUPLICATE_LIVE_BOOKING_INDEX).toBe('bookings_one_live_per_student_class');
  });

  it('returns null for a unique violation on a different constraint', () => {
    // parents.email is unique too. That is not a duplicate booking, and
    // pretending it is would return a nonsense code to the parent.
    expect(mapPgError({ code: '23505', constraint: 'parents_email_key' })).toBeNull();
  });

  it('returns null for a foreign key violation, which is a fault not an outcome', () => {
    expect(mapPgError({ code: '23503', constraint: 'bookings_student_id_fkey' })).toBeNull();
  });

  it('returns null for a non-Postgres error', () => {
    expect(mapPgError(new Error('socket hang up'))).toBeNull();
    expect(mapPgError(undefined)).toBeNull();
    expect(mapPgError('boom')).toBeNull();
  });
});
