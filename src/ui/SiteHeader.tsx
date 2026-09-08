'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Two audiences, one app, no authentication (a deliberate Tier 3 cut). The
 * header says which one you are looking at, because "parent view" and
 * "teacher view" show the same class and differ only in what they count.
 */
const VIEWS = [
  { href: '/book', label: 'Parent booking', match: (p: string) => p === '/' || p.startsWith('/book') || p.startsWith('/pay') || p.startsWith('/status') },
  { href: '/roster', label: 'Admin roster', match: (p: string) => p.startsWith('/roster') },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 px-1">
      <Link href="/" className="text-[15px] font-bold text-slate-900">
        Ottodot
      </Link>
      <span className="text-[15px] text-slate-500">Trial Class</span>

      <nav aria-label="Views" className="ml-auto flex items-center gap-1.5">
        {VIEWS.map((view) => {
          const active = view.match(pathname);
          return (
            <Link
              key={view.href}
              href={view.href}
              aria-current={active ? 'page' : undefined}
              className={
                active
                  ? 'rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-bold text-teal-700'
                  : 'rounded-full border border-transparent px-3 py-1.5 text-[13px] font-semibold text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700'
              }
            >
              {view.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
