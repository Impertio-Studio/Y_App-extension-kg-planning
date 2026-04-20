import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { callMethod, fetchList } from "../bridge";
import { useKgPlanning } from "../store";

interface Props {
  taskName: string;
  subject: string;
  projectNumber: string;
  projectName: string;
  currentProgress: number;
  budgetHours: number;
  billingType: string;
  onClose: () => void;
}

interface VersionRow {
  creation: string;
  data: string;
}

/**
 * Modal for updating a task's progress %. Fetches the most recent
 * "progress changed" version-log entry and the Timesheet hours logged
 * since, then suggests a new progress based on `old% + (hours/budget *
 * 100)`. The user can accept the suggestion or type their own value.
 *
 * Parity with the SolidJS original — same two side queries, same math,
 * same UI. We do NOT use the custom_planned_hours path (that's the grid
 * cell); this is the task-level progress field.
 */
export default function ProgressPopover({
  taskName,
  subject,
  projectNumber,
  projectName,
  currentProgress,
  budgetHours,
  billingType,
  onClose,
}: Props) {
  const { saveProgress } = useKgPlanning();
  const [newProgress, setNewProgress] = useState<string>(String(currentProgress));
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [hoursSpent, setHoursSpent] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Load version log + Timesheet Detail in parallel once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let sinceDate = "2020-01-01";
      try {
        const versions = await fetchList<VersionRow>("Version", {
          fields: ["creation", "data"],
          filters: [
            ["ref_doctype", "=", "Task"],
            ["ref_name", "=", taskName],
            ["data", "like", "%progress%"],
          ],
          order_by: "creation desc",
          limit_page_length: 1,
        });
        if (cancelled) return;
        const last = versions[0];
        if (last?.creation) {
          sinceDate = last.creation.split(" ")[0] ?? sinceDate;
          setLastUpdateAt(last.creation);
        }
      } catch {
        // Soft-fail: keep default sinceDate and Onbekend label.
      }
      try {
        const result = await callMethod("frappe.client.get_list", {
          doctype: "Timesheet Detail",
          filters: [
            ["task", "=", taskName],
            ["from_time", ">=", sinceDate],
          ],
          fields: ["sum(hours) as total_hours"],
          limit_page_length: 1,
        }) as Array<{ total_hours: number }>;
        if (cancelled) return;
        setHoursSpent(result?.[0]?.total_hours ?? 0);
      } catch {
        setHoursSpent(0);
      }
    })();
    return () => { cancelled = true; };
  }, [taskName]);

  const suggestion =
    budgetHours > 0 && hoursSpent !== null
      ? Math.min(100, Math.round(currentProgress + (hoursSpent / budgetHours) * 100))
      : null;

  const lastUpdateLabel = lastUpdateAt
    ? new Date(lastUpdateAt).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })
    : "Onbekend";

  async function handleSave() {
    const val = parseFloat(newProgress);
    if (Number.isNaN(val) || val < 0 || val > 100) return;
    setSaving(true);
    try {
      await saveProgress(taskName, val);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <strong className="text-slate-800">Voortgang bijwerken</strong>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-100">
          <strong>{projectNumber}</strong> {projectName} · {subject}
        </div>
        <div className="p-4 space-y-3 text-xs">
          <table className="w-full">
            <tbody>
              <Row label="Laatste update:" value={lastUpdateLabel} />
              <Row label="Besteed sinds update:" value={hoursSpent === null ? "…" : `${hoursSpent} uur`} bold />
              <Row label="Urenbudget:" value={budgetHours > 0 ? `${budgetHours} uur` : "—"} />
              <Row label="Type:" value={billingType || "—"} />
              <tr className="border-t border-slate-200">
                <td className="py-1.5 text-slate-500">Huidige voortgang:</td>
                <td className="py-1.5 text-right text-base font-bold text-slate-800">{Math.round(currentProgress)}%</td>
              </tr>
              {suggestion !== null && (
                <tr>
                  <td className="py-1.5 text-slate-500">Voorstel (delta):</td>
                  <td className="py-1.5 text-right text-base font-bold text-green-700">
                    {suggestion}%
                    <span className="ml-1 text-xs text-green-600">
                      (+{(suggestion - currentProgress).toFixed(0)}%)
                    </span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nieuwe voortgang %</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                value={newProgress}
                onChange={(e) => setNewProgress(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-slate-500">%</span>
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded cursor-pointer"
              >
                Annuleer
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
              >
                Opslaan
              </button>
            </div>
          </div>

          {suggestion !== null && (
            <div className="text-[10px] text-slate-400 italic">
              Berekening: {Math.round(currentProgress)}% + ({hoursSpent ?? 0}u / {budgetHours}u × 100) = {suggestion}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <tr>
      <td className="py-1 text-slate-500">{label}</td>
      <td className={`py-1 text-right ${bold ? "font-bold text-slate-800" : "text-slate-700"}`}>{value}</td>
    </tr>
  );
}
