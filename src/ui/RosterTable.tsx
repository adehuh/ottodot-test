import type { RosterView } from '@/src/domain/dto';
import { CLASS_SUBJECT_LABEL, formatStartsAt } from './labels';

export function RosterTable({ roster }: { roster: RosterView }) {
  return (
    <section>
      <h1 className="text-2xl font-semibold text-slate-900">{roster.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {CLASS_SUBJECT_LABEL[roster.subject]} · {roster.teacherName} ·{' '}
        {formatStartsAt(roster.startsAt)}
      </p>

      <p className="mt-4 text-sm font-medium text-slate-900">
        {roster.confirmedCount} of {roster.capacity} seats confirmed
      </p>

      {roster.entries.length === 0 ? (
        <p className="mt-4 rounded border border-slate-300 bg-white p-4 text-sm text-slate-600">
          Nobody is confirmed for this class yet.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-300 text-slate-600">
              <th scope="col" className="py-2 font-medium">
                Child
              </th>
              <th scope="col" className="py-2 font-medium">
                Grade
              </th>
              <th scope="col" className="py-2 font-medium">
                Confirmed
              </th>
            </tr>
          </thead>
          <tbody>
            {roster.entries.map((entry) => (
              <tr key={entry.bookingId} className="border-b border-slate-200">
                <td className="py-2 text-slate-900">{entry.studentName}</td>
                <td className="py-2 text-slate-700">{entry.gradeLevel}</td>
                <td className="py-2 text-slate-700">
                  {entry.confirmedAt ? formatStartsAt(entry.confirmedAt) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
