'use client';

import { useState } from 'react';
import Link from 'next/link';

import type { ClassBookingView, ClassRosterView } from '@/src/domain/dto';
import { BOOKING_STATUS_LABEL, CLASS_SUBJECT_LABEL, CLASS_SUBJECT_TAG, formatStartsAt } from './labels';
import { BOOKING_STATUS_BADGE, paymentLabel } from './statusBadges';

function BookingRows({ bookings }: { bookings: ClassBookingView[] }) {
  return (
    <>
      {bookings.map((b) => (
        <tr key={b.bookingId} className="border-b border-slate-200 last:border-0">
          <td className="px-3 py-2.5 font-semibold text-slate-900">{b.studentName}</td>
          <td className="px-3 py-2.5 font-mono text-slate-600">{b.bookingId.slice(-8)}</td>
          <td className="px-3 py-2.5 font-mono text-slate-600">{formatStartsAt(b.createdAt)}</td>
          <td className="px-3 py-2.5 text-slate-600">{b.gradeLevel}</td>
          <td className="px-3 py-2.5">
            <span
              className={`rounded border px-1.5 py-0.5 text-[11px] font-bold ${BOOKING_STATUS_BADGE[b.status]}`}
            >
              {BOOKING_STATUS_LABEL[b.status]}
            </span>
            {b.cancellationReason ? (
              <span className="ml-1.5 font-mono text-[11px] text-slate-500">
                {b.cancellationReason}
              </span>
            ) : null}
          </td>
          <td className="px-3 py-2.5 font-mono text-slate-600">
            {paymentLabel(b.paymentStatus, b.paymentAttempts)}
          </td>
        </tr>
      ))}
    </>
  );
}

function ClassRow({ roster }: { roster: ClassRosterView }) {
  const [expanded, setExpanded] = useState(false);
  const { trialClass, confirmed, other } = roster;
  const pending = other.filter((b) => b.status === 'PENDING_PAYMENT').length;

  return (
    <div className="border-b border-slate-200 last:border-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={`roster-${trialClass.id}`}
        className="grid w-full min-h-[44px] grid-cols-[24px_130px_1fr_150px_90px_150px] items-center gap-2 px-3 py-3 text-left text-[13px] hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-inset"
      >
        <span aria-hidden="true" className="text-slate-400">
          {expanded ? '▾' : '▸'}
        </span>
        <span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${CLASS_SUBJECT_TAG[trialClass.subject]}`}
          >
            {CLASS_SUBJECT_LABEL[trialClass.subject]}
          </span>
        </span>
        <span className="font-semibold text-slate-900">
          {trialClass.title}
          <span className="ml-2 font-normal text-slate-500">
            {formatStartsAt(trialClass.startsAt)}
          </span>
        </span>
        <span className="text-slate-600">{trialClass.teacherName}</span>
        <span className="font-mono font-bold text-slate-900">
          {trialClass.confirmedCount} / {trialClass.capacity}
        </span>
        <span
          className={`text-[12px] font-semibold ${trialClass.isFull ? 'text-slate-500' : 'text-teal-700'}`}
        >
          {trialClass.isFull
            ? 'FULL — no seats available'
            : `${trialClass.seatsLeft} seat${trialClass.seatsLeft === 1 ? '' : 's'} open`}
          {pending > 0 ? (
            <span className="ml-1.5 font-normal text-amber-700">· {pending} pending</span>
          ) : null}
        </span>
      </button>

      {expanded ? (
        <div id={`roster-${trialClass.id}`} className="bg-slate-50 px-3 pt-1 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="bg-slate-100 text-[11px] tracking-wide text-slate-600 uppercase">
                  <th scope="col" className="px-3 py-2 font-bold">Student</th>
                  <th scope="col" className="px-3 py-2 font-bold">Booking</th>
                  <th scope="col" className="px-3 py-2 font-bold">Booked at</th>
                  <th scope="col" className="px-3 py-2 font-bold">Grade</th>
                  <th scope="col" className="px-3 py-2 font-bold">Status</th>
                  <th scope="col" className="px-3 py-2 font-bold">Payment</th>
                </tr>
              </thead>
              <tbody>
                {confirmed.length === 0 && other.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">
                      No bookings for this class yet.
                    </td>
                  </tr>
                ) : (
                  <>
                    <BookingRows bookings={confirmed} />
                    {other.length > 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="border-y border-slate-200 bg-white px-3 py-2 text-[11px] font-bold tracking-widest text-slate-500 uppercase"
                        >
                          Below the line — not on the roster, not counted
                        </td>
                      </tr>
                    ) : null}
                    <BookingRows bookings={other} />
                  </>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-[12px] text-slate-500">
            Pending holds do not count toward {trialClass.confirmedCount} / {trialClass.capacity}.
            They reserve nothing and never expire — only a confirmed booking consumes a seat.
            Failed and cancelled rows are kept for audit and are never on the roster.
          </p>
          <p className="mt-2">
            <Link
              href={`/roster/${trialClass.id}`}
              className="text-[13px] font-semibold text-teal-700 underline hover:text-teal-800"
            >
              Open the printable roster for this class
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ClassRosterList({ rosters }: { rosters: ClassRosterView[] }) {
  if (rosters.length === 0) {
    return (
      <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">
        No trial classes are scheduled.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[880px]">
        <div className="grid grid-cols-[24px_130px_1fr_150px_90px_150px] gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-bold tracking-wide text-slate-600 uppercase">
          <span />
          <span>Subject</span>
          <span>Class / time</span>
          <span>Teacher</span>
          <span>Confirmed</span>
          <span>Status</span>
        </div>
        {rosters.map((roster) => (
          <ClassRow key={roster.trialClass.id} roster={roster} />
        ))}
      </div>
    </div>
  );
}
