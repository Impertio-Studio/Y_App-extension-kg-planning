import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDashboards } from "./store";
import KpiCard from "./components/KpiCard";
import { CategoryBarChart } from "./components/ChartCanvas";
import { formatNumber, formatUrenNL } from "./format";

function pctChange(
  current: number,
  previous: number,
  format: (n: number) => string,
): string | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return `Vorig jaar: ${format(0)}`;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `Vorig jaar: ${format(previous)} (${sign}${pct.toFixed(1)}%)`;
}

export default function HrDashboard() {
  const { t } = useTranslation();
  const { data, openDrilldown } = useDashboards();

  const employeeInternBars = useMemo(
    () =>
      (data?.employees ?? [])
        .filter((e) => (e.intern_uren || 0) > 0)
        .map((e) => ({ label: e.persoon, value: e.intern_uren })),
    [data?.employees],
  );

  const internByDescription = useMemo(
    () => (data?.intern ?? []).map((r) => ({ label: r.omschrijving, value: r.uren })),
    [data?.intern],
  );

  const sickBars = useMemo(
    () => (data?.sick ?? []).map((r) => ({ label: r.persoon, value: r.dagen })),
    [data?.sick],
  );

  if (!data) return null;

  const totalHours = data.monthly.reduce((s, r) => s + (r.uren || 0), 0);
  const totalFactHours = data.monthly.reduce((s, r) => s + (r.fact_uren || 0), 0);
  const totalInternHours = data.employees.reduce((s, r) => s + (r.intern_uren || 0), 0);
  const totalSickDays = data.sick.reduce((s, r) => s + (r.dagen || 0), 0);

  return (
    <div className="flex flex-col gap-6 p-4 overflow-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          title={t("extensions.kg_planning.dashboards.kpi_uren")}
          value={formatUrenNL(totalHours)}
          comparison={pctChange(totalHours, data.prevYear.uren, formatUrenNL)}
        />
        <KpiCard
          title={t("extensions.kg_planning.dashboards.kpi_fact_uren")}
          value={formatUrenNL(totalFactHours)}
          comparison={pctChange(totalFactHours, data.prevYear.fact_uren, formatUrenNL)}
        />
        <KpiCard
          title={t("extensions.kg_planning.dashboards.kpi_intern_uren")}
          value={formatUrenNL(totalInternHours)}
          comparison={pctChange(totalInternHours, data.prevYear.intern_uren, formatUrenNL)}
        />
        <KpiCard
          title={t("extensions.kg_planning.dashboards.kpi_ziekteverzuim")}
          value={formatNumber(totalSickDays)}
          comparison={pctChange(totalSickDays, data.prevYear.ziek_uren, formatNumber)}
          warning={totalSickDays > 0}
        />
      </div>

      <Panel title={t("extensions.kg_planning.dashboards.chart_employees")}>
        <CategoryBarChart
          data={employeeInternBars}
          color="#f59e0b"
          onBarClick={(_, label) =>
            openDrilldown(
              t("extensions.kg_planning.dashboards.detail_title_employee", { name: label }),
              (row) => row.persoon === label,
            )
          }
        />
      </Panel>

      <Panel title={t("extensions.kg_planning.dashboards.chart_intern")}>
        <CategoryBarChart
          data={internByDescription}
          color="#6366f1"
          onBarClick={(_, label) =>
            openDrilldown(
              `${t("extensions.kg_planning.dashboards.chart_intern")}: ${label}`,
              (row) => row.omschrijving === label,
            )
          }
        />
      </Panel>

      <Panel title={t("extensions.kg_planning.dashboards.chart_sick")}>
        <CategoryBarChart data={sickBars} color="#dc2626" />
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-lg border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </section>
  );
}
