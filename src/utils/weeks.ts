/**
 * ISO week helpers. Ported from the SolidJS app unchanged — pure logic, no
 * framework coupling.
 */

export interface WeekInfo {
  week: number;
  year: number;
  monday: Date;
  label: string;
  dateLabel: string;
  isoDate: string;
}

export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function getMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}

export function formatShortDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export function formatISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function generateWeeks(year: number, startWeek = 1, endWeek = 52): WeekInfo[] {
  const weeks: WeekInfo[] = [];
  for (let w = startWeek; w <= endWeek; w++) {
    const monday = getMonday(year, w);
    weeks.push({
      week: w,
      year,
      monday,
      label: `W${w}`,
      dateLabel: formatShortDate(monday),
      isoDate: formatISODate(monday),
    });
  }
  return weeks;
}

export function generateWeeksFromNow(countForward: number, countBack = 2): WeekInfo[] {
  const now = new Date();
  const currentMonday = new Date(now);
  const dow = currentMonday.getDay() || 7;
  currentMonday.setDate(currentMonday.getDate() - dow + 1);

  const weeks: WeekInfo[] = [];
  const startDate = new Date(currentMonday);
  startDate.setDate(startDate.getDate() - countBack * 7);

  for (let i = 0; i < countBack + countForward; i++) {
    const monday = new Date(startDate);
    monday.setDate(startDate.getDate() + i * 7);
    const week = getWeekNumber(monday);
    const year = monday.getFullYear();
    weeks.push({
      week,
      year,
      monday,
      label: `W${week}`,
      dateLabel: formatShortDate(monday),
      isoDate: formatISODate(monday),
    });
  }
  return weeks;
}

export function latestPlannedWeek(weekDates: string[]): Date | null {
  if (weekDates.length === 0) return null;
  const dates = weekDates.map((d) => new Date(d)).filter((d) => !isNaN(d.getTime()));
  if (dates.length === 0) return null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

export function getCurrentWeek(): { week: number; year: number } {
  const now = new Date();
  return { week: getWeekNumber(now), year: now.getFullYear() };
}
