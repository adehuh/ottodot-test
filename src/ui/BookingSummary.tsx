import type { ClassSubject } from '@/src/domain/types';
import { CLASS_SUBJECT_LABEL, formatStartsAt } from './labels';

/**
 * Takes only the fields it shows. It used to take a whole TrialClassView,
 * which forced the payment page to invent a confirmedCount of 0 just to
 * satisfy the type - a fabricated number in a DTO, even an unread one, is a
 * lie waiting to be displayed.
 */
export interface SummaryClass {
  subject: ClassSubject;
  title: string;
  startsAt: string;
}

export function BookingSummary({
  childName,
  trialClass,
  priceLabel,
}: {
  childName: string | null;
  trialClass: SummaryClass | null;
  priceLabel: string;
}) {
  if (!childName || !trialClass) return null;

  return (
    <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <div className="flex justify-between gap-4 py-1">
        <dt className="text-slate-500">Child</dt>
        <dd className="font-semibold text-slate-900">{childName}</dd>
      </div>
      <div className="flex justify-between gap-4 py-1">
        <dt className="text-slate-500">Class</dt>
        <dd className="text-right font-semibold text-slate-900">
          {CLASS_SUBJECT_LABEL[trialClass.subject]} · {trialClass.title}
        </dd>
      </div>
      <div className="flex justify-between gap-4 py-1">
        <dt className="text-slate-500">Starts</dt>
        <dd className="text-right font-semibold text-slate-900">
          {formatStartsAt(trialClass.startsAt)}
        </dd>
      </div>
      <div className="mt-1 flex justify-between gap-4 border-t border-slate-200 py-1 pt-2.5">
        <dt className="text-slate-500">Trial price</dt>
        <dd className="font-semibold text-slate-900">{priceLabel}</dd>
      </div>
    </dl>
  );
}
