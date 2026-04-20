import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import type { KgTab } from "../TabBar";
import { DashboardsProvider, useDashboards } from "./store";
import DashboardFilters from "./components/DashboardFilters";
import DetailModal from "./components/DetailModal";
import FinancieelDashboard from "./FinancieelDashboard";
import ProjectenDashboard from "./ProjectenDashboard";
import HrDashboard from "./HrDashboard";

export default function DashboardsRoot({ tab }: { tab: KgTab }) {
  return (
    <DashboardsProvider>
      <Shell tab={tab} />
    </DashboardsProvider>
  );
}

function Shell({ tab }: { tab: KgTab }) {
  const { t } = useTranslation();
  const { status, errorMessage, missing, reload } = useDashboards();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-full text-sm text-slate-500">
        {t("extensions.kg_planning.dashboards.loading")}
      </div>
    );
  }

  if (status === "not_configured") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
        <h2 className="text-lg font-semibold text-slate-800">
          {t("extensions.kg_planning.dashboards.not_configured_title")}
        </h2>
        <p className="max-w-md text-sm text-slate-600">
          {t("extensions.kg_planning.dashboards.not_configured_body")}
        </p>
        {missing.length > 0 && (
          <code className="px-3 py-1.5 rounded bg-slate-100 text-xs text-slate-700">
            {missing.join(", ")}
          </code>
        )}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm font-medium text-red-700">
          {t("extensions.kg_planning.dashboards.load_failed")}
        </p>
        <p className="mt-1 text-xs text-red-600 break-words">{errorMessage}</p>
        <button
          onClick={() => void reload()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-300 text-red-700 rounded-lg text-xs font-medium hover:bg-red-100 cursor-pointer"
        >
          <RefreshCw size={12} /> {t("extensions.kg_planning.dashboards.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DashboardFilters />
      <div className="flex-1 overflow-hidden">
        {tab === "financial" && <FinancieelDashboard />}
        {tab === "projects" && <ProjectenDashboard />}
        {tab === "hr" && <HrDashboard />}
      </div>
      <DetailModal />
    </div>
  );
}
