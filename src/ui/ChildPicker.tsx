import type { StudentView } from '@/src/domain/dto';

/**
 * A real fieldset and real radios (R7.5), not clickable divs. The input is
 * visually hidden rather than removed, so keyboard selection, screen-reader
 * grouping and form semantics all still work - none of which would survive a
 * list of divs with onClick.
 */
export function ChildPicker({
  children,
  selectedId,
  onSelect,
  disabled,
}: {
  children: StudentView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="mb-2.5 text-sm font-semibold text-slate-900">Who is this for?</legend>

      {children.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
          No children on this account yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {children.map((child) => {
            const selected = selectedId === child.id;
            return (
              <label
                key={child.id}
                className={`min-h-[44px] cursor-pointer rounded-xl border-2 p-3.5 text-left focus-within:ring-2 focus-within:ring-teal-600 focus-within:ring-offset-2 ${
                  selected
                    ? 'border-teal-600 bg-teal-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="studentId"
                  value={child.id}
                  checked={selected}
                  onChange={() => onSelect(child.id)}
                  className="sr-only"
                />
                <span className="block text-sm font-semibold text-slate-900">{child.name}</span>
                <span className="block text-[13px] text-slate-500">{child.gradeLevel}</span>
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
}
