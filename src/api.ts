/**
 * KG Planning data layer.
 *
 * Replaces the SolidJS app's custom-method call (`get_planning_data`)
 * with three parallel standard ERPNext list reads through Y-app's
 * multi-instance bridged proxy. No client-side API token, no
 * doctype-specific server code required — only the custom fields on
 * Task / Employee / Project need to exist on the target instance.
 *
 * All credentials live in the Y-app vault; every request carries the
 * current Y-app session cookie + the X-Y-App-Instance header that
 * lib/erpnext.ts attaches.
 */

import { fetchList, updateDocument, fetchDocument, callMethod, ApiError } from "./bridge";
import { extractPhaseCode } from "./utils/phases";
import type { TaskData, EmployeeData, ProjectData, PlannedHourRow, LeaveData, LoadResult } from "./types";

const TASK_FIELDS = [
  "name",
  "subject",
  "project",
  "progress",
  "custom_billing_type",
  "custom_budget_hours",
  "custom_phase_code",
  "_assign", // Frappe virtual field: JSON-encoded list of assigned users
];

// Per-task hydration fan-out is capped so we don't exhaust the browser
// resource pool. Without a cap, 200+ tasks produced simultaneous GETs and
// Chrome returned `ERR_INSUFFICIENT_RESOURCES` mid-flight. HTTP/2 has no
// per-origin protocol cap, so we aim well above the old HTTP/1.1 limit of
// 6 while staying comfortably below Chrome's total resource ceiling
// (~256). The proper fix is still a single `Task Planned Hours` list
// query — requires child-doctype read permission on ERPNext.
const TASK_FETCH_CONCURRENCY = 20;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

const EMPLOYEE_FIELDS = [
  "name",
  "employee_name",
  "custom_contract_days_per_week",
  "custom_contract_hours_per_week",
  "custom_department_function",
  "image",
  "user_id",
];

const PROJECT_FIELDS = [
  "name",
  "project_name",
  "custom_project_number",
  "custom_project_manager",
  "status",
];

/** Detect "field doesn't exist" style errors coming back from ERPNext.
 *  Frappe returns either HTTP 417 or a `SyntaxError: Field ... not found`
 *  shaped `exc` depending on version; match both. */
function isMissingFieldError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("field") && (msg.includes("not found") || msg.includes("does not exist") || msg.includes("unknown column"));
}

/** Phase 1: load tasks + employees + projects with empty child-row arrays.
 *  Cheap (3 parallel list calls) so the grid can render immediately while
 *  phase 2 hydrates the planned-hours cells. */
