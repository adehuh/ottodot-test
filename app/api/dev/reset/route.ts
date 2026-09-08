import { getPool } from '@/src/db/pool';
import { seed } from '@/db/seed';

// pg opens TCP sockets, so this route cannot run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Rebuilds the demo state using the *same* seed() the integration tests call
 * (R2.3), so what a reviewer sees and what the tests assert cannot drift.
 *
 * Truncates. That is the point of a reset, and the 404 below is what keeps it
 * away from anything that matters (R4.5).
 */
export async function POST(): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new Response(null, { status: 404 });
  }

  const ids = await seed(getPool());
  return Response.json({ ok: true, ids });
}
