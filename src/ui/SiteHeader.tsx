'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useRosterHint } from './RosterHint';

/**
 * Two audiences, one app, no authentication (a deliberate Tier 3 cut). The
 * header says which one you are looking at, because "parent view" and
 * "teacher view" show the same class and differ only in what they count.
 */
const VIEWS = [
  {
    href: '/book',
    label: 'Parent booking',
    match: (p: string) =>
      p === '/' || p.startsWith('/book') || p.startsWith('/pay') || p.startsWith('/status'),
  },
  { href: '/roster', label: 'Admin roster', match: (p: string) => p.startsWith('/roster') },
] as const;

/**
 * Sits under the Admin roster tab once a booking is confirmed. A visible
 * callout rather than a hover tooltip: a hover tooltip is invisible on touch
 * and easy to miss on the one screen where there is something to find.
 */
function AdminRosterHint({ classId }: { classId: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-full right-0 z-10 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-teal-200 bg-teal-50 p-4 text-left shadow-sm"
    >
      <span
        aria-hidden="true"
        className="absolute -top-[7px] right-8 h-3 w-3 rotate-45 border-t border-l border-teal-200 bg-teal-50"
      />
      <p className="text-[13px] font-bold text-teal-800">Now try the other side</p>
      <p className="mt-1 text-[13px] leading-relaxed text-teal-800">
        The seat is only real if the teacher can see it. The admin roster counts confirmed bookings
        only — a declined or pending booking sits below the line and never moves the count.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        <Link
          href="/roster"
          className="flex min-h-[40px] items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          Open the admin roster
        </Link>
        <Link
          href={`/roster/${classId}`}
          className="flex min-h-[40px] items-center justify-center rounded-lg border border-teal-200 bg-white px-4 py-2 text-[13px] font-semibold text-teal-700 hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2"
        >
          Just this class
        </Link>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { classId } = useRosterHint();

  return (
    <header className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 px-1">
      <Link href="/" className="text-[15px] font-bold text-slate-900">
        Ottodot
      </Link>
      <span className="text-[15px] text-slate-500">Trial Class</span>

      <nav aria-label="Views" className="relative ml-auto flex items-center gap-1.5">
        {VIEWS.map((view) => {
          const active = view.match(pathname);
          const hinted = classId !== null && view.href === '/roster';

          return (
            <Link
              key={view.href}
              href={view.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-bold text-teal-700'
                  : hinted
                    ? 'rounded-full border border-teal-300 bg-white px-3 py-1.5 text-[13px] font-bold text-teal-700 ring-2 ring-teal-300'
                    : 'rounded-full border border-transparent px-3 py-1.5 text-[13px] font-semibold text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700'
              }
            >
              {view.label}
            </Link>
          );
        })}

        {classId ? <AdminRosterHint classId={classId} /> : null}
      </nav>
    </header>
  );
}
