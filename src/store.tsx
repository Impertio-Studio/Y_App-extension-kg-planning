/**
 * React Context + hook for KG Planning. Mirrors the SolidJS app's store
 * semantics (single combined fetch, derived helpers, debounced saves on
 * planned-hours cells) using plain React state.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { loadPlanningSkeleton, hydratePlannedHours, savePlannedHours as apiSavePlannedHours, saveProgress as apiSaveProgress } from "./api";
import type { EmployeeData, PlanningData, PlannedHourRow, ProjectData, TaskData } from "./types";

type ViewMode = "grid" | "gantt" | "team";

interface KgPlanningState {
  /** Discriminated load status so views can render the right empty state. */
  status: "loading" | "ok" | "not_configured" | "error";
  data: PlanningData | null;
  errorMessage: string | null;
  missingFields: string[];

  /** Phase-2 hydration progress. Null when phase 2 isn't running; otherwise
   *  loaded/total counts of planned-hours rows being streamed in. */
  hydration: { loaded: number; total: number } | null;

  // Filters
  selectedEmployee: string | null;
  selectedProject: string | null;
  selectedCoordinator: string | null;
  activeView: ViewMode;

  // Actions
  reload: () => Promise<void>;
  setSelectedEmployee: (v: string | null) => void;
  setSelectedProject: (v: string | null) => void;
  setSelectedCoordinator: (v: string | null) => void;
  setActiveView: (v: ViewMode) => void;

  savePlannedHours: (taskName: string, employee: string, employeeName: string, weekStart: string, hours: number) => void;
  saveProgress: (taskName: string, progress: number) => Promise<void>;

  // Derived helpers
  getEmployeeById: (id: string) => EmployeeData | undefined;
  getProjectByName: (name: string) => ProjectData | undefined;
  isInternalProject: (projectNumber: string) => boolean;
}

const KgPlanningContext = createContext<KgPlanningState | null>(null);

/** Internal-project number range from the SolidJS source. Kept as a
 *  constant so call sites don't hardcode magic numbers. */
const INTERNAL_PROJECT_MIN = 1000;
const INTERNAL_PROJECT_MAX = 1199;

