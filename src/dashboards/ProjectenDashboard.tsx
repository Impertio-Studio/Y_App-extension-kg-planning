import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDashboards } from "./store";
import { CategoryBarChart } from "./components/ChartCanvas";
import { formatEuro, formatUrenNL } from "./format";
import type { ProjectRow } from "./types";

type SortKey = keyof ProjectRow;

export default function ProjectenDashboard() {
  const { t } = useTranslation();
  const { data, openDrilldown } = useDashboards();
  const [sortBy, setSortBy] = useState<SortKey>("nr");
  const [sortAsc, setSortAsc] = useState(true);

  const sorted = useMemo(() => {
    const rows = [...(data?.projects ?? [])];
    rows.sort((a, b) => {
      const av = a[sortBy];
      const bv = b[sortBy];
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [data?.projects, sortBy, sortAsc]);

  const topMargin = useMemo(
    () => [...(data?.projects ?? [])]
      .map((p) => ({ label: p.nr || p.naam, value: (p.omzet || 0) - (p.kosten || 0) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 20),
    [data?.projects],
  );

  if (!data) return null;

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortAsc(!sortAsc);
    else { setSortBy(key); setSortAsc(true); }
  }

  const headers: Array<{ key: SortKey; label: string; num?: boolean }> = [
    { key: "nr", label: "Nr." },
    { key: "naam", label: "Naam" },
    { key: "budget_uren", label: "Budget", num: true },
    { key: "uren", label: "Uren", num: true },
    { key: "fact_uren", label: "Fact. uren", num: true },
    { key: "kosten", label: "Kosten", num: true },
    { key: "omzet", label: "Omzet", num: true },
  ];

  return (
    <div className="flex flex-col gap-4 p-4 overflow-auto">
      <section className="bg-white rounded-lg border border-slate-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              {headers.map((h) => (
                <th
                  key={h.key}
                  onClick={() => toggleSort(h.key)}
                  className={`px-3 py-2 cursor-pointer select-none hover:bg-slate-100 ${h.num ? "text-right" : ""}`}
                >
                  {h.label} {sortBy === h.key ? (sortAsc ? "\u25B2" : "\u25BC") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.nr}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                onClick={() => openDrilldown(
                  t("extensions.kg_planning.dashboards.detail_title_project", { project: `${p.nr} ${p.naam}` }),
                  (row) => row.project.includes(p.nr),
                )}
              >
                <td className="px-3 py-1.5">{p.nr}</td>
                <td className="px-3 py-1.5">{p.naam}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatUrenNL(p.budget_uren)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatUrenNL(p.uren)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatUrenNL(p.fact_uren)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatEuro(p.kosten)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatEuro(p.omzet)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-lg border border-slate-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">{t("extensions.kg_planning.dashboards.chart_projects")}</h3>
        <CategoryBarChart data={topMargin} color="#16a34a" />
      </section>
    </div>
  );
}
