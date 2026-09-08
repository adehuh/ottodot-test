'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { StudentView, TrialClassView } from '@/src/domain/dto';
import type { ResultCode } from '@/src/domain/result';
import { ChildPicker } from '@/src/ui/ChildPicker';
import { ClassList } from '@/src/ui/ClassList';
import { BookingSummary } from '@/src/ui/BookingSummary';
import { ResultCard } from '@/src/ui/ResultCard';
import { createBookingAction } from '@/app/actions';

export function BookingForm({
  childrenList,
  classes,
  priceLabel,
}: {
  childrenList: StudentView[];
  classes: TrialClassView[];
  priceLabel: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [trialClassId, setTrialClassId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ResultCode | 'UNKNOWN' | null>(null);

  const selectedChild = childrenList.find((c) => c.id === studentId) ?? null;
  const selectedClass = classes.find((c) => c.id === trialClassId) ?? null;
  const ready = Boolean(studentId && trialClassId) && !pending;

  function submit() {
    if (!studentId || !trialClassId) return;
    setErrorCode(null);

    startTransition(async () => {
      try {
        const result = await createBookingAction({ studentId, trialClassId });
        if (result.ok) {
          router.push(`/pay/${result.value.id}`);
          return;
        }
        setErrorCode(result.code);
      } catch {
        // A transport failure is not a business outcome (R4.3).
        setErrorCode('UNKNOWN');
      }
    });
  }

  return (
    <div className="space-y-6">
      <ChildPicker
        children={childrenList}
        selectedId={studentId}
        onSelect={setStudentId}
        disabled={pending}
      />

      <ClassList
        classes={classes}
        selectedId={trialClassId}
        onSelect={setTrialClassId}
        disabled={pending}
      />

      <BookingSummary child={selectedChild} trialClass={selectedClass} priceLabel={priceLabel} />

      <button
        type="button"
        onClick={submit}
        disabled={!ready}
        aria-busy={pending}
        className="w-full rounded bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:bg-slate-400"
      >
        {pending ? 'Reserving…' : 'Continue to payment'}
      </button>

      {errorCode ? <ResultCard code={errorCode} /> : null}
    </div>
  );
}
