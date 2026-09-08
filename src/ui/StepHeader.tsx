export function StepHeader({
  step,
  of,
  title,
  subtitle,
}: {
  step: number;
  of: number;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mb-6">
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
        Step {step} of {of}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
    </header>
  );
}
