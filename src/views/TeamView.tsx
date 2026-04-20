import { useMemo, useState } from "react";
import { useKgPlanning } from "../store";
import { capacityColor } from "../utils/phases";
import { generateWeeksFromNow, getCurrentWeek, type WeekInfo } from "../utils/weeks";
import { getFirstName } from "../utils/helpers";
import type { EmployeeData } from "../types";

interface TeamRow {
  employee: EmployeeData;
  /** week_start ISO → hours summed across all tasks. */
  weekHours: Map<string, number>;
}

interface TeamGroup {
  key: string;
  label: string;
  members: TeamRow[];
}

const CURRENT = getCurrentWeek();

export default function TeamView() {
  const { data, setSelectedEmployee, setActiveView } = useKgPlanning();
  const tasks = data?.tasks ?? [];
  const employees = data?.employees ?? [];

  // 4 weeks back, 26 weeks forward — generated once per mount. The
  // boundary is relative to "now" so it drifts as the day advances, but
  // a visit spanning more than one day is unusual for this workflow.
  const weeks = useMemo<WeekInfo[]>(() => generateWeeksFromNow(26, 4), []);

  // Group rows by department function. "Architectuur" and "Bouwtechniek"
  // are the two canonical groups at KG; anything else falls into "OVERIG".
  const groups = useMemo<TeamGroup[]>(() => {
    const rows: TeamRow[] = employees.map((emp) => {
      const weekHours = new Map<string, number>();
      for (const task of tasks) {
        for (const row of task.custom_planned_hours || []) {
          if (row.employee === emp.name) {
            weekHours.set(row.week_start, (weekHours.get(row.week_start) ?? 0) + row.planned_hours);
          }
        }
      }
      return { employee: emp, weekHours };
    });

    const arch = rows.filter((r) => r.employee.custom_department_function === "Architectuur");
    const bouw = rows.filter((r) => r.employee.custom_department_function === "Bouwtechniek");
    const other = rows.filter(
      (r) =>
        !r.employee.custom_department_function ||
        (r.employee.custom_department_function !== "Architectuur" && r.employee.custom_department_function !== "Bouwtechniek"),
    );

    const out: TeamGroup[] = [
      { key: "arch", label: "ARCHITECTUUR", members: arch },
      { key: "bouw", label: "BOUWTECHNIEK", members: bouw },
    ];
    if (other.length > 0) out.push({ key: "other", label: "OVERIG", members: other });
    return out;
  }, [employees, tasks]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const navigateToEmployee = (empId: string) => {
    setSelectedEmployee(empId);
    setActiveView("grid");
  };

  const totalContract = (members: TeamRow[]) =>
    members.reduce((s, m) => s + (m.employee.custom_contract_hours_per_week || 0), 0);

  const sumWeek = (members: TeamRow[], weekIso: string) =>
    members.reduce((s, m) => s + (m.weekHours.get(weekIso) ?? 0), 0);

  const firmContract = employees.reduce((s, e) => s + (e.custom_contract_hours_per_week || 0), 0);

  return (
    <div className="p-3">
      <table className="text-xs border-collapse">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="sticky left-0 bg-slate-100 px-3 py-2 text-left font-semibold border-b border-slate-200 min-w-[160px] z-10">
              Medewerker
            </th>
            <th className="px-2 py-2 text-center font-semibold border-b border-slate-200 min-w-[50px]">
              Contr.
            </th>
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
        </thead>
        <tbody>
          {groups.map((group) => {
            const groupCollapsed = !!collapsed[group.key];
            const groupContract = totalContract(group.members);
            return (
              <GroupRows
                key={group.key}
                group={group}
                collapsed={groupCollapsed}
                onToggle={() => toggleGroup(group.key)}
                weeks={weeks}
                groupContract={groupContract}
                sumWeek={sumWeek}
                onNavigate={navigateToEmployee}
              />
            );
          })}

          <tr className="bg-slate-800 text-white font-semibold">
            <td className="sticky left-0 bg-slate-800 px-3 py-2 z-10">TOTAAL BEDRIJF</td>
            <td className="px-2 py-2 text-center">{firmContract}u</td>
            {weeks.map((w) => {
              const total = groups.reduce((s, g) => s + sumWeek(g.members, w.isoDate), 0);
              return (
                <td key={w.isoDate} className="px-1.5 py-2 text-center">
                  {total || ""}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface GroupRowsProps {
  group: TeamGroup;
  collapsed: boolean;
  onToggle: () => void;
  weeks: WeekInfo[];
  groupContract: number;
  sumWeek: (members: TeamRow[], weekIso: string) => number;
  onNavigate: (empId: string) => void;
}

function GroupRows({ group, collapsed, onToggle, weeks, groupContract, sumWeek, onNavigate }: GroupRowsProps) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="bg-slate-200 hover:bg-slate-300 cursor-pointer border-b border-slate-300 text-slate-800"
      >
        <td colSpan={2 + weeks.length} className="px-3 py-1.5 text-xs">
          <span className="inline-block w-3 text-slate-500 mr-1">{collapsed ? "▶" : "▼"}</span>
          <strong>{group.label}</strong>
          <span className="ml-3 text-slate-500 font-normal">
            {group.members.length} medewerkers · {groupContract}u/week
          </span>
        </td>
      </tr>

      <tr className="bg-slate-50 font-semibold border-b border-slate-200">
        <td className="sticky left-0 bg-slate-50 px-3 py-1.5 z-10">Subtotaal</td>
        <td className="px-2 py-1.5 text-center">{groupContract}u</td>
        {weeks.map((w) => {
          const total = sumWeek(group.members, w.isoDate);
          const pct = groupContract > 0 ? (total / groupContract) * 100 : 0;
          return (
            <td
              key={w.isoDate}
              className="px-1.5 py-1 text-center"
              style={{
                background: capacityColor(pct) || undefined,
                color: pct > 100 ? "#dc3545" : undefined,
              }}
            >
              {total || ""}
            </td>
          );
        })}
      </tr>

      {!collapsed &&
        group.members.map((row, idx) => {
          const contract = row.employee.custom_contract_hours_per_week || 40;
          return (
            <tr
              key={row.employee.name}
              className={`border-b border-slate-100 ${idx % 2 === 1 ? "bg-white" : "bg-slate-50/40"}`}
            >
              <td
                onClick={() => onNavigate(row.employee.name)}
                className="sticky left-0 px-3 py-1.5 text-slate-800 hover:text-blue-600 cursor-pointer z-10"
                style={{ background: idx % 2 === 1 ? "#fff" : "rgba(248,250,252,0.4)" }}
                title={row.employee.employee_name}
              >
                <strong>{getFirstName(row.employee.employee_name)}</strong>
              </td>
              <td className="px-2 py-1.5 text-center text-slate-400">
                {row.employee.custom_contract_hours_per_week || "?"}u
              </td>
              {weeks.map((w) => {
                const hrs = row.weekHours.get(w.isoDate) ?? 0;
                const pct = contract > 0 ? (hrs / contract) * 100 : 0;
                return (
                  <td
                    key={w.isoDate}
                    className="px-1.5 py-1 text-center"
                    style={{
                      background: capacityColor(pct) || undefined,
                      color: pct > 100 ? "#dc3545" : undefined,
                      fontWeight: pct > 100 ? 700 : undefined,
                    }}
                  >
                    {hrs || ""}
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}
