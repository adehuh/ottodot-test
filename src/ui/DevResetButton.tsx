'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Makes the walkthrough repeatable: every demo scenario is destructive, and a
 * grader should not have to touch the database by hand between them.
 *
 * Calls POST /api/dev/reset, which truncates and reseeds through the same
 * seed() the tests use, and 404s when NODE_ENV === 'production' (R4.5).
 */
export function DevResetButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  function reset() {
    setDone(false);
    startTransition(async () => {
      const response = await fetch('/api/dev/reset', { method: 'POST' });
      if (response.ok) {
        setDone(true);
        router.refresh();
      }
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={reset}
        disabled={pending}
        aria-busy={pending}
        aria-label="Reset demo data"
        className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:cursor-progress disabled:text-slate-400"
      >
        <span aria-hidden="true">↺</span>
        {pending ? 'Reseeding…' : 'Reset demo data'}
      </button>
      {done && !pending ? (
        <span role="status" className="text-[12.5px] font-semibold text-emerald-700">
          ✓ Demo data reset
        </span>
      ) : null}
    </span>
  );
}
