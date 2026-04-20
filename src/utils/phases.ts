/**
 * Architecture/engineering phase codes used by Kort Geytenbeek.
 * Ported from the SolidJS app's `utils/calculations.ts`.
 */

export type PhaseCode = string;

const DEFAULT_PHASE = { bg: "#f0f0f0", text: "#495057", badge: "#6c757d" };

export const PHASE_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  IH: { bg: "#e8eaf6", text: "#283593", badge: "#3f51b5" },
  SO: { bg: "#e3f2fd", text: "#1565c0", badge: "#1e88e5" },
  VO: { bg: "#e8ddf5", text: "#4a2587", badge: "#7c4dff" },
  DO: { bg: "#e0f2f1", text: "#00695c", badge: "#00897b" },
  AO: { bg: "#fff8e1", text: "#f57f17", badge: "#ffb300" },
  TO: { bg: "#fce4ec", text: "#c62828", badge: "#ef5350" },
  UO: { bg: "#e8f5e9", text: "#2e7d32", badge: "#43a047" },
  UG: { bg: "#e8f5e9", text: "#2e7d32", badge: "#66bb6a" },
  DV: { bg: "#fff3e0", text: "#e65100", badge: "#fb8c00" },
  MW: { bg: "#fbe9e7", text: "#bf360c", badge: "#ff7043" },
  VK: { bg: "#efebe9", text: "#4e342e", badge: "#8d6e63" },
  ND: { bg: "#eceff1", text: "#37474f", badge: "#78909c" },
  AD: { bg: "#fffde7", text: "#827717", badge: "#c0ca33" },
  INT: { bg: "#f3e5f5", text: "#6a1b9a", badge: "#ab47bc" },
  AH: { bg: "#e0e0e0", text: "#424242", badge: "#757575" },
};

export function getPhaseColors(code: string | null): { bg: string; text: string; badge: string } {
  if (!code) return DEFAULT_PHASE;
  return PHASE_COLORS[code.toUpperCase()] || DEFAULT_PHASE;
}

/** Pull the 2-letter phase code out of either the dedicated custom field
 *  or an older-style subject like "30_VO Voorontwerp". Returns null when
 *  nothing recognisable shows up. */
export function extractPhaseCode(input: string): PhaseCode | null {
  if (!input) return null;
  const upper = input.trim().toUpperCase();

  if (upper in PHASE_COLORS) return upper as PhaseCode;

  const underscoreMatch = upper.match(/\d+_([A-Z]{2})\b/);
  if (underscoreMatch && underscoreMatch[1] in PHASE_COLORS) return underscoreMatch[1] as PhaseCode;

  const anyMatch = upper.match(/\b([A-Z]{2})\b/g);
  if (anyMatch) {
    for (const code of anyMatch) {
      if (code in PHASE_COLORS) return code as PhaseCode;
    }
  }

  return null;
}

export function remainingHours(budgetHours: number, progress: number): number {
  if (budgetHours <= 0) return 0;
  return budgetHours * (1 - Math.min(progress, 100) / 100);
}

export function plannedPercentage(totalPlanned: number, budgetHours: number, progress: number): number {
  const remaining = remainingHours(budgetHours, progress);
  if (remaining <= 0) return totalPlanned > 0 ? 100 : 0;
  return Math.round((totalPlanned / remaining) * 100);
}

export function capacityPercentage(weekTotal: number, contractHours: number): number {
  if (contractHours <= 0) return 0;
  return Math.round((weekTotal / contractHours) * 100);
}

export function capacityColor(pct: number): string {
  if (pct > 100) return "#f8d7da";
  if (pct >= 80) return "#d4edda";
  if (pct >= 60) return "";
  return "#fff3cd";
}

export function plannedColor(pct: number): string {
  if (pct >= 80) return "#198754";
  if (pct >= 40) return "#fd7e14";
  return "#dc3545";
}
