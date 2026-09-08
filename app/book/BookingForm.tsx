'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { StudentView, TrialClassView } from '@/src/domain/dto';
import type { ResultCode } from '@/src/domain/result';
import { ChildPicker } from '@/src/ui/ChildPicker';
import { ClassList } from '@/src/ui/ClassList';
import { BookingSummary } from '@/src/ui/BookingSummary';
import { ResultCard, type ResultCardCode } from '@/src/ui/ResultCard';
import { createBookingAction } from '@/app/actions';

export function BookingForm({
  childrenList,
  classes,
  priceLabel,
  alreadyBookedByStudent,
}: {
  childrenList: StudentView[];
  classes: TrialClassView[];
  priceLabel: string;
  /** studentId -> class ids that child already holds a live booking for. */
  alreadyBookedByStudent: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [studentId, setStudentId] = useState<string | null>(null);
  const [trialClassId, setTrialClassId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<ResultCode | ResultCardCode | null>(null);

  const selectedChild = childrenList.find((c) => c.id === studentId) ?? null;
  const selectedClass = classes.find((c) => c.id === trialClassId) ?? null;

  /*
   * Kindness, not enforcement (R7.1). Both reasons below are re-checked by the
   * server: the partial unique index rejects the duplicate and the guarded
   * UPDATE rejects the overbooking, so deleting this function would change
   * nothing about what the system permits.
   */
  const bookedClassIds = studentId ? (alreadyBookedByStudent[studentId] ?? []) : [];
  const disabledReasonFor = (trialClass: TrialClassView): string | null => {
    if (selectedChild && bookedClassIds.includes(trialClass.id)) {
      return `${selectedChild.name} is already booked for this class`;
    }
    if (trialClass.isFull) {
      return `Class full — all ${trialClass.capacity} seats are confirmed`;
    }
    return null;
  };

  const blocked = selectedClass ? disabledReasonFor(selectedClass) !== null : false;
  const ready = Boolean(studentId && trialClassId) && !blocked && !pending;

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
        // A transport failure is not a business outcome (R4.3). Nothing was
        // charged and no booking was created, so say exactly that.
        setErrorCode('UNREACHABLE');
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
        disabledReasonFor={disabledReasonFor}
      />

      <BookingSummary
        childName={selectedChild?.name ?? null}
        trialClass={selectedClass}
        priceLabel={priceLabel}
      />

      <div className="space-y-2">
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          aria-busy={pending}
          /* The accessible name stays "Book trial class" while the visible
             text changes (R7.5). A name that changes mid-submit re-announces
             the button as if it were a different control. */
          aria-label="Book trial class"
          className="min-h-[44px] w-full rounded-lg bg-teal-600 px-5 py-3 text-[15px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:bg-slate-200 disabled:text-slate-400"
        >
          {pending ? 'Creating booking…' : 'Book trial class'}
        </button>
        <p className="text-[13px] text-slate-500">
          {ready || pending
            ? "Selecting a class doesn't reserve the seat. Availability can change until payment is confirmed."
            : 'Choose a child and a class to continue.'}
        </p>
      </div>

      {errorCode ? <ResultCard code={errorCode as ResultCardCode} /> : null}
    </div>
  );
}
