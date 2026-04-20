import { useMemo } from "react";
import { useKgPlanning } from "../store";
import { generateWeeksFromNow, getCurrentWeek, type WeekInfo } from "../utils/weeks";
import { getPhaseColors } from "../utils/phases";
import { getFirstName } from "../utils/helpers";
import type { TaskData } from "../types";

const CURRENT = getCurrentWeek();

export default function GanttView() {
  const {
    data,
    selectedEmployee,
    selectedProject,
    selectedCoordinator,
    getProjectByName,
    getEmployeeById,
  } = useKgPlanning();

  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];

  const weeks = useMemo<WeekInfo[]>(() => generateWeeksFromNow(26, 4), []);

  // Only tasks whose project still exists + pass the current filters.
  // Employee filter applies at the *cell* level (see getHours below) so a
  // row with zero hours for the selected employee still shows the phase.
  const filteredTasks = useMemo(() => {
    const openProjects = new Set(projects.map((p) => p.name));
    return tasks.filter((t) => {
      if (!openProjects.has(t.project)) return false;
      if (selectedProject && t.project !== selectedProject) return false;
      if (selectedCoordinator) {
        const p = getProjectByName(t.project);
        if (p?.custom_project_manager !== selectedCoordinator) return false;
      }
      return true;
    });
  }, [tasks, projects, selectedProject, selectedCoordinator, getProjectByName]);

  // Group by project so project name + coordinator can rowspan across
  // all phases within the project.
  const groupedRows = useMemo<Array<[string, TaskData[]]>>(() => {
    const byProject = new Map<string, TaskData[]>();
    for (const t of filteredTasks) {
      const list = byProject.get(t.project) ?? [];
      list.push(t);
      byProject.set(t.project, list);
    }
    return Array.from(byProject.entries());
  }, [filteredTasks]);

  const getHours = (task: TaskData, weekIso: string, empFilter: string | null): number =>
    (task.custom_planned_hours ?? [])
      .filter((r) => r.week_start === weekIso && (!empFilter || r.employee === empFilter))
      .reduce((s, r) => s + r.planned_hours, 0);

  return (
    <div className="p-3">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr className="bg-slate-100 text-slate-700">
            <th className="px-2 py-2 text-left font-semibold border-b border-slate-200 min-w-[60px]">Nr</th>
            <th className="px-2 py-2 text-left font-semibold border-b border-slate-200 min-w-[180px]">Project</th>
            <th className="px-2 py-2 text-left font-semibold border-b border-slate-200 min-w-[70px]">Fase</th>
            <th className="px-2 py-2 text-left font-semibold border-b border-slate-200 min-w-[80px]">Verantw.</th>
            {weeks.map((w) => (
              <th
                key={w.isoDate}
                className={`px-1.5 py-1 text-center font-medium border-b border-slate-200 min-w-[42px] ${
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
          {groupedRows.map(([projectName, projectTasks]) => {
            const project = getProjectByName(projectName);
            const pmId = project?.custom_project_manager;
            const coord = pmId ? getFirstName(getEmployeeById(pmId)?.employee_name ?? "") : "";

            return projectTasks.map((task, i) => {
              const colors = getPhaseColors(task.phaseCode);
              return (
                <tr key={task.name} className="border-b border-slate-100 hover:bg-slate-50/60">
                  {i === 0 && (
                    <>
                      <td rowSpan={projectTasks.length} className="px-2 py-1.5 font-semibold align-top">
                        {project?.custom_project_number ?? ""}
                      </td>
                      <td rowSpan={projectTasks.length} className="px-2 py-1.5 font-semibold align-top">
                        {project?.project_name ?? projectName}
                      </td>
                    </>
                  )}
                  <td className="px-2 py-1.5 align-top">
                    <span
                      className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={{ background: colors.badge, color: "white" }}
                    >
                      {task.phaseCode ?? "?"}
                    </span>
                  </td>
                  {i === 0 && (
                    <td rowSpan={projectTasks.length} className="px-2 py-1.5 text-slate-600 align-top">
                      {coord}
                    </td>
                  )}
                  {weeks.map((w) => {
                    const hrs = getHours(task, w.isoDate, selectedEmployee);
                    return (
                      <td
                        key={w.isoDate}
                        className="px-1.5 py-1 text-center"
                        style={{
                          background: hrs > 0 ? colors.bg : undefined,
                          color: hrs > 0 ? colors.text : undefined,
                          fontWeight: hrs > 0 ? 600 : undefined,
                        }}
                      >
                        {hrs || ""}
                      </td>
                    );
                  })}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}
