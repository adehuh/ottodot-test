const STEPS = ['Choose class', 'Payment', 'Confirmation'] as const;

function Numeral({ state, index }: { state: 'current' | 'done' | 'upcoming'; index: number }) {
  const base = 'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[11px] font-bold';
  if (state === 'current') return <span className={`${base} bg-teal-600 text-white`}>{index}</span>;
  if (state === 'done') return <span className={`${base} bg-teal-100 text-teal-700`}>✓</span>;
  return <span className={`${base} border border-slate-300 text-slate-500`}>{index}</span>;
}

export function StepHeader({
  current,
  title,
  subtitle,
}: {
  current: 1 | 2 | 3;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="space-y-5">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        {STEPS.map((label, i) => {
          const index = i + 1;
          const state = index === current ? 'current' : index < current ? 'done' : 'upcoming';
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={
                  state === 'current'
                    ? 'flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-[13px] font-bold text-teal-700'
                    : 'flex items-center gap-1.5 px-1 text-[13px] font-semibold text-slate-500'
                }
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <Numeral state={state} index={index} />
                {label}
              </span>
              {index < STEPS.length ? (
                <span aria-hidden="true" className="text-slate-300">
                  →
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="space-y-1">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {subtitle ? <p className="text-sm text-slate-500">{subtitle}</p> : null}
      </div>
    </header>
  );
}
