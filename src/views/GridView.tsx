import { useEffect, useMemo, useRef, useState } from "react";
import { useKgPlanning } from "../store";
import { generateWeeksFromNow, getCurrentWeek, type WeekInfo } from "../utils/weeks";
import { getPhaseColors, plannedColor, plannedPercentage } from "../utils/phases";
import { getFirstName } from "../utils/helpers";
import { getErpNextAppUrl, fetchPrivateFileUrl } from "../bridge";
import type { TaskData, EmployeeData } from "../types";
import EditableCell from "./EditableCell";
import ProgressPopover from "./ProgressPopover";
import AssignPopup from "./AssignPopup";
import { type CellRange, normalizeRange, toClipboardText, parseClipboard, rangeContains } from "../utils/clipboard";
import { useColumnResize } from "../utils/useColumnResize";

/* ─── Total-row capacity coloring ─── */
// Mirrors totalCellStyle() in the SolidJS original. Orange under,
// green sweet-spot, red over. Kept in a single function so the GridView
// render path stays readable.
function totalCellStyle(hours: number, contract: number): { background?: string; color?: string } {
  if (hours === 0 || contract === 0) return {};
  const diff = hours - contract;
  if (diff <= -8) return { background: "#f57c00", color: "white" };
  if (diff < -2) {
    const t = (diff + 8) / 6;
    const r = Math.round(245 - t * 100);
    const g = Math.round(124 + t * 100);
    const b = Math.round(0 + t * 70);
    return { background: `rgb(${r},${g},${b})`, color: diff < -4 ? "white" : "#333" };
  }
  if (diff <= 2) return { background: "#4caf50", color: "white" };
  if (diff <= 4) {
    const t = (diff - 2) / 2;
    const r = Math.round(76 + t * 168);
    const g = Math.round(175 - t * 130);
    const b = Math.round(80 - t * 60);
    return { background: `rgb(${r},${g},${b})`, color: "white" };
  }
  return { background: "#d32f2f", color: "white" };
}

/* ─── Row model ─── */
interface TaskRow {
  kind: "task";
  task: TaskData;
  projectNumber: string;
  projectName: string;
  coordinator: string;
  /** Weekly hours map filtered by selected employee (or all if none). */
  hours: Map<string, number>;
  /** First task within its project group — gets the project-number/name cell. */
  isFirstOfProject: boolean;
  /** Row count for rowSpan on the first cell (1 if single-phase project). */
  projectRowSpan: number;
}

interface SectionHeader {
  kind: "internal-header";
}

type Row = TaskRow | SectionHeader;

const CURRENT = getCurrentWeek();
/** Internal project numbers that represent leave rather than billable work. */
const LEAVE_PROJECT_NUMBERS = new Set(["1020", "1030", "1040", "1050"]);

/* ─── Left-pane resizable columns ─── */
// Order here is the render order in the sticky left pane. `id` is the
// persistence key (do not rename after release). `default` is the original
// pre-resize width in pixels; a user resize overrides this via localStorage.
interface GridCol {
  id: string;
  label: string;
  title?: string;
  default: number;
}
const LEFT_COLS_BASE: GridCol[] = [
  { id: "nr",       label: "Nr",       default: 56  },
  { id: "project",  label: "Project",  default: 180 },
  { id: "phase",    label: "Fase",     default: 68  },
  { id: "coord",    label: "Verantw.", default: 80  },
  { id: "medew",    label: "Medew.",   default: 50, title: "Toegewezen medewerkers" },
  { id: "budget",   label: "Budget",   default: 56  },
  { id: "progress", label: "Voortg.",  default: 56, title: "Werkelijke voortgang" },
  { id: "planned",  label: "Ingepl.",  default: 56, title: "Som ingeplande uren" },
];

