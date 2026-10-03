import { isSameBusinessDay } from "@/lib/time/business-tz";
import { sqlSafeTimeZone } from "@/lib/reports/business-month";
import { UI } from "@/lib/vocabulary";

const ACTIVE_LOOK_STATUSES = ["dispatched", "traveling", "arrived", "in_progress", "waiting"] as const;

/**
 * A standalone look belongs on Today when it is already underway, or when it
 * is scheduled for the current business day. Later appointments stay off the list.
 */
export function includeStandaloneLookOnToday(input: {
  status: string;
  scheduledStart: string | null;
  now?: Date;
}): boolean {
  if (input.status === "completed" || input.status === "cancelled") return false;
  if ((ACTIVE_LOOK_STATUSES as readonly string[]).includes(input.status)) return true;
  if (!input.scheduledStart) return false;
  return isSameBusinessDay(input.scheduledStart, input.now ?? new Date());
}

export function standaloneLookTodaySql(timeZone: string): string {
  const zone = sqlSafeTimeZone(timeZone);
  const statuses = ACTIVE_LOOK_STATUSES.map((status) => `'${status}'`).join(", ");
  return `(v.status IN (${statuses}) OR (v.scheduled_start IS NOT NULL AND (v.scheduled_start AT TIME ZONE '${zone}')::date = (now() AT TIME ZONE '${zone}')::date))`;
}

export function todayJobCountLabel(count: number): string {
  return `${count} ${count === 1 ? "job" : "jobs"}`;
}

export function todayJobsHeading(): string {
  return UI.jobs;
}

/** Field list that mixes jobs and looks. The operator does not pick a record type. */
export function todayWorkHeading(): string {
  return "Today's Work";
}

export function todayWorkCountLabel(count: number): string {
  if (count === 0) return "Nothing scheduled";
  if (count === 1) return "1 thing today";
  return `${count} things today`;
}

export type TodayWorkSortable = {
  active: boolean;
  sortTime: string | null;
};

/** Active work first, then earliest scheduled time. Items with no time go last. */
export function compareTodayWork(a: TodayWorkSortable, b: TodayWorkSortable): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.sortTime == null && b.sortTime == null) return 0;
  if (a.sortTime == null) return 1;
  if (b.sortTime == null) return -1;
  if (a.sortTime < b.sortTime) return -1;
  if (a.sortTime > b.sortTime) return 1;
  return 0;
}

export function todayEmptyCopy(): { title: string; description: string } {
  return {
    title: "No jobs today",
    description: "When you have a job today, it appears here. Start your day above to clock in.",
  };
}
