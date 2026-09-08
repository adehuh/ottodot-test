import Link from 'next/link';

/**
 * Shown once a booking is confirmed. The seat only means something if it is
 * visible to the teacher, so this points at the other half of the demo rather
 * than leaving the parent at a dead end.
 *
 * A visible callout, not a hover tooltip: a hover tooltip is invisible on
 * touch and easy to miss on the one screen where there is something to find.
 */
export function RosterNudge({ classId }: { classId: string }) {
  return (
    <div className="relative w-full rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 text-left">
      {/* the pointer that makes this read as a tooltip on the card */}
      <span
        aria-hidden="true"
        className="absolute -top-[7px] left-8 h-3 w-3 rotate-45 border-t border-l border-teal-200 bg-teal-50"
      />
      <p className="text-[13px] font-bold text-teal-800">Now try the other side</p>
      <p className="mt-1 text-[13px] leading-relaxed text-teal-800">
        The seat is only real if the teacher can see it. The admin roster counts confirmed bookings
        only — a declined or pending booking sits below the line and never moves the count.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Link
          href={`/roster/${classId}`}
          className="flex min-h-[44px] items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          This class roster
        </Link>
        <Link
          href="/roster"
          className="flex min-h-[44px] items-center justify-center rounded-lg border border-teal-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-teal-700 hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          All classes — admin view
        </Link>
      </div>
    </div>
  );
}
