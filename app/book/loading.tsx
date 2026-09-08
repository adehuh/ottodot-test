import { SkeletonRows } from '@/src/ui/SkeletonRows';

export default function Loading() {
  return (
    <main className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="h-6 w-48 rounded bg-slate-200" aria-hidden="true" />
        <p className="sr-only" role="status">
          Loading trial classes
        </p>
        <div className="mt-6 space-y-6">
          <SkeletonRows count={2} />
          <SkeletonRows count={3} />
        </div>
      </div>
    </main>
  );
}
