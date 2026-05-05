import { MAINTENANCE_SCHEDULE_DAY_OF_WEEK, MAINTENANCE_JOB_CATEGORIES } from "@ai-fsm/domain";
import type { JobAcceptanceCategory } from "@ai-fsm/domain";

export function reviewScheduleDay(
  scheduledDate: string | null,
  jobCategory: string | null
): { warning: string | null } {
  if (!scheduledDate || !jobCategory) return { warning: null };
  // Parse without timezone to avoid day-shift from UTC conversion
  const [y, m, d] = scheduledDate.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  const isProtectedDay = day === MAINTENANCE_SCHEDULE_DAY_OF_WEEK;
  const isProjectCategory = !MAINTENANCE_JOB_CATEGORIES.includes(
    jobCategory as JobAcceptanceCategory
  );
  if (isProtectedDay && isProjectCategory) {
    return {
      warning:
        "Wednesday is a maintenance day. Consider rescheduling project work to another day to protect membership capacity.",
    };
  }
  return { warning: null };
}
