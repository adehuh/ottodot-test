import type { TrialClassView } from '@/src/domain/dto';
import { CLASS_SUBJECT_LABEL, formatStartsAt, seatsLabel } from './labels';

/**
 * Full rows are disabled for kindness only (R7.1). No invariant lives here:
 * deleting every check on this page would change nothing about what the
 * system permits, because the confirm transaction re-checks everything.
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

  return (
    <label
      className={`flex items-center gap-3 rounded border p-3 ${
        full
          ? 'cursor-not-allowed border-slate-200 bg-slate-100'
          : 'cursor-pointer border-slate-300 bg-white hover:border-slate-400 has-checked:border-blue-600 has-checked:ring-1 has-checked:ring-blue-600'
      }`}
    >
      <input
        type="radio"
        name="trialClassId"
        value={trialClass.id}
        checked={selectedId === trialClass.id}
        onChange={() => onSelect(trialClass.id)}
        disabled={full}
        className="h-4 w-4"
      />
      <span className="flex-1 text-sm">
        <span className="font-medium text-slate-900">{trialClass.title}</span>
        <span className="block text-slate-600">
          {CLASS_SUBJECT_LABEL[trialClass.subject]} · {trialClass.teacherName} ·{' '}
          {formatStartsAt(trialClass.startsAt)}
        </span>
      </span>
      {/* The words carry the meaning, not the colour. */}
      <span
        className={`shrink-0 text-xs font-medium ${full ? 'text-slate-600' : 'text-slate-700'}`}
      >
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
  if (classes.length === 0) {
    return <p className="text-sm text-slate-600">No trial classes are scheduled.</p>;
  }

  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="mb-2 text-sm font-medium text-slate-900">Which class?</legend>
      <div className="space-y-2">
        {classes.map((trialClass) => (
          <ClassRow
            key={trialClass.id}
            trialClass={trialClass}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </fieldset>
  );
}
