import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  readOnly?: boolean;
  /** Optional CSS color override — the Ad Hoc / leave rows tint cells. */
  highlight?: string;
  onSave: (value: number) => void;
  /** Optional pass-through for the clipboard selection wiring in GridView. */
  onMouseDown?: React.MouseEventHandler<HTMLTableCellElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLTableCellElement>;
  /** Extra class appended to the <td> — used to paint the selection ring. */
  selectedClassName?: string;
}

/**
 * A table cell that flips to a numeric input on click, commits on Enter/Tab
 * or blur, cancels on Escape. Keeps a local display value so the grid
 * reflects edits immediately — the optimistic update in the store does the
 * "sync state across all rows" work; this cell just needs to look right in
 * isolation.
 */
export default function EditableCell({
  value,
  readOnly = false,
  highlight,
  onSave,
  onMouseDown,
  onMouseEnter,
  selectedClassName,
}: Props) {
  const [localValue, setLocalValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep localValue in sync when the store reloads fresh data, but not
  // while the user is actively editing (don't overwrite their input).
  useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const startEdit = () => {
    if (readOnly) return;
    setEditText(localValue ? String(localValue) : "");
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(editText.replace(",", "."));
    const newVal = Number.isNaN(parsed) ? 0 : parsed;
    setLocalValue(newVal);
    if (newVal !== value) onSave(newVal);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setEditText(String(localValue));
      setEditing(false);
    }
  };

  const bg = highlight ?? (localValue >= 8 ? "#e8f4e8" : localValue > 0 ? "#fff8e8" : undefined);

  return (
    <td
      onClick={startEdit}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      className={`px-1.5 py-1 text-center border-r border-slate-100 ${readOnly ? "cursor-default text-slate-400" : "cursor-text hover:bg-blue-50"}${selectedClassName ? ` ${selectedClassName}` : ""}`}
      style={{ background: bg, minWidth: 42 }}
    >
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          className="w-full text-center bg-white border border-blue-400 rounded-sm outline-none text-xs px-0.5"
        />
      ) : (
        <span>{localValue || ""}</span>
      )}
    </td>
  );
}
