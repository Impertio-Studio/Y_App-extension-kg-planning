/**
 * Shared types for the KG Planning extension. Kept here so views and the
 * store can import them without a circular dependency on api.ts.
 *
 * Field names match the custom ERPNext fields on Kort-Geytenbeek's
 * instance. Changing a name here means changing the ERPNext customization
 * too (or breaking the extension), so add fields via optional keys where
 * practical.
 */

export interface PlannedHourRow {
  /** Child-table row name (ERPNext auto-generates). Present after save. */
  name?: string;
  employee: string;
  employee_name: string;
  /** ISO date (YYYY-MM-DD) of the Monday of the planned week. */
  week_start: string;
  planned_hours: number;
}

export interface TaskData {
  name: string;
  subject: string;
  project: string;
  progress: number;
  custom_billing_type: string;
  custom_budget_hours: number;
  custom_phase_code: string;
  /** On the wire ERPNext returns this as `planned_hours`; api.ts normalizes. */
  custom_planned_hours: PlannedHourRow[];
  /** Assigned-to emails, not guaranteed to map 1:1 to Employee.name. */
  assigned_employees: string[];
  /** Derived: phase extracted from custom_phase_code or subject. */
  phaseCode: string | null;
}

export interface EmployeeData {
  name: string;
  employee_name: string;
  custom_contract_days_per_week: number;
  custom_contract_hours_per_week: number;
  custom_department_function: string;
  /** ERPNext-hosted avatar path (relative, e.g. /private/files/xxx.jpg). */
  image: string | null;
  /** Linked User doctype name (email). Required by frappe.desk.form.assign_to.add. */
  user_id: string | null;
}

export interface ProjectData {
  name: string;
  project_name: string;
  custom_project_number: string;
  custom_project_manager: string;
  /** ERPNext standard field: Open | Completed | Cancelled | Hold. */
  status: string;
}

export interface PlanningData {
  tasks: TaskData[];
  employees: EmployeeData[];
  projects: ProjectData[];
}

export interface LeaveData {
  from_date: string;
  to_date: string;
  total_leave_days: number;
  leave_type: string;
}

/** Discriminated state returned by loadPlanningData. "not_configured" is
 *  surfaced when the probe detects the custom fields are missing on this
 *  instance — the Page renders a clear message instead of a raw error. */
export type LoadResult =
  | { kind: "ok"; data: PlanningData }
  | { kind: "not_configured"; missing: string[] }
  | { kind: "error"; message: string };
