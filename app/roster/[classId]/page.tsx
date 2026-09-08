import { notFound } from 'next/navigation';

import { getPool } from '@/src/db/pool';
import { getRoster } from '@/src/services/roster';
import { RosterTable } from '@/src/ui/RosterTable';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unauthenticated, like the rest of the demo. Named as a cut in the README. */
export default async function RosterPage({ params }: { params: Promise<{ classId: string }> }) {
  const { classId } = await params;

  const result = await getRoster(getPool(), classId);
  if (!result.ok) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <RosterTable roster={result.value} />
    </main>
  );
}
