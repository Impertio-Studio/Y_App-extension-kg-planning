import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDashboards } from "../store";

export default function DashboardFilters() {
  const { t } = useTranslation();
  const { dateFrom, dateTo, setDateRange, reload, status } = useDashboards();

  const now = new Date();
  const thisYear = now.getFullYear();
  const currentQ = Math.ceil((now.getMonth() + 1) / 3);

  const quarter = (year: number, q: number): [string, string] => {
    const s = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
    const e = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
    return [s[q - 1], e[q - 1]];
  };

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200">
      <label className="text-xs text-slate-600">{t("extensions.kg_planning.dashboards.date_from")}</label>
      <input
        type="date"
        value={dateFrom}
        onChange={(e) => setDateRange(e.target.value, dateTo)}
        className="px-2 py-1 border border-slate-300 rounded text-sm"
      />
      <label className="text-xs text-slate-600">{t("extensions.kg_planning.dashboards.date_to")}</label>
      <input
        type="date"
        value={dateTo}
        onChange={(e) => setDateRange(dateFrom, e.target.value)}
        className="px-2 py-1 border border-slate-300 rounded text-sm"
      />

      <div className="hidden sm:block mx-2 h-4 border-l border-slate-300" />

      <QuickRange label={t("extensions.kg_planning.dashboards.this_year")}
        onClick={() => setDateRange(`${thisYear}-01-01`, `${thisYear}-12-31`)} />
      <QuickRange label={t("extensions.kg_planning.dashboards.prev_year")}
        onClick={() => setDateRange(`${thisYear - 1}-01-01`, `${thisYear - 1}-12-31`)} />
      <QuickRange label={t("extensions.kg_planning.dashboards.this_quarter")}
        onClick={() => { const [f, to] = quarter(thisYear, currentQ); setDateRange(f, to); }} />
      <QuickRange label={t("extensions.kg_planning.dashboards.prev_quarter")}
        onClick={() => {
          const q = currentQ === 1 ? 4 : currentQ - 1;
          const y = currentQ === 1 ? thisYear - 1 : thisYear;
          const [f, to] = quarter(y, q);
          setDateRange(f, to);
        }} />

      <div className="hidden sm:block flex-1" />
      <button
        onClick={() => void reload()}
        disabled={status === "loading"}
        className="ml-auto inline-flex items-center gap-1 px-3 py-1 bg-white border border-slate-300 rounded text-sm hover:bg-slate-50 disabled:opacity-50 cursor-pointer disabled:cursor-wait"
      >
        <RefreshCw size={14} className={status === "loading" ? "animate-spin" : ""} />
        {t("extensions.kg_planning.dashboards.refresh")}
      </button>
    </div>
  );
}

function QuickRange({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-1 text-xs text-slate-700 hover:bg-slate-200 rounded cursor-pointer"
    >
      {label}
    </button>
  );
}
