import { z } from 'zod';

import { getPool } from '@/src/db/pool';
import { getRoster } from '@/src/services/roster';
import { problemResponse } from '@/app/api/problem';

// pg opens TCP sockets, so this route cannot run on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ classId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classId: string }> },
): Promise<Response> {
  const parsed = paramsSchema.safeParse(await params);
  // A malformed id never reaches SQL (R4.4). It maps to NOT_FOUND rather than
  // a new validation code: the result-code list is closed (R4.1) and to a
  // client there is no such class either way.
  if (!parsed.success) return problemResponse('NOT_FOUND');

  const result = await getRoster(getPool(), parsed.data.classId);
  if (!result.ok) return problemResponse(result.code);

  return Response.json(result.value);
}
