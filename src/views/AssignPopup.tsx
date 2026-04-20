import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useKgPlanning } from "../store";
import { callMethod, fetchPrivateFileUrl } from "../bridge";
import type { EmployeeData } from "../types";

interface Props {
  taskName: string;
  taskSubject: string;
  assignedEmployees: string[];
  anchor: { x: number; y: number };
  onClose: () => void;
}

/**
 * Inline popup for adding/removing assignees on a Task via Frappe's
 * `frappe.desk.form.assign_to` endpoints. Positioned against a viewport
 * anchor with edge-clamping so it stays fully visible when opened near
 * the right or bottom edge of the grid.
 */
export default function AssignPopup({ taskName, taskSubject, assignedEmployees, anchor, onClose }: Props) {
  const { data, reload } = useKgPlanning();
  const employees = data?.employees ?? [];
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(assignedEmployees));
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: anchor.x, top: anchor.y });

  // Sync local optimistic set if the parent-provided list changes under us
  // (e.g. after reload() completes).
  useEffect(() => {
    setAssigned(new Set(assignedEmployees));
  }, [assignedEmployees]);

  // Outside-click + Escape close. Registered once per open.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Clamp to viewport after first layout — reading offsetWidth/Height is
  // only reliable once React has committed the DOM.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const margin = 8;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let left = anchor.x;
    let top = anchor.y;
    if (left + w > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - w - margin);
    if (top + h > window.innerHeight - margin) top = Math.max(margin, window.innerHeight - h - margin);
    setPos({ left, top });
  }, [anchor.x, anchor.y]);

  async function toggle(emp: EmployeeData) {
    if (!emp.user_id) return;
    if (busy) return;
    const wasAssigned = assigned.has(emp.user_id);
    // Optimistic toggle so the checkbox flips immediately.
    setAssigned((prev) => {
      const next = new Set(prev);
      if (wasAssigned) next.delete(emp.user_id!);
      else next.add(emp.user_id!);
      return next;
    });
    setBusy(emp.user_id);
    try {
      if (wasAssigned) {
        await callMethod("frappe.desk.form.assign_to.remove", {
          doctype: "Task",
          name: taskName,
          assign_to: emp.user_id,
        });
      } else {
        await callMethod("frappe.desk.form.assign_to.add", {
          assign_to: JSON.stringify([emp.user_id]),
          doctype: "Task",
          name: taskName,
          description: taskSubject,
        });
      }
      await reload();
    } catch (err) {
      // Roll back the optimistic flip on failure.
      setAssigned((prev) => {
        const next = new Set(prev);
        if (wasAssigned) next.add(emp.user_id!);
        else next.delete(emp.user_id!);
        return next;
      });
      console.error("[kg-planning] assign toggle failed:", err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      ref={rootRef}
      style={{ position: "fixed", left: pos.left, top: pos.top, width: 240, maxHeight: 380, zIndex: 1000 }}
      className="bg-white border border-slate-200 rounded-md shadow-lg flex flex-col overflow-hidden"
    >
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 flex items-center justify-between">
        <span className="truncate" title={taskSubject}>Toewijzen aan</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="Close">×</button>
      </div>
      <ul className="flex-1 overflow-y-auto py-1">
        {employees.map((e) => (
          <AssignRow
            key={e.name}
            emp={e}
            checked={!!e.user_id && assigned.has(e.user_id)}
            disabled={!e.user_id || busy === e.user_id}
            onToggle={() => toggle(e)}
          />
        ))}
      </ul>
    </div>
  );
}

function AssignRow({ emp, checked, disabled, onToggle }: {
  emp: EmployeeData;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const [avatar, setAvatar] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPrivateFileUrl(emp.image).then((url) => {
      if (!cancelled) setAvatar(url);
    });
    return () => { cancelled = true; };
  }, [emp.image]);

  return (
    <li>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
          disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50 cursor-pointer"
        }`}
        title={emp.user_id ?? "No linked user"}
      >
        <input type="checkbox" checked={checked} readOnly className="cursor-pointer" />
        {avatar ? (
          <img src={avatar} alt="" loading="lazy" className="w-6 h-6 rounded-full object-cover border border-slate-200" />
        ) : (
          <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] text-slate-500">
            {initials(emp.employee_name)}
          </div>
        )}
        <span className="flex-1 truncate">{emp.employee_name}</span>
      </button>
    </li>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
