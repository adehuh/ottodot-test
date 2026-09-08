import { getPool } from '@/src/db/pool';
import { listChildren, listTrialClasses } from '@/src/services/catalog';
import { TRIAL_CURRENCY, TRIAL_PRICE_CENTS } from '@/src/domain/types';
import { SEED_IDS } from '@/db/seed';
import { StepHeader } from '@/src/ui/StepHeader';
import { BookingForm } from './BookingForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * There is no authentication (a deliberate Tier 3 cut): the parent is a query
 * param, defaulting to a seeded one so the demo works with no setup.
 */
export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{ parentId?: string }>;
}) {
  const { parentId } = await searchParams;
  const pool = getPool();

  const [childrenList, classes] = await Promise.all([
    listChildren(pool, parentId ?? SEED_IDS.parents.tan),
    listTrialClasses(pool),
  ]);

  const priceLabel = `${TRIAL_CURRENCY} ${(TRIAL_PRICE_CENTS / 100).toFixed(2)}`;

  return (
    <main className="mx-auto max-w-xl p-6">
      <StepHeader
        step={1}
        of={3}
        title="Book a trial class"
        subtitle="Pick a child and a class. Seats are only held once payment succeeds."
      />
      <BookingForm childrenList={childrenList} classes={classes} priceLabel={priceLabel} />
    </main>
  );
}
