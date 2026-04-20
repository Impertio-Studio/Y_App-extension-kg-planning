import { X } from "lucide-react";
import { useKgPlanning } from "../store";
import ViewSwitcher from "./ViewSwitcher";

export default function FilterBar() {
  const {
    data,
    activeView,
    selectedEmployee,
    setSelectedEmployee,
    selectedProject,
    setSelectedProject,
    selectedCoordinator,
    setSelectedCoordinator,
  } = useKgPlanning();

  const employees = data?.employees ?? [];
  const projects = data?.projects ?? [];

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-white border-b border-slate-200">
      <FilterSelect
        label="Medewerker"
        value={selectedEmployee}
        onChange={setSelectedEmployee}
        placeholder="Alle medewerkers"
        options={[
          { value: "__unplanned__", label: "\u26A0 Nog niet ingepland" },
          ...employees.map((e) => ({ value: e.name, label: e.employee_name })),
        ]}
      />

      {activeView === "gantt" && (
        <FilterSelect
          label="Coordinator"
          value={selectedCoordinator}
          onChange={setSelectedCoordinator}
          placeholder="Alle"
          options={employees.map((e) => ({ value: e.name, label: e.employee_name }))}
        />
      )}

      {activeView !== "team" && (
        <FilterSelect
          label="Project"
          value={selectedProject}
          onChange={setSelectedProject}
          placeholder="Alle projecten"
          options={projects.map((p) => ({
            value: p.name,
            label: `${p.custom_project_number ?? ""} ${p.project_name}`.trim(),
          }))}
        />
      )}

      <div className="flex-1" />
      <ViewSwitcher />
    </div>
  );
}

interface FilterSelectProps {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, placeholder, options }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-xs font-medium text-slate-500">{label}:</label>
      <div className="relative">
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.currentTarget.value || null)}
          className="pl-2.5 pr-7 py-1 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <option value="">{placeholder}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {value && (
          <button
            onClick={() => onChange(null)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
            aria-label="Clear filter"
            title="Clear"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

/** Shown below the filter bar when a specific employee is selected.
 *  Displays contract details for context. */
export function EmployeeInfoBar() {
  const { selectedEmployee, getEmployeeById } = useKgPlanning();
  if (!selectedEmployee || selectedEmployee === "__unplanned__") return null;
  const emp = getEmployeeById(selectedEmployee);
  if (!emp) return null;

  const days = emp.custom_contract_days_per_week;
  const hours = emp.custom_contract_hours_per_week;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
      <strong className="text-slate-800">{emp.employee_name}</strong>
      <span className="text-slate-300">|</span>
      <span>
        Contract: <strong className="text-slate-800">{days || "?"} dagen</strong> ={" "}
        <strong className="text-slate-800">{hours || "?"} uur/week</strong>
      </span>
      <span className="text-slate-300">|</span>
      <span>
        Functie: <strong className="text-slate-800">{emp.custom_department_function || "—"}</strong>
      </span>
    </div>
  );
}
