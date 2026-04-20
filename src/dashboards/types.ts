/** Raw rows returned by the seven Insights queries. Field names match the
 *  column order defined in upstream `stores/dashboards.ts`. Changing these
 *  means changing the Insights query shapes too. */

export interface MonthlyRow {
  maand: number;
  uren: number;
  fact_uren: number;
  kosten: number;
  omzet: number;
}

export interface EmployeeRow {
  persoon: string;
  uren: number;
  fact_uren: number;
  intern_uren: number;
  kosten: number;
  omzet: number;
}

export interface ProjectRow {
  nr: string;
  naam: string;
  uren: number;
  fact_uren: number;
  kosten: number;
  omzet: number;
  budget_uren: number;
}

export interface InvoiceMonthRow {
  maand: number;
  totaal: number;
}

export interface InternRow {
  omschrijving: string;
  uren: number;
}

export interface SickRow {
  persoon: string;
  dagen: number;
}

export interface PrevYearRow {
  uren: number;
  fact_uren: number;
  kosten: number;
  intern_uren: number;
  ziek_uren: number;
  facturatie: number;
}

export interface RawDashboardData {
  monthly: MonthlyRow[];
  employees: EmployeeRow[];
  projects: ProjectRow[];
  invoicesMonth: InvoiceMonthRow[];
  intern: InternRow[];
  sick: SickRow[];
  prevYear: PrevYearRow;
}

export interface DrilldownRow {
  persoon: string;
  project: string;
  task: string;
  datum: string;
  klant: string;
  omschrijving: string;
  start: string;
  eind: string;
  uren: number;
  facturabel: number;
  fact_uren: number;
}

export type DashboardLoadResult =
  | { kind: "ok"; data: RawDashboardData }
  | { kind: "not_configured"; missing: string[] }
  | { kind: "error"; message: string };