export async function loadPlanningSkeleton(): Promise<LoadResult> {
  try {
    const [rawTasks, rawEmployees, rawProjects] = await Promise.all([
      fetchList<Omit<TaskData, "custom_planned_hours" | "phaseCode" | "assigned_employees">>("Task", {
        fields: TASK_FIELDS,
        limit_page_length: 0,
      }),
      fetchList<EmployeeData>("Employee", {
        fields: EMPLOYEE_FIELDS,
        filters: [["status", "=", "Active"]],
        limit_page_length: 0,
      }),
      fetchList<ProjectData>("Project", {
        fields: PROJECT_FIELDS,
        limit_page_length: 0,
      }),
    ]);

    const tasks: TaskData[] = rawTasks.map((t) => {
      const rawAssign = (t as unknown as { _assign?: string })._assign;
      let assignedEmployees: string[] = [];
      if (rawAssign) {
        try { assignedEmployees = JSON.parse(rawAssign) as string[]; }
        catch { assignedEmployees = []; }
      }
      return {
        ...t,
        custom_planned_hours: [],
        assigned_employees: assignedEmployees,
        phaseCode: extractPhaseCode(t.custom_phase_code || "") || extractPhaseCode(t.subject || ""),
      };
    });

    return { kind: "ok", data: { tasks, employees: rawEmployees, projects: rawProjects } };
  } catch (err) {
    if (isMissingFieldError(err)) {
      return { kind: "not_configured", missing: ["Task.custom_*", "Employee.custom_*", "Project.custom_*"] };
    }
    if (err instanceof ApiError && err.status === 403) {
      return { kind: "error", message: `Permission denied: ${err.message}` };
    }
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Phase 2: fetch the child-table `custom_planned_hours` for each task with
 *  capped concurrency. Streams one result at a time via the `onTask`
 *  callback so the store can update the grid as rows arrive rather than
 *  waiting for all N fetches to complete. `signal` lets the caller cancel
 *  on unmount / re-trigger. */
export async function hydratePlannedHours(
  taskNames: string[],
  onTask: (name: string, rows: PlannedHourRow[]) => void,
  signal?: AbortSignal,
): Promise<void> {
  await mapWithConcurrency(taskNames, TASK_FETCH_CONCURRENCY, async (name) => {
    if (signal?.aborted) return;
    try {
      const full = await fetchDocument<{ custom_planned_hours?: PlannedHourRow[] }>("Task", name);
      if (signal?.aborted) return;
      onTask(name, full.custom_planned_hours || []);
    } catch {
      // Soft-fail per task: a single broken task shouldn't nuke the grid.
      if (!signal?.aborted) onTask(name, []);
    }
  });
}

/** Back-compat wrapper: some call sites may still expect the combined shape.
 *  The store uses the split loaders directly. */
export async function loadPlanningData(): Promise<LoadResult> {
  const skeleton = await loadPlanningSkeleton();
  if (skeleton.kind !== "ok") return skeleton;
  const byName = new Map(skeleton.data.tasks.map((t) => [t.name, t]));
  await hydratePlannedHours(
    skeleton.data.tasks.map((t) => t.name),
    (name, rows) => {
      const t = byName.get(name);
      if (t) t.custom_planned_hours = rows;
    },
  );
  return skeleton;
}

/** Write a single planned-hours cell. Full child-table round-trip: fetch
 *  current rows, splice in the change, PUT back. The 500ms debounce that
 *  the SolidJS app did lives in the store, not here — this function is
 *  the atomic "actually save" primitive. */
export async function savePlannedHours(
  taskName: string,
  employee: string,
  employeeName: string,
  weekStart: string,
  hours: number,
): Promise<void> {
  const doc = await fetchDocument<{ custom_planned_hours?: PlannedHourRow[] }>("Task", taskName);
  const rows: PlannedHourRow[] = (doc.custom_planned_hours || []).slice();

  const existing = rows.findIndex((r) => r.employee === employee && r.week_start === weekStart);

  if (hours === 0 && existing >= 0) {
    rows.splice(existing, 1);
  } else if (hours > 0) {
    if (existing >= 0) {
      rows[existing] = { ...rows[existing], planned_hours: hours };
    } else {
      rows.push({ employee, employee_name: employeeName, week_start: weekStart, planned_hours: hours });
    }
  } else {
    // hours === 0 and no existing row — nothing to do.
    return;
  }

  await updateDocument("Task", taskName, { custom_planned_hours: rows });
}

/** Batched variant: apply a list of (employee, week_start, hours) edits
 *  to a single task in one fetch→splice→save round-trip. Used by the
 *  store's debounced flush so a burst of edits across multiple cells of
 *  the same task doesn't reduce to a single edit (the old behavior lost
 *  all but the last cell's write when the debounce collapsed them).
 *
 *  Ports the intent of upstream Kort-Geytenbeek 793b54c — "prevent
 *  duplicate planned hours on rapid edits" — into the batched shape our
 *  React store expects (upstream kept a per-task rows cache instead;
 *  batching is equivalent and fits our existing debounce layer). */
export interface PlannedHoursEdit {
  employee: string;
  employee_name: string;
  week_start: string;
  planned_hours: number;
}

export async function savePlannedHoursBatch(taskName: string, edits: PlannedHoursEdit[]): Promise<void> {
  if (edits.length === 0) return;
  const doc = await fetchDocument<{ custom_planned_hours?: PlannedHourRow[] }>("Task", taskName);
  const rows: PlannedHourRow[] = (doc.custom_planned_hours || []).map((r) => ({ ...r }));

  for (const edit of edits) {
    // String coerce on week_start because ERPNext occasionally returns
    // Date objects mid-marshaling; the key compare must not match
    // Object.is-different-but-equal representations.
    const idx = rows.findIndex(
      (r) => r.employee === edit.employee && String(r.week_start) === String(edit.week_start),
    );
    if (edit.planned_hours === 0) {
      if (idx >= 0) rows.splice(idx, 1);
    } else if (idx >= 0) {
      rows[idx] = { ...rows[idx], planned_hours: edit.planned_hours };
    } else {
      rows.push({
        employee: edit.employee,
        employee_name: edit.employee_name,
        week_start: edit.week_start,
        planned_hours: edit.planned_hours,
      });
    }
  }

  await updateDocument("Task", taskName, { custom_planned_hours: rows });
}

export async function saveProgress(taskName: string, progress: number): Promise<void> {
  await updateDocument("Task", taskName, { progress });
}

/** Approved leave applications touching the given period. Uses Frappe's
 *  standard whitelisted `frappe.client.get_list` — no custom method. */
export async function fetchLeave(
  employee: string,
  periodStart: string,
  periodEnd: string,
): Promise<LeaveData[]> {
  const result = await callMethod("frappe.client.get_list", {
    doctype: "Leave Application",
    filters: [
      ["employee", "=", employee],
      ["status", "=", "Approved"],
      ["from_date", "<=", periodEnd],
      ["to_date", ">=", periodStart],
    ],
    fields: ["from_date", "to_date", "total_leave_days", "leave_type"],
    limit_page_length: 0,
  });
  return (result || []) as LeaveData[];
}
