import { UI } from "@/lib/vocabulary";

export function todayJobCountLabel(count: number): string {
  return `${count} ${count === 1 ? "job" : "jobs"}`;
}

export function todayJobsHeading(): string {
  return UI.jobs;
}

export function todayEmptyCopy(): { title: string; description: string } {
  return {
    title: "No jobs today",
    description: "When you have a job today, it appears here. Start your day above to clock in.",
  };
}
