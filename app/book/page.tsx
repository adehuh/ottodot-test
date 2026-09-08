import { getPool } from '@/src/db/pool';
import {
  listAlreadyBookedByStudent,
  listChildren,
  listTrialClasses,
} from '@/src/services/catalog';
import { TRIAL_CURRENCY, TRIAL_PRICE_CENTS } from '@/src/domain/types';
import { SEED_IDS } from '@/db/seed';
import { StepHeader } from '@/src/ui/StepHeader';
import { DevResetButton } from '@/src/ui/DevResetButton';
import { BookingForm } from './BookingForm';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Named so a reviewer can reach every state in one pass without editing data. */
const SCENARIOS = [
  'Volcanoes — seats available',
  'Fractions — 3 of 4, the last-seat race',
  'Circuits — full, not selectable',
  'Geometry — a decline consumed no seat',
  'Mei + Volcanoes — duplicate rejected',
];

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

  const alreadyBookedByStudent = await listAlreadyBookedByStudent(
    pool,
    childrenList.map((c) => c.id),
  );

  const priceLabel = `${TRIAL_CURRENCY} ${(TRIAL_PRICE_CENTS / 100).toFixed(2)}`;

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-bold tracking-widest text-teal-700 uppercase">Parent view</p>
        <div className="mt-2" />
        <StepHeader
          current={1}
          title="Book a trial class"
          subtitle="One free trial per child. Pick a child, then a class."
        />
        <div className="mt-6">
          <BookingForm
            childrenList={childrenList}
            classes={classes}
            priceLabel={priceLabel}
            alreadyBookedByStudent={alreadyBookedByStudent}
          />
        </div>
      </div>

      {process.env.NODE_ENV === 'production' ? null : (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="border-y border-slate-200 py-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
            Demo scenarios
          </p>
          <ul className="mt-3 space-y-1 font-mono text-[12.5px] text-slate-600">
            {SCENARIOS.map((scenario) => (
              <li key={scenario}>{scenario}</li>
            ))}
          </ul>
          <div className="mt-4">
            <DevResetButton />
          </div>
        </div>
      )}
    </main>
  );
}
