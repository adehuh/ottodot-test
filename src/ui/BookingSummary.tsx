import type { StudentView, TrialClassView } from '@/src/domain/dto';
import { CLASS_SUBJECT_LABEL, formatStartsAt } from './labels';

export function BookingSummary({
  child,
  trialClass,
  priceLabel,
}: {
  child: StudentView | null;
  trialClass: TrialClassView | null;
  priceLabel: string;
}) {
  if (!child || !trialClass) return null;

  return (
    <dl className="rounded border border-slate-300 bg-white p-4 text-sm">
      <div className="flex justify-between py-1">
        <dt className="text-slate-600">Child</dt>
        <dd className="font-medium text-slate-900">{child.name}</dd>
      </div>
      <div className="flex justify-between py-1">
        <dt className="text-slate-600">Class</dt>
        <dd className="font-medium text-slate-900">
          {CLASS_SUBJECT_LABEL[trialClass.subject]} · {trialClass.title}
        </dd>
      </div>
      <div className="flex justify-between py-1">
        <dt className="text-slate-600">Starts</dt>
        <dd className="font-medium text-slate-900">{formatStartsAt(trialClass.startsAt)}</dd>
      </div>
      <div className="flex justify-between border-t border-slate-200 py-1 pt-2">
        <dt className="text-slate-600">Trial price</dt>
        <dd className="font-medium text-slate-900">{priceLabel}</dd>
      </div>
    </dl>
  );
}
