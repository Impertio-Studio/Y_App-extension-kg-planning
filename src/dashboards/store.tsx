import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { insightsSource } from "./insightsSource";
import type { DashboardDataSource } from "./DataSource";
import type { RawDashboardData, DrilldownRow } from "./types";

type Status = "loading" | "ok" | "not_configured" | "error";

interface DashboardsState {
  status: Status;
  data: RawDashboardData | null;
  errorMessage: string | null;
  missing: string[];

  dateFrom: string;
  dateTo: string;
  setDateRange: (from: string, to: string) => void;
  reload: () => Promise<void>;

  loadDrilldown: (range?: { from: string; to: string }) => Promise<DrilldownRow[]>;

  drilldownVisible: boolean;
  drilldownTitle: string;
  drilldownFilter: ((row: DrilldownRow) => boolean) | null;
  openDrilldown: (title: string, filter: (row: DrilldownRow) => boolean) => void;
  closeDrilldown: () => void;
}

const Ctx = createContext<DashboardsState | null>(null);

function defaultRange(): { from: string; to: string } {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

export function DashboardsProvider({
  children,
  source = insightsSource,
}: {
  children: ReactNode;
  source?: DashboardDataSource;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<RawDashboardData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);

  const [{ from: dateFrom, to: dateTo }, setRange] = useState(defaultRange);

  const [drilldownVisible, setDrilldownVisible] = useState(false);
  const [drilldownTitle, setDrilldownTitle] = useState("");
  const [drilldownFilter, setDrilldownFilter] =
    useState<((row: DrilldownRow) => boolean) | null>(null);

  // Drilldown row cache keyed by range.
  const drillCacheRef = useRef<{ key: string; rows: DrilldownRow[] }>({ key: "", rows: [] });

  // Load-generation counter. Each reload() bumps it; when an awaited load
  // resolves, we only write state if the load that resolved is still the
  // latest. Prevents a stale/failed load from overwriting a newer successful
  // one (e.g. the red-flash the user saw under StrictMode's double-effect).
  const loadIdRef = useRef(0);

  const reload = useCallback(async () => {
    const id = ++loadIdRef.current;
    setStatus("loading");
    setErrorMessage(null);
    setMissing([]);
    const result = await source.loadAll({ from: dateFrom, to: dateTo });
    if (id !== loadIdRef.current) return;
    if (result.kind === "ok") {
      setData(result.data);
      setStatus("ok");
    } else if (result.kind === "not_configured") {
      setStatus("not_configured");
      setMissing(result.missing);
    } else {
      setStatus("error");
      setErrorMessage(result.message);
    }
    drillCacheRef.current.key = "";
    drillCacheRef.current.rows = [];
  }, [source, dateFrom, dateTo]);

  useEffect(() => { void reload(); }, [reload]);

  const setDateRange = useCallback((from: string, to: string) => {
    setRange({ from, to });
  }, []);

  const loadDrilldown = useCallback(async (range?: { from: string; to: string }) => {
    const r = range ?? { from: dateFrom, to: dateTo };
    const key = `${r.from}|${r.to}`;
    if (drillCacheRef.current.key === key && drillCacheRef.current.rows.length > 0)
      return drillCacheRef.current.rows;
    const rows = await source.loadDrilldown(r);
    drillCacheRef.current.key = key;
    drillCacheRef.current.rows = rows;
    return rows;
  }, [source, dateFrom, dateTo]);

  const openDrilldown = useCallback((title: string, filter: (row: DrilldownRow) => boolean) => {
    setDrilldownTitle(title);
    setDrilldownFilter(() => filter);
    setDrilldownVisible(true);
  }, []);

  const closeDrilldown = useCallback(() => setDrilldownVisible(false), []);

  const value: DashboardsState = {
    status, data, errorMessage, missing,
    dateFrom, dateTo, setDateRange, reload,
    loadDrilldown,
    drilldownVisible, drilldownTitle, drilldownFilter, openDrilldown, closeDrilldown,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDashboards(): DashboardsState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDashboards must be used inside <DashboardsProvider>");
  return ctx;
}

/** Precomputed projections off the raw data slice. Called inside `useMemo`
 *  in components to avoid re-computing on every render. */
export function deriveMonthlyArray<K extends keyof RawDashboardData["monthly"][number]>(
  rows: RawDashboardData["monthly"],
  field: K,
): number[] {
  const arr = new Array(12).fill(0);
  for (const r of rows) {
    const idx = ((r.maand as number) || 0) - 1;
    if (idx >= 0 && idx < 12) arr[idx] = (r[field] as unknown as number) || 0;
  }
  return arr;
}
