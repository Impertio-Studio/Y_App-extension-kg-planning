import { callMethod, fetchDocument, ApiError } from "../bridge";
import type { DashboardDataSource } from "./DataSource";
import type {
  RawDashboardData,
  DashboardLoadResult,
  DrilldownRow,
  MonthlyRow,
  EmployeeRow,
  ProjectRow,
  InvoiceMonthRow,
  InternRow,
  SickRow,
  PrevYearRow,
} from "./types";

const DEFAULT_QUERY_IDS = {
  maandtotalen: "QRY-0004",
  perMedewerker: "QRY-0005",
  perProject: "QRY-0006",
  facturatieMaand: "QRY-0007",
  internPerOmschrijving: "QRY-0008",
  ziekteverzuim: "QRY-0009",
  vorigJaar: "QRY-0010",
};
const DEFAULT_DRILLDOWN_REPORT = "KG Medewerker Periodeoverzicht";

/**
 * Fetch a server-side shared user setting. The `/api/user-settings/:key`
 * endpoint returns `{ ok: true, value: <T> }` when the setting exists and
 * `{ ok: false }` otherwise (see Sidebar.tsx and lib/activityTypes.ts for
 * the idiom). We return `null` for any failure so callers can fall back to
 * defaults.
 */
async function fetchUserSetting<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`/api/user-settings/${encodeURIComponent(key)}`, { credentials: "same-origin" });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.ok && data.value !== undefined && data.value !== null) {
      return data.value as T;
    }
    return null;
  } catch {
    return null;
  }
}

// In-flight dedupe: the Insights `run` step mutates a shared server-side
// doc (`Insights Query.result_name`), so two concurrent callers for the
// same query race and one gets a 417. StrictMode's double-effect and
// rapid tab switching both hit this. Collapse overlapping calls into one.
const inFlightQueries = new Map<string, Promise<unknown[]>>();

/** Three-step protocol to run an Insights query and return its rows. Exported
 *  for future unit testing. */
export async function runInsightsQuery<T>(queryName: string, columns: string[]): Promise<T[]> {
  const existing = inFlightQueries.get(queryName) as Promise<T[]> | undefined;
  if (existing) return existing;
  const promise = (async (): Promise<T[]> => {
    await callMethod("run_doc_method", { dt: "Insights Query", dn: queryName, method: "run" });
    const queryDoc = await fetchDocument<{ result_name?: string }>("Insights Query", queryName);
    const resultName = queryDoc.result_name;
    if (!resultName) return [];
    const resultDoc = await fetchDocument<{ results?: string }>("Insights Query Result", resultName);
    const resultsJson = resultDoc.results;
    if (!resultsJson) return [];
    let parsed: unknown;
    try {
      parsed = JSON.parse(resultsJson);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed) || parsed.length < 2) return [];
    const dataRows = (parsed as unknown[][]).slice(1) as (string | number)[][];
    return dataRows.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i] ?? null; });
      return obj as T;
    });
  })().finally(() => { inFlightQueries.delete(queryName); });
  inFlightQueries.set(queryName, promise as Promise<unknown[]>);
  return promise;
}

async function resolveQueryIds(): Promise<typeof DEFAULT_QUERY_IDS> {
  const override = await fetchUserSetting<Partial<typeof DEFAULT_QUERY_IDS>>("kg-insights-queries");
  return { ...DEFAULT_QUERY_IDS, ...(override ?? {}) };
}

async function resolveDrilldownReport(): Promise<string> {
  const override = await fetchUserSetting<string>("kg-drilldown-report");
  return override || DEFAULT_DRILLDOWN_REPORT;
}

function isNotConfiguredError(err: unknown): boolean {
  if (err instanceof ApiError && (err.status === 404 || err.status === 417)) {
    const msg = err.message.toLowerCase();
    if (msg.includes("insights query")) return true;
  }
  // Fallback for non-ApiError throws that still carry the expected text.
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes("insights query") && (msg.includes("not found") || msg.includes("does not exist"));
}

export const insightsSource: DashboardDataSource = {
  async loadAll(): Promise<DashboardLoadResult> {
    try {
      const ids = await resolveQueryIds();
      const [monthly, employees, projects, invoicesMonth, intern, sick, prevYear] = await Promise.all([
        runInsightsQuery<MonthlyRow>(ids.maandtotalen, ["maand", "uren", "fact_uren", "kosten", "omzet"]),
        runInsightsQuery<EmployeeRow>(ids.perMedewerker, ["persoon", "uren", "fact_uren", "intern_uren", "kosten", "omzet"]),
        runInsightsQuery<ProjectRow>(ids.perProject, ["nr", "naam", "uren", "fact_uren", "kosten", "omzet", "budget_uren"]),
        runInsightsQuery<InvoiceMonthRow>(ids.facturatieMaand, ["maand", "totaal"]),
        runInsightsQuery<InternRow>(ids.internPerOmschrijving, ["omschrijving", "uren"]),
        runInsightsQuery<SickRow>(ids.ziekteverzuim, ["persoon", "dagen"]),
        runInsightsQuery<PrevYearRow>(ids.vorigJaar, ["uren", "fact_uren", "kosten", "intern_uren", "ziek_uren", "facturatie"]),
      ]);
      const data: RawDashboardData = {
        monthly,
        employees,
        projects,
        invoicesMonth,
        intern,
        sick,
        prevYear: prevYear[0] ?? { uren: 0, fact_uren: 0, kosten: 0, intern_uren: 0, ziek_uren: 0, facturatie: 0 },
      };
      return { kind: "ok", data };
    } catch (err) {
      if (isNotConfiguredError(err)) {
        return { kind: "not_configured", missing: ["Insights Query QRY-0004..QRY-0010"] };
      }
      if (err instanceof ApiError && err.status === 403) {
        return { kind: "error", message: "No permission to read Insights Query on this instance." };
      }
      return { kind: "error", message: err instanceof Error ? err.message : String(err) };
    }
  },

  async loadDrilldown(range): Promise<DrilldownRow[]> {
    const reportName = await resolveDrilldownReport();
    const raw = await callMethod("frappe.desk.query_report.run", {
      report_name: reportName,
      filters: { from_date: range.from, to_date: range.to, employee: "" },
    });
    const result = raw as {
      result?: unknown[][];
      columns?: { fieldname: string }[];
    } | null | undefined;
    const columns = result?.columns?.map((c) => c.fieldname) ?? [];
    const expectedFields = ["persoon", "project", "task", "datum", "klant", "omschrijving", "start", "eind", "uren", "facturabel", "fact_uren"];
    const missing = expectedFields.filter((f) => !columns.includes(f));
    if (missing.length > 0) {
      console.warn(`[insightsSource] Drilldown report "${reportName}" missing expected columns:`, missing);
    }
    return (result?.result ?? []).map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, i) => { obj[col] = row[i] ?? null; });
      return obj as unknown as DrilldownRow;
    });
  },
};