export default function GridView() {
  const {
    data,
    selectedEmployee,
    selectedProject,
    selectedStatus,
    savePlannedHours,
    getProjectByName,
    getEmployeeById,
    isInternalProject,
  } = useKgPlanning();

  const [progressFor, setProgressFor] = useState<TaskRow | null>(null);
  const [assignFor, setAssignFor] = useState<{ task: TaskData; anchor: { x: number; y: number } } | null>(null);

  // The Medew. column is hidden when filtering to a specific employee —
  // the avatar stack becomes irrelevant once the view is narrowed to one
  // person. `__unplanned__` still shows it (the avatar slot is empty and
  // the "+" button is the whole UI for that filter mode).
  const showMedewCol = !selectedEmployee || selectedEmployee === "__unplanned__";
  const LEFT_COLS = useMemo(
    () => LEFT_COLS_BASE.filter((c) => c.id !== "medew" || showMedewCol),
    [showMedewCol],
  );

  // Drag-resizable sticky left columns. Widths persist per-instance in
  // localStorage; a missing entry falls back to the `default` from LEFT_COLS.
  const { widths, startResize } = useColumnResize({ storageKey: "kg-grid-col-widths" });
  const colGeom = useMemo(() => {
    const byId = new Map<string, { id: string; width: number; left: number }>();
    const out: { id: string; width: number; left: number }[] = [];
    let acc = 0;
    for (const c of LEFT_COLS) {
      const w = widths[c.id] ?? c.default;
      const entry = { id: c.id, width: w, left: acc };
      out.push(entry);
      byId.set(c.id, entry);
      acc += w;
    }
    return { cols: out, byId, totalLeft: acc };
  }, [widths, LEFT_COLS]);
  const col = (id: string) => {
    const g = colGeom.byId.get(id);
    if (!g) throw new Error(`Unknown column id: ${id}`);
    return g;
  };

  // Clipboard selection: rectangular range expressed in GridView row/col
  // indices. `row` is the index into `rows[]` (not `taskRows[]`), so a
  // `kind === "task"` guard is required wherever we dereference.
  const [selection, setSelection] = useState<CellRange | null>(null);
  const selectionAnchorRef = useRef<{ row: number; col: number } | null>(null);

  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];

  // 1 week back, 26 forward — tighter window than the Team/Gantt views.
  const weeks = useMemo<WeekInfo[]>(() => generateWeeksFromNow(26, 1), []);

  const rows = useMemo<Row[]>(() => {
    // Status filter is applied before we build the allowed-projects set so
    // tasks belonging to e.g. Completed / Hold projects disappear from the
    // grid entirely when a status filter is active.
    const filteredProjects = selectedStatus ? projects.filter((p) => p.status === selectedStatus) : projects;
    const openProjectNames = new Set(filteredProjects.map((p) => p.name));

    // Filter: only open projects, not done, match project filter, and
    // (if employee filter is active) the task must have that employee
    // in its _assign list. Matches the SolidJS semantics.
    const filtered = tasks.filter((t) => {
      if (!openProjectNames.has(t.project)) return false;
      if (t.progress >= 100) return false;
      if (selectedProject && t.project !== selectedProject) return false;
      if (selectedEmployee === "__unplanned__") {
        if (t.assigned_employees && t.assigned_employees.length > 0) return false;
      } else if (selectedEmployee && t.assigned_employees && !t.assigned_employees.includes(selectedEmployee)) {
        return false;
      }
      return true;
    });

    // Group by project
    const byProject = new Map<string, TaskData[]>();
    for (const t of filtered) {
      const list = byProject.get(t.project) ?? [];
      list.push(t);
      byProject.set(t.project, list);
    }

    // Split into regular vs internal and sort each by project number.
    const regular: Array<[string, TaskData[]]> = [];
    const internalWork: Array<[string, TaskData[]]> = [];
    const internalLeave: Array<[string, TaskData[]]> = [];
    for (const [projName, projTasks] of byProject) {
      const p = getProjectByName(projName);
      const num = p?.custom_project_number ?? "";
      if (isInternalProject(num)) {
        if (LEAVE_PROJECT_NUMBERS.has(num)) internalLeave.push([projName, projTasks]);
        else internalWork.push([projName, projTasks]);
      } else {
        regular.push([projName, projTasks]);
      }
    }
    const byProjectNumber = (a: [string, TaskData[]], b: [string, TaskData[]]) => {
      const ap = getProjectByName(a[0])?.custom_project_number ?? "";
      const bp = getProjectByName(b[0])?.custom_project_number ?? "";
      return ap.localeCompare(bp);
    };
    regular.sort(byProjectNumber);
    internalWork.sort(byProjectNumber);
    internalLeave.sort(byProjectNumber);

    const buildHoursMap = (task: TaskData) => {
      const map = new Map<string, number>();
      for (const row of task.custom_planned_hours ?? []) {
        if (selectedEmployee && row.employee !== selectedEmployee) continue;
        map.set(row.week_start, (map.get(row.week_start) ?? 0) + row.planned_hours);
      }
      return map;
    };

    const toRows = (group: Array<[string, TaskData[]]>): TaskRow[] => {
      const out: TaskRow[] = [];
      for (const [projName, projTasks] of group) {
        const p = getProjectByName(projName);
        const projectNumber = p?.custom_project_number ?? "";
        const projectName = p?.project_name ?? projName;
        const coordinator = p?.custom_project_manager
          ? getFirstName(getEmployeeById(p.custom_project_manager)?.employee_name ?? "")
          : "";
        projTasks.forEach((task, i) => {
          out.push({
            kind: "task",
            task,
            projectNumber,
            projectName,
            coordinator,
            hours: buildHoursMap(task),
            isFirstOfProject: i === 0,
            projectRowSpan: i === 0 ? projTasks.length : 0,
          });
        });
      }
      return out;
    };

    const result: Row[] = [...toRows(regular)];
    if (internalWork.length > 0 || internalLeave.length > 0) {
      result.push({ kind: "internal-header" });
      result.push(...toRows(internalWork));
      result.push(...toRows(internalLeave));
    }
    return result;
  }, [tasks, projects, selectedEmployee, selectedProject, selectedStatus, getProjectByName, getEmployeeById, isInternalProject]);

  // Week totals across all rows. useMemo rebuilds on every row change,
  // which is every optimistic edit — O(rows × weeks) is fine for the
  // data sizes we're working with (low hundreds of rows).
  const weekTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (r.kind !== "task") continue;
      for (const [week, hours] of r.hours) {
        totals.set(week, (totals.get(week) ?? 0) + hours);
      }
    }
    return totals;
  }, [rows]);

  const contractHours = useMemo(() => {
    if (!selectedEmployee) return 40;
    return getEmployeeById(selectedEmployee)?.custom_contract_hours_per_week ?? 40;
  }, [selectedEmployee, getEmployeeById]);

  function handleSaveCell(row: TaskRow, weekIso: string, value: number) {
    const emp = selectedEmployee;
    if (!emp || emp === "__unplanned__") {
      alert("Selecteer eerst een medewerker om uren in te plannen.");
      return;
    }
    const empData = getEmployeeById(emp);
    if (!empData) return;
    savePlannedHours(row.task.name, emp, empData.employee_name, weekIso, value);
  }

  // Global mouseup: freeze the drag-selection by clearing the anchor so
  // subsequent onMouseEnter calls on other cells don't extend the range.
  useEffect(() => {
    const handler = () => {
      selectionAnchorRef.current = null;
    };
    window.addEventListener("mouseup", handler);
    return () => window.removeEventListener("mouseup", handler);
  }, []);

  // Ctrl/Cmd+C and Ctrl/Cmd+V on the active selection. Copy reads from the
  // current in-memory `rows[].hours` map; paste writes via the existing
  // debounced savePlannedHours path so the optimistic render stays in sync.
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable)) return;
      if (!selection) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const norm = normalizeRange(selection);

      if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        const data: number[][] = [];
        for (let r = norm.startRow; r <= norm.endRow; r++) {
          const taskRow = rows[r];
          if (taskRow?.kind !== "task") continue;
          const rowVals: number[] = [];
          for (let c = norm.startCol; c <= norm.endCol; c++) {
            rowVals.push(taskRow.hours.get(weeks[c]?.isoDate ?? "") ?? 0);
          }
          data.push(rowVals);
        }
        try {
          await navigator.clipboard.writeText(toClipboardText(data));
        } catch (err) {
          console.warn("[kg-planning] clipboard write failed:", err);
        }
      }

      if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        let text = "";
        try {
          text = await navigator.clipboard.readText();
        } catch (err) {
          console.warn("[kg-planning] clipboard read failed:", err);
          return;
        }
        const grid = parseClipboard(text);
        if (grid.length === 0) return;
        for (let rr = 0; rr < grid.length; rr++) {
          const taskRow = rows[norm.startRow + rr];
          if (!taskRow || taskRow.kind !== "task") continue;
          // Destination employee: current filter if set (and not the
          // synthetic __unplanned__ sentinel), else the task's first
          // assigned employee. Multi-employee paste is out of scope.
          const filterEmp = selectedEmployee === "__unplanned__" ? null : selectedEmployee;
          const selectedEmpId = filterEmp ?? taskRow.task.assigned_employees?.[0];
          if (!selectedEmpId) continue;
          const emp = getEmployeeById(selectedEmpId);
          if (!emp) continue;
          for (let cc = 0; cc < grid[rr].length; cc++) {
            const week = weeks[norm.startCol + cc];
            if (!week) continue;
            savePlannedHours(taskRow.task.name, emp.name, emp.employee_name, week.isoDate, grid[rr][cc]);
          }
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selection, rows, weeks, selectedEmployee, getEmployeeById, savePlannedHours]);

  const erpUrl = getErpNextAppUrl();

  return (
    <div className="p-3">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            {LEFT_COLS.map((c, i) => {
              const g = colGeom.cols[i];
              return (
                <StickyTh
                  key={c.id}
                  left={g.left}
                  style={{ width: g.width, minWidth: g.width }}
                  title={c.title}
                  className="relative"
                >
                  {c.label}
                  <div
                    className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-teal-400"
                    onMouseDown={(e) => startResize(c.id, e)}
                  />
                </StickyTh>
              );
            })}
            {weeks.map((w) => (
              <th
                key={w.isoDate}
                className={`px-1.5 py-1 text-center font-medium border-b border-slate-200 min-w-[44px] ${
                  w.week === CURRENT.week && w.year === CURRENT.year ? "bg-blue-100" : ""
                }`}
              >
                <div>{w.label}</div>
                <div className="text-[10px] text-slate-400 font-normal">{w.dateLabel}</div>
              </th>
            ))}
          </tr>
          {/* TOTAAL row — lives in <thead> so it stays pinned under the week labels */}
          <tr className="bg-slate-50 font-semibold">
            <th colSpan={LEFT_COLS.length} className="sticky left-0 bg-slate-50 px-3 py-2 text-left z-10 border-b border-slate-200">
              TOTAAL uren
            </th>
            {weeks.map((w) => {
              const total = weekTotals.get(w.isoDate) ?? 0;
              const style = totalCellStyle(total, contractHours);
              return (
                <th
                  key={w.isoDate}
                  className="px-1.5 py-1 text-center border-b border-slate-200"
                  style={{ ...style, fontWeight: 700 }}
                >
                  {total || ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            if (row.kind === "internal-header") {
              return (
                <tr key={`header-${i}`} className="bg-slate-100 border-y border-slate-300">
                  <td colSpan={LEFT_COLS.length + weeks.length} className="px-3 py-1.5 text-xs font-bold text-slate-700">
                    Interne uren
                  </td>
                </tr>
              );
            }
            const { task, projectNumber, projectName, coordinator, hours, isFirstOfProject, projectRowSpan } = row;
            const colors = getPhaseColors(task.phaseCode);
            const isSubRow = !isFirstOfProject;
            const totalPlanned = Array.from(hours.values()).reduce((s, v) => s + v, 0);
            const pct = plannedPercentage(totalPlanned, task.custom_budget_hours, task.progress);

            return (
              <tr key={task.name} className="border-b border-slate-100 hover:bg-slate-50/60">
                {isFirstOfProject && (
                  <>
                    <StickyTd
                      left={col("nr").left}
                      rowSpan={projectRowSpan}
                      className="font-semibold align-top"
                      style={{ width: col("nr").width, minWidth: col("nr").width }}
                    >
                      {projectNumber}
                    </StickyTd>
                    <StickyTd
                      left={col("project").left}
                      rowSpan={projectRowSpan}
                      className="font-semibold align-top cursor-pointer hover:text-blue-600"
                      title={projectName}
                      onClick={() => window.open(`${erpUrl}/app/project/${task.project}`, "_blank")}
                      style={{ width: col("project").width, minWidth: col("project").width }}
                    >
                      {projectName}
                    </StickyTd>
                  </>
                )}
                <StickyTd
                  left={col("phase").left}
                  className="align-top cursor-pointer"
                  title={task.subject}
                  onClick={() => window.open(`${erpUrl}/app/task/${task.name}`, "_blank")}
                  style={{ width: col("phase").width, minWidth: col("phase").width }}
                >
                  <span
                    className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ background: colors.badge, color: "white" }}
                  >
                    {task.phaseCode ?? "?"}
                  </span>
                </StickyTd>
                {isFirstOfProject && (
                  <StickyTd
                    left={col("coord").left}
                    rowSpan={projectRowSpan}
                    className="text-slate-600 align-top"
                    style={{ width: col("coord").width, minWidth: col("coord").width }}
                  >
                    {coordinator}
                  </StickyTd>
                )}
                {showMedewCol && (
                  <StickyTd
                    left={col("medew").left}
                    className="align-top"
                    style={{ width: col("medew").width, minWidth: col("medew").width }}
                  >
                    <AvatarStack
                      task={task}
                      employees={data?.employees ?? []}
                      onAdd={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setAssignFor({ task, anchor: { x: r.right + 4, y: r.top } });
                      }}
                    />
                  </StickyTd>
                )}
                <StickyTd
                  left={col("budget").left}
                  className="text-slate-600 align-top"
                  style={{ width: col("budget").width, minWidth: col("budget").width }}
                >
                  {task.custom_budget_hours ? `${task.custom_budget_hours}u` : ""}
                </StickyTd>
                <StickyTd
                  left={col("progress").left}
                  className="align-top cursor-pointer"
                  style={{ background: "#e8f4e8", width: col("progress").width, minWidth: col("progress").width }}
                  title="Klik om voortgang bij te werken"
                  onClick={() => setProgressFor(row)}
                >
                  {Math.round(task.progress || 0)}%
                </StickyTd>
                <StickyTd
                  left={col("planned").left}
                  className="align-top"
                  style={{ color: plannedColor(pct), width: col("planned").width, minWidth: col("planned").width }}
                >
                  {pct > 0 ? `${pct}%` : ""}
                </StickyTd>
                {weeks.map((w, wi) => {
                  const taskIdx = i;
                  const weekIdx = wi;
                  const isSelected = selection ? rangeContains(selection, taskIdx, weekIdx) : false;
                  return (
                    <EditableCell
                      key={w.isoDate}
                      value={hours.get(w.isoDate) ?? 0}
                      readOnly={isSubRow ? false : false}
                      onSave={(v) => handleSaveCell(row, w.isoDate, v)}
                      onMouseDown={(e) => {
                        if (e.button !== 0 || e.shiftKey) return;
                        selectionAnchorRef.current = { row: taskIdx, col: weekIdx };
                        setSelection({ startRow: taskIdx, startCol: weekIdx, endRow: taskIdx, endCol: weekIdx });
                      }}
                      onMouseEnter={(e) => {
                        if (!(e.buttons & 1) || !selectionAnchorRef.current) return;
                        const a = selectionAnchorRef.current;
                        setSelection({ startRow: a.row, startCol: a.col, endRow: taskIdx, endCol: weekIdx });
                      }}
                      selectedClassName={isSelected ? "ring-2 ring-teal-400 ring-inset" : undefined}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {progressFor && (
        <ProgressPopover
          taskName={progressFor.task.name}
          subject={progressFor.task.subject}
          projectNumber={progressFor.projectNumber}
          projectName={progressFor.projectName}
          currentProgress={progressFor.task.progress}
          budgetHours={progressFor.task.custom_budget_hours}
          billingType={progressFor.task.custom_billing_type}
          onClose={() => setProgressFor(null)}
        />
      )}

      {assignFor && (
        <AssignPopup
          taskName={assignFor.task.name}
          taskSubject={assignFor.task.subject}
          assignedEmployees={assignFor.task.assigned_employees ?? []}
          anchor={assignFor.anchor}
          onClose={() => setAssignFor(null)}
        />
      )}
    </div>
  );
}

/* ─── Avatar stack + "+" assign button ─── */
// Rendered inside the Medew. column. The task.assigned_employees list is
// user emails (Frappe _assign semantics), so we resolve them back to
// Employee.image via the user_id → employee map.
function AvatarStack({
  task,
  employees,
  onAdd,
}: {
  task: TaskData;
  employees: EmployeeData[];
  onAdd: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const byUserId = useMemo(() => {
    const m = new Map<string, EmployeeData>();
    for (const e of employees) if (e.user_id) m.set(e.user_id, e);
    return m;
  }, [employees]);

  const assigned = (task.assigned_employees ?? []).map((uid) => byUserId.get(uid)).filter((e): e is EmployeeData => !!e);

  return (
    <div className="flex items-center gap-0">
      <div className="flex items-center">
        {assigned.map((emp, i) => (
          <AvatarThumb key={emp.name} emp={emp} offsetLeft={i === 0 ? 0 : -3} />
        ))}
      </div>
      <button
        onClick={onAdd}
        className="ml-1 w-5 h-5 rounded-full bg-slate-100 border border-slate-300 text-slate-600 text-[12px] leading-none flex items-center justify-center hover:bg-slate-200 cursor-pointer"
        title="Medewerker toewijzen"
        aria-label="Assign employee"
      >
        +
      </button>
    </div>
  );
}

function AvatarThumb({ emp, offsetLeft }: { emp: EmployeeData; offsetLeft: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPrivateFileUrl(emp.image).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => { cancelled = true; };
  }, [emp.image]);

  const title = emp.employee_name;
  const style = { marginLeft: offsetLeft } as const;
  if (src) {
    return <img src={src} alt={title} title={title} loading="lazy" className="w-[18px] h-[18px] rounded-full object-cover border border-white" style={style} />;
  }
  return (
    <div
      title={title}
      className="w-[18px] h-[18px] rounded-full bg-slate-300 border border-white flex items-center justify-center text-[9px] font-semibold text-slate-700"
      style={style}
    >
      {initials(emp.employee_name)}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ─── Sticky header / body cells for the left pane ─── */
// Uses `position: sticky` instead of two synced scroll panels — simpler,
// doesn't need scroll-sync or row-height-sync code. The `left` prop is the
// cumulative offset from the left edge.

function StickyTh({ children, className = "", left, ...rest }: React.ThHTMLAttributes<HTMLTableCellElement> & { left: number; children?: React.ReactNode }) {
  return (
    <th
      {...rest}
      className={`sticky px-2 py-2 text-left font-semibold bg-slate-100 border-b border-slate-200 ${className}`}
      style={{ left, zIndex: 10, ...rest.style }}
    >
      {children}
    </th>
  );
}

function StickyTd({
  children,
  className = "",
  left,
  rowSpan,
  onClick,
  style,
  title,
}: {
  children?: React.ReactNode;
  className?: string;
  left: number;
  rowSpan?: number;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
  style?: React.CSSProperties;
  title?: string;
}) {
  return (
    <td
      rowSpan={rowSpan}
      onClick={onClick}
      title={title}
      className={`sticky px-2 py-1.5 bg-white border-r border-slate-100 ${className}`}
      style={{ left, zIndex: 5, ...style }}
    >
      {children}
    </td>
  );
}
