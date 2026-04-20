import type { DashboardLoadResult, DrilldownRow } from "./types";

export interface DashboardDataSource {
  loadAll(range: { from: string; to: string }): Promise<DashboardLoadResult>;
  loadDrilldown(range: { from: string; to: string }): Promise<DrilldownRow[]>;
}
