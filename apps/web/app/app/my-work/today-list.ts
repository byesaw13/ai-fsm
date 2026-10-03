import { UI } from "@/lib/vocabulary";

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
