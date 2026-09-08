import type { TrialClassView } from '@/src/domain/dto';
import {
  CLASS_SUBJECT_LABEL,
  CLASS_SUBJECT_TAG,
  formatStartsAt,
  seatsBadgeClass,
  seatsLabel,
} from './labels';

/**
 * Full rows are disabled for kindness only (R7.1). No invariant lives here:
 * deleting every check on this page would change nothing about what the
 * system permits, because the confirm transaction re-checks everything.
 *
 * The reason sits in the label text, not in the colour, so a screen reader
 * announces "Class full" rather than leaving grey to carry the meaning.
 */
function ClassRow({
  trialClass,
  selectedId,
  onSelect,
}: {
  trialClass: TrialClassView;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const full = trialClass.isFull;
  const selected = selectedId === trialClass.id;

  return (
    <label
      className={`flex min-h-[44px] flex-col gap-3 rounded-xl p-4 sm:flex-row sm:items-center sm:gap-3.5 focus-within:ring-2 focus-within:ring-teal-600 focus-within:ring-offset-2 ${
        full
          ? 'cursor-not-allowed border border-slate-200 bg-slate-50 opacity-65'
          : selected
            ? 'cursor-pointer border-2 border-teal-600 bg-teal-50'
            : 'cursor-pointer border border-slate-200 bg-white hover:border-teal-300'
      }`}
    >
      <input
        type="radio"
        name="trialClassId"
        value={trialClass.id}
        checked={selected}
        onChange={() => onSelect(trialClass.id)}
        disabled={full}
        className="sr-only"
      />

      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${CLASS_SUBJECT_TAG[trialClass.subject]}`}
          >
            {CLASS_SUBJECT_LABEL[trialClass.subject]}
          </span>
          <span className="text-sm font-semibold text-slate-900">{trialClass.title}</span>
        </span>
        <span className="mt-1 block text-[13px] text-slate-500">
          {formatStartsAt(trialClass.startsAt)} · {trialClass.teacherName}
        </span>
        {full ? (
          <span className="mt-1 block text-[13px] font-medium text-slate-500">
            Class full — all {trialClass.capacity} seats are confirmed
          </span>
        ) : null}
      </span>

      <span className={`shrink-0 ${seatsBadgeClass(trialClass.seatsLeft, full)}`}>
        {seatsLabel(trialClass.seatsLeft, full)}
      </span>
    </label>
  );
}

export function ClassList({
  classes,
  selectedId,
  onSelect,
  disabled,
}: {
  classes: TrialClassView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="mb-2.5 text-sm font-semibold text-slate-900">Available trials</legend>

      {classes.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-900">No trial classes this week</p>
          <p className="mt-1 text-[13px] text-slate-500">New sessions are added every Monday.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {classes.map((trialClass) => (
            <ClassRow
              key={trialClass.id}
              trialClass={trialClass}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </fieldset>
  );
}
