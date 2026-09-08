/**
 * R7.7: every list has a loading, empty and error state. Skeleton rows, not a
 * spinner over a blank panel - the shape of what is coming is more useful than
 * the fact that something is coming.
 */
export function SkeletonRows({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-3.5 w-2/5 rounded bg-slate-200" />
          <div className="mt-2.5 h-3 w-3/5 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
