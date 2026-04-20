import { Suspense, lazy, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { KgPlanningProvider, useKgPlanning } from "./store";
import TabBar, { type KgTab } from "./TabBar";
import FilterBar, { EmployeeInfoBar } from "./views/FilterBar";
import TeamView from "./views/TeamView";
import GanttView from "./views/GanttView";
import GridView from "./views/GridView";

const DashboardsRoot = lazy(() => import("./dashboards/Root"));

const VALID_KG_TABS: readonly KgTab[] = ["planning", "financial", "projects", "hr"];
function isValidKgTab(v: string | undefined): v is KgTab {
  return !!v && (VALID_KG_TABS as readonly string[]).includes(v);
}

export default function KgPlanningPage() {
  const navigate = useNavigate();
  const { tab: tabParam } = useParams<{ tab?: string }>();
  const tab: KgTab = isValidKgTab(tabParam) ? tabParam : "planning";
  const setTab = useCallback((next: KgTab) => {
    navigate(next === "planning" ? "/" : `/${next}`);
  }, [navigate]);

  return (
    <div className="flex flex-col h-full bg-white">
      <TabBar active={tab} onChange={setTab} />
      <div className="flex-1 overflow-hidden">
        {tab === "planning" ? (
          <KgPlanningProvider>
            <PlanningShell />
          </KgPlanningProvider>
        ) : (
          <Suspense fallback={<LoadingPanel />}>
            <DashboardsRoot tab={tab} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

function LoadingPanel() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center h-full text-sm text-slate-500">
      {t("extensions.kg_planning.loading")}
    </div>
  );
}

function PlanningShell() {
  const { t } = useTranslation();
  const { status, errorMessage, missingFields, reload, activeView, hydration } = useKgPlanning();

  if (status === "loading") return <LoadingPanel />;

  if (status === "not_configured") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-800">
          {t("extensions.kg_planning.not_configured_title")}
        </h2>
        <p className="max-w-md text-sm text-slate-600">
          {t("extensions.kg_planning.not_configured_body")}
        </p>
        {missingFields.length > 0 && (
          <code className="px-3 py-1.5 rounded bg-slate-100 text-xs text-slate-700">
            {missingFields.join(", ")}
          </code>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm font-medium text-red-700">{t("extensions.kg_planning.load_failed")}</p>
        <p className="mt-1 text-xs text-red-600 break-words">{errorMessage}</p>
        <button
          onClick={() => void reload()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 cursor-pointer"
        >
          <RefreshCw size={12} /> {t("webmail.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <FilterBar />
      <EmployeeInfoBar />
      {hydration && hydration.loaded < hydration.total && (
        <div className="relative h-1 bg-slate-200 overflow-hidden" title={`${hydration.loaded} / ${hydration.total}`}>
          <div
            className="absolute inset-y-0 left-0 bg-teal-500 transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round((hydration.loaded / hydration.total) * 100)}%` }}
          />
        </div>
      )}
      <div className="flex-1 overflow-auto">
        {activeView === "grid" && <GridView />}
        {activeView === "gantt" && <GanttView />}
        {activeView === "team" && <TeamView />}
      </div>
    </div>
  );
}
