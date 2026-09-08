import { getPool } from '@/src/db/pool';
import { listClassRosters } from '@/src/services/roster';
import { ClassRosterList } from '@/src/ui/ClassRosterList';
import { BOOKING_STATUS_BADGE } from '@/src/ui/statusBadges';
import { BOOKING_STATUS_LABEL } from '@/src/ui/labels';
import type { BookingStatus } from '@/src/domain/types';

/**
 * Says which stored status puts a child in the room. Only CONFIRMED consumes
 * a seat, which is the whole reason a declined payment can sit in the table
 * below without moving the 3 / 4.
 */
const LEGEND: Array<[BookingStatus, string]> = [
  ['CONFIRMED', 'on the roster, consumes a seat'],
  ['PENDING_PAYMENT', 'not on the roster, reserves nothing'],
  ['PAYMENT_FAILED', 'not on the roster, kept for audit'],
  ['CANCELLED', 'not on the roster, kept for audit'],
];

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Unauthenticated, like the rest of the demo. Named as a cut in the README. */
export default async function RosterIndexPage() {
  const rosters = await listClassRosters(getPool());
  const totalConfirmed = rosters.reduce((n, r) => n + r.trialClass.confirmedCount, 0);

  return (
    <main className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold tracking-widest text-teal-700 uppercase">
              Admin / teacher view
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900">Trial classes — roster</h1>
          </div>
          <p className="text-sm text-slate-500">
            {rosters.length} classes · {totalConfirmed} confirmed bookings
          </p>
        </div>
        <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
          Roster count includes confirmed bookings only — expand a row for the full booking history
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-b border-slate-200 pb-4">
          {LEGEND.map(([status, meaning]) => (
            <div key={status} className="flex items-center gap-2">
              <dt
                className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${BOOKING_STATUS_BADGE[status]}`}
              >
                {BOOKING_STATUS_LABEL[status]}
              </dt>
              <dd className="text-[12.5px] text-slate-500">
                <span aria-hidden="true">→ </span>
                {meaning}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-5">
          <ClassRosterList rosters={rosters} />
        </div>
      </div>
    </main>
  );
}
