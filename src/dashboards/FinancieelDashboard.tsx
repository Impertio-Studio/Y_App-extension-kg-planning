import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDashboards, deriveMonthlyArray } from "./store";
import KpiCard from "./components/KpiCard";
import { MonthlyBarChart, MonthlyLineChart, CategoryBarChart } from "./components/ChartCanvas";
import { MONTH_LABELS, formatEuro, formatUrenNL } from "./format";

function pctChange(current: number, previous: number): string | undefined {
  if (previous === 0 && current === 0) return undefined;
  if (previous === 0) return `Vorig jaar: ${formatEuro(0)}`;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `Vorig jaar: ${formatEuro(previous)} (${sign}${pct.toFixed(1)}%)`;
}

export default function FinancieelDashboard() {
  const { t } = useTranslation();
  const { data, openDrilldown } = useDashboards();

  const hours = useMemo(() => deriveMonthlyArray(data?.monthly ?? [], "uren"), [data?.monthly]);
  const factHours = useMemo(() => deriveMonthlyArray(data?.monthly ?? [], "fact_uren"), [data?.monthly]);
  const spending = useMemo(() => deriveMonthlyArray(data?.monthly ?? [], "kosten"), [data?.monthly]);
  const invoicedMonthly = useMemo(() => {
    const arr = new Array(12).fill(0);
    for (const r of data?.invoicesMonth ?? []) {
      const idx = (r.maand || 0) - 1;
      if (idx >= 0 && idx < 12) arr[idx] = r.totaal || 0;
    }
    return arr;
  }, [data?.invoicesMonth]);

  if (!data) return null;

  const totalInvoiced = data.invoicesMonth.reduce((s, r) => s + (r.totaal || 0), 0);
  const totalSpent = data.monthly.reduce((s, r) => s + (r.kosten || 0), 0);
  const totalHours = data.monthly.reduce((s, r) => s + (r.uren || 0), 0);
  const rendement = totalInvoiced - totalSpent;
  const prevRendement = data.prevYear.facturatie - data.prevYear.kosten;

  const monthlyFinancial = MONTH_LABELS.map((label, i) => ({
    label, kosten: spending[i], facturatie: invoicedMonthly[i],
  }));
  const monthlyHoursRows = MONTH_LABELS.map((label, i) => ({
    label, uren: hours[i], fact_uren: factHours[i],
  }));
  const employeeBars = data.employees.map((e) => ({ label: e.persoon, value: e.uren }));

  return (
    <div className="flex flex-col gap-6 p-4 overflow-auto">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title={t("extensions.kg_planning.dashboards.kpi_rendement")}
          value={formatEuro(rendement)} comparison={pctChange(rendement, prevRendement)}
          negative={rendement < 0} />
        <KpiCard title={t("extensions.kg_planning.dashboards.kpi_facturatie")}
          value={formatEuro(totalInvoiced)} comparison={pctChange(totalInvoiced, data.prevYear.facturatie)} />
        <KpiCard title={t("extensions.kg_planning.dashboards.kpi_kosten")}
          value={formatEuro(totalSpent)} comparison={pctChange(totalSpent, data.prevYear.kosten)} />
        <KpiCard title={t("extensions.kg_planning.dashboards.kpi_uren")}
          value={formatUrenNL(totalHours)} comparison={pctChange(totalHours, data.prevYear.uren)} />
      </div>

      <Panel title={t("extensions.kg_planning.dashboards.chart_spending")}>
        <MonthlyLineChart
          labels={MONTH_LABELS}
          series={[
            { key: "kosten", label: t("extensions.kg_planning.dashboards.kpi_kosten"), color: "#dc2626" },
            { key: "facturatie", label: t("extensions.kg_planning.dashboards.kpi_facturatie"), color: "#16a34a" },
          ]}
          rows={monthlyFinancial}
        />
      </Panel>

      <Panel title={t("extensions.kg_planning.dashboards.chart_hours")}>
        <MonthlyBarChart
          labels={MONTH_LABELS}
          series={[
            { key: "uren", label: t("extensions.kg_planning.dashboards.kpi_uren"), color: "#3b82f6" },
            { key: "fact_uren", label: t("extensions.kg_planning.dashboards.kpi_fact_uren"), color: "#14b8a6" },
          ]}
          rows={monthlyHoursRows}
        />
      </Panel>

      <Panel title={t("extensions.kg_planning.dashboards.chart_employees")}>
        <CategoryBarChart
          data={employeeBars}
          onBarClick={(_, label) =>
            openDrilldown(
              t("extensions.kg_planning.dashboards.detail_title_employee", { name: label }),
              (row) => row.persoon === label,
            )
          }
        />
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
