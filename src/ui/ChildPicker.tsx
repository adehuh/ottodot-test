import type { StudentView } from '@/src/domain/dto';

/**
 * A real fieldset and real radios (R7.5), not clickable divs. Keyboard
 * selection, screen reader grouping and form semantics all come free, and
 * none of them would if this were a list of divs with onClick.
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
  if (children.length === 0) {
    return <p className="text-sm text-slate-600">No children on this account yet.</p>;
  }

  return (
    <fieldset disabled={disabled} className="disabled:opacity-60">
      <legend className="mb-2 text-sm font-medium text-slate-900">Which child?</legend>
      <div className="space-y-2">
        {children.map((child) => (
          <label
            key={child.id}
            className="flex cursor-pointer items-center gap-3 rounded border border-slate-300 bg-white p-3 hover:border-slate-400 has-checked:border-blue-600 has-checked:ring-1 has-checked:ring-blue-600"
          >
            <input
              type="radio"
              name="studentId"
              value={child.id}
              checked={selectedId === child.id}
              onChange={() => onSelect(child.id)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-900">
              {child.name} <span className="text-slate-500">· {child.gradeLevel}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