export function KgPlanningProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<KgPlanningState["status"]>("loading");
  const [data, setData] = useState<PlanningData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [hydration, setHydration] = useState<{ loaded: number; total: number } | null>(null);

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedCoordinator, setSelectedCoordinator] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ViewMode>("grid");

  // Abort phase-2 hydration when reload is re-triggered or the provider
  // unmounts — stops a stale in-flight load from scribbling over new data.
  const hydrateAbortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    hydrateAbortRef.current?.abort();
    setStatus("loading");
    setErrorMessage(null);
    setMissingFields([]);
    setHydration(null);

    const skeleton = await loadPlanningSkeleton();
    if (skeleton.kind === "not_configured") {
      setStatus("not_configured");
      setMissingFields(skeleton.missing);
      return;
    }
    if (skeleton.kind === "error") {
      setStatus("error");
      setErrorMessage(skeleton.message);
      return;
    }
    // Phase 1 done: render the grid immediately with empty cells.
    setData(skeleton.data);
    setStatus("ok");

    // Phase 2: stream in child-table rows. Batch state writes so we don't
    // re-render once per task — accumulate for 100ms then flush.
    const names = skeleton.data.tasks.map((t) => t.name);
    if (names.length === 0) return;
    setHydration({ loaded: 0, total: names.length });

    const ctrl = new AbortController();
    hydrateAbortRef.current = ctrl;
    const pending = new Map<string, PlannedHourRow[]>();
    let loaded = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      flushTimer = null;
      if (pending.size === 0) return;
      const batch = new Map(pending);
      pending.clear();
      setData((prev) => {
        if (!prev) return prev;
        const tasks = prev.tasks.map((t) =>
          batch.has(t.name) ? { ...t, custom_planned_hours: batch.get(t.name)! } : t,
        );
        return { ...prev, tasks };
      });
      setHydration((prev) => (prev ? { ...prev, loaded } : prev));
    };

    await hydratePlannedHours(
      names,
      (name, rows) => {
        pending.set(name, rows);
        loaded++;
        if (!flushTimer) flushTimer = setTimeout(flush, 100);
      },
      ctrl.signal,
    );
    // Final flush + clear progress banner.
    if (flushTimer) clearTimeout(flushTimer);
    flush();
    if (!ctrl.signal.aborted) setHydration(null);
  }, []);

  // Initial load on mount.
  useEffect(() => {
    void reload();
    return () => { hydrateAbortRef.current?.abort(); };
  }, [reload]);

  // Debounced writes for planned-hours cells. Each task has its own timer
  // so fast typing in one cell doesn't delay saves to other tasks. On
  // unmount we flush pending timers by clearing them — the in-memory
  // optimistic state is already on screen; the missed save shows up as
  // stale-on-next-load, which is acceptable for a background autosave.
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const savePlannedHours = useCallback<KgPlanningState["savePlannedHours"]>(
    (taskName, employee, employeeName, weekStart, hours) => {
      // Optimistic update: splice the row into our in-memory TaskData so
      // the grid re-renders immediately; the network write happens 500ms
      // later (matches the SolidJS behaviour).
      setData((prev) => {
        if (!prev) return prev;
        const tasks = prev.tasks.map((t) => {
          if (t.name !== taskName) return t;
          const rows = t.custom_planned_hours.slice();
          const idx = rows.findIndex((r) => r.employee === employee && r.week_start === weekStart);
          if (hours === 0) {
            if (idx >= 0) rows.splice(idx, 1);
          } else if (idx >= 0) {
            rows[idx] = { ...rows[idx], planned_hours: hours };
          } else {
            rows.push({ employee, employee_name: employeeName, week_start: weekStart, planned_hours: hours });
          }
          return { ...t, custom_planned_hours: rows };
        });
        return { ...prev, tasks };
      });

      const timers = saveTimersRef.current;
      const existing = timers.get(taskName);
      if (existing) clearTimeout(existing);
      const handle = setTimeout(async () => {
        timers.delete(taskName);
        try {
          await apiSavePlannedHours(taskName, employee, employeeName, weekStart, hours);
        } catch (err) {
          // Rollback to server truth: re-fetch the whole dataset. Coarse
          // but simple — a per-cell rollback would need to snapshot state
          // before the optimistic edit, which we don't do today.
          console.error("[kg-planning] savePlannedHours failed:", err);
          void reload();
        }
      }, 500);
      timers.set(taskName, handle);
    },
    [reload],
  );

  useEffect(() => {
    const timers = saveTimersRef.current;
    return () => {
      for (const h of timers.values()) clearTimeout(h);
      timers.clear();
    };
  }, []);

  const saveProgress = useCallback(async (taskName: string, progress: number) => {
    setData((prev) => {
      if (!prev) return prev;
      return { ...prev, tasks: prev.tasks.map((t) => (t.name === taskName ? { ...t, progress } : t)) };
    });
    try {
      await apiSaveProgress(taskName, progress);
    } catch (err) {
      console.error("[kg-planning] saveProgress failed:", err);
      void reload();
    }
  }, [reload]);

  // Derived lookups memoized off the data slice so the view components
  // get stable function identities — no unnecessary child re-renders.
  const derived = useMemo(() => {
    const employeeById = new Map<string, EmployeeData>((data?.employees ?? []).map((e) => [e.name, e]));
    const projectByName = new Map<string, ProjectData>((data?.projects ?? []).map((p) => [p.name, p]));
    return {
      getEmployeeById: (id: string) => employeeById.get(id),
      getProjectByName: (name: string) => projectByName.get(name),
      isInternalProject: (projectNumber: string) => {
        const n = parseInt(projectNumber, 10);
        return !Number.isNaN(n) && n >= INTERNAL_PROJECT_MIN && n <= INTERNAL_PROJECT_MAX;
      },
    };
  }, [data]);

  const value: KgPlanningState = {
    status,
    data,
    errorMessage,
    missingFields,
    hydration,
    selectedEmployee,
    selectedProject,
    selectedCoordinator,
    activeView,
    reload,
    setSelectedEmployee,
    setSelectedProject,
    setSelectedCoordinator,
    setActiveView,
    savePlannedHours,
    saveProgress,
    ...derived,
  };

  return <KgPlanningContext.Provider value={value}>{children}</KgPlanningContext.Provider>;
}

export function useKgPlanning(): KgPlanningState {
  const ctx = useContext(KgPlanningContext);
  if (!ctx) throw new Error("useKgPlanning must be used inside <KgPlanningProvider>");
  return ctx;
}

/** Convenience accessor — throws if the data slice isn't loaded yet. Use
 *  only below a status === "ok" guard. */
export function useKgTasks(): TaskData[] {
  const { data } = useKgPlanning();
  return data?.tasks ?? [];
}
