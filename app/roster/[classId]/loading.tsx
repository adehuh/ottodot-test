import { SkeletonRows } from '@/src/ui/SkeletonRows';

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="h-6 w-56 rounded bg-slate-200" aria-hidden="true" />
        <p className="sr-only" role="status">
          Loading roster
        </p>
        <div className="mt-6">
          <SkeletonRows count={4} />
        </div>
      </div>
    </main>
  );
}
