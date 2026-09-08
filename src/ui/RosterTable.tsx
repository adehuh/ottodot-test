import type { RosterView } from '@/src/domain/dto';
import { CLASS_SUBJECT_LABEL, CLASS_SUBJECT_TAG, formatStartsAt } from './labels';

/**
 * CONFIRMED only. A pending or failed booking is not a child in the room, and
 * the count here is the same derived count the confirm transaction guards.
 *
 * The table scrolls inside its own container rather than reflowing: staff
 * screens are desktop, and squashing a data table serves no one.
 */
export function RosterTable({ roster }: { roster: RosterView }) {
  const full = roster.confirmedCount >= roster.capacity;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${CLASS_SUBJECT_TAG[roster.subject]}`}
            >
              {CLASS_SUBJECT_LABEL[roster.subject]}
            </span>
            <h1 className="text-xl font-bold text-slate-900">{roster.title}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {formatStartsAt(roster.startsAt)} · {roster.teacherName}
          </p>
        </div>

        <div className="text-right">
          <p className="font-mono text-xl font-bold text-slate-900">
            {roster.confirmedCount} / {roster.capacity}
          </p>
          <p
            className={`mt-0.5 text-[11px] font-bold tracking-wide uppercase ${
              full ? 'text-slate-500' : 'text-teal-700'
            }`}
          >
            {full ? 'Full' : `${roster.capacity - roster.confirmedCount} seats open`}
          </p>
        </div>
      </div>

      <p className="mt-4 border-y border-slate-200 py-3 text-[11px] font-bold tracking-widest text-slate-500 uppercase">
        Roster count includes confirmed bookings only
      </p>

      {roster.entries.length === 0 ? (
        <p className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
          Nobody is confirmed for this class yet.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="bg-slate-100 text-[11px] tracking-wide text-slate-600 uppercase">
                <th scope="col" className="px-3 py-2 font-bold">
                  Student
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Grade
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Confirmed at
                </th>
                <th scope="col" className="px-3 py-2 font-bold">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {roster.entries.map((entry) => (
                <tr key={entry.bookingId} className="border-b border-slate-200">
                  <td className="px-3 py-2.5 font-semibold text-slate-900">{entry.studentName}</td>
                  <td className="px-3 py-2.5 text-slate-600">{entry.gradeLevel}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-600">
                    {entry.confirmedAt ? formatStartsAt(entry.confirmedAt) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700">
                      CONFIRMED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
