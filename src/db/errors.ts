import type { ResultCode } from '@/src/domain/result';

/**
 * The only file that knows what a Postgres error code means (R4.6).
 *
 * Everything above this line speaks in result codes. Keeping the translation
 * in one place means a 23505 can never reach a parent as a 500, and no
 * service or route handler ever grows a `if (err.code === '23505')`.
 */

const UNIQUE_VIOLATION = '23505';

/** Created by the initial migration. Named here so the mapping is exact. */
export const DUPLICATE_LIVE_BOOKING_INDEX = 'bookings_one_live_per_student_class';

interface PostgresError {
  code: string;
  constraint?: string;
}

function asPostgresError(error: unknown): PostgresError | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (typeof candidate.code !== 'string') return null;
  return {
    code: candidate.code,
    constraint: typeof candidate.constraint === 'string' ? candidate.constraint : undefined,
  };
}

/**
 * Returns the result code this database error *means*, or null if it means
 * nothing to the domain - in which case it is a genuine fault and the caller
 * should let it throw.
 *
 * Deliberately narrow: only the duplicate index maps. A unique violation on
 * parents.email is not a duplicate booking, and returning DUPLICATE for it
 * would show a parent a message about a booking they never made.
 */
export function mapPgError(error: unknown): ResultCode | null {
  const pgError = asPostgresError(error);
  if (!pgError) return null;

  if (pgError.code === UNIQUE_VIOLATION && pgError.constraint === DUPLICATE_LIVE_BOOKING_INDEX) {
    return 'DUPLICATE';
  }

  return null;
}
