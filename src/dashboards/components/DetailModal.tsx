import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { useDashboards } from "../store";
import type { DrilldownRow } from "../types";
import { formatDatumNL, formatUrenNL } from "../format";

export default function DetailModal() {
  const { t } = useTranslation();
  const {
    drilldownVisible, drilldownTitle, drilldownFilter,
    closeDrilldown, loadDrilldown,
  } = useDashboards();

  const [rows, setRows] = useState<DrilldownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!drilldownVisible || !drilldownFilter) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadDrilldown()
      .then((all) => { if (!cancelled) setRows(all.filter(drilldownFilter)); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [drilldownVisible, drilldownFilter, loadDrilldown]);

  useEffect(() => {
    if (!drilldownVisible) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") closeDrilldown(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [drilldownVisible, closeDrilldown]);

  const totals = useMemo(() => {
    const data = rows ?? [];
    return {
      uren: data.reduce((s, r) => s + (r.uren || 0), 0),
      fact: data.reduce((s, r) => s + (r.fact_uren || 0), 0),
    };
  }, [rows]);

  if (!drilldownVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeDrilldown}>
      <div className="flex flex-col max-h-full w-full max-w-5xl bg-white rounded-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-800">{drilldownTitle}</h3>
          <button onClick={closeDrilldown} className="p-1 rounded hover:bg-slate-100 cursor-pointer">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {loading && <p className="p-8 text-center text-sm text-slate-500">{t("extensions.kg_planning.dashboards.loading")}</p>}
          {error && <p className="p-4 text-sm text-red-600">{error}</p>}
          {!loading && !error && rows && rows.length === 0 && (
            <p className="p-8 text-center text-sm text-slate-500">{t("extensions.kg_planning.dashboards.detail_empty")}</p>
          )}
          {!loading && !error && rows && rows.length > 0 && (
            <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 text-left sticky top-0">
                <tr>
                  <th className="px-3 py-2">{t("extensions.kg_planning.dashboards.detail_col_datum")}</th>
                  <th className="px-3 py-2">{t("extensions.kg_planning.dashboards.detail_col_persoon")}</th>
                  <th className="px-3 py-2">{t("extensions.kg_planning.dashboards.detail_col_project")}</th>
                  <th className="px-3 py-2">{t("extensions.kg_planning.dashboards.detail_col_task")}</th>
                  <th className="px-3 py-2">{t("extensions.kg_planning.dashboards.detail_col_omschrijving")}</th>
                  <th className="px-3 py-2 text-right">{t("extensions.kg_planning.dashboards.detail_col_uren")}</th>
                  <th className="px-3 py-2 text-right">{t("extensions.kg_planning.dashboards.detail_col_fact_uren")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-1.5">{formatDatumNL(r.datum)}</td>
                    <td className="px-3 py-1.5">{r.persoon}</td>
                    <td className="px-3 py-1.5">{r.project}</td>
                    <td className="px-3 py-1.5">{r.task}</td>
                    <td className="px-3 py-1.5 text-slate-600">{r.omschrijving}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatUrenNL(r.uren)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatUrenNL(r.fact_uren)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={5}>{t("extensions.kg_planning.dashboards.detail_total")}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUrenNL(totals.uren)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatUrenNL(totals.fact)}</td>
                </tr>
              </tfoot>
            </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
