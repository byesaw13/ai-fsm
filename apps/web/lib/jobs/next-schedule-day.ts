import { BUSINESS_TIMEZONE, businessToday } from "@/lib/operations/business-day";

export interface PriorVisitForSchedule {
  scheduled_start: string;
  scheduled_end: string;
  assigned_user_id?: string | null;
  work_order_id?: string | null;
  visit_type?: string | null;
  status?: string | null;
}

export interface NextScheduleDayPrefill {
  date: string;
  startTime: string;
  durationMinutes: number;
  assignedUserId: string | null;
  workOrderId: string | null;
}

/** Calendar date (YYYY-MM-DD) of an instant in the business timezone. */
export function businessDateOf(iso: string, tz: string = BUSINESS_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
}

/** Clock time HH:MM (24h) of an instant in the business timezone. */
export function businessTimeOf(iso: string, tz: string = BUSINESS_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "08";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  // Some locales emit "24" for midnight.
  const hour = String(Number(hourRaw) % 24).padStart(2, "0");
  return `${hour}:${minute}`;
}

/** Add N calendar days to a YYYY-MM-DD string (UTC-noon math avoids DST edge cases). */
export function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Pick the next day to book after the last scheduled visit.
 * Uses the day after the prior visit's business date, floored to today
 * when that would land in the past.
 */
export function nextDayAfterVisit(
  priorStartIso: string,
  today: string = businessToday(),
  tz: string = BUSINESS_TIMEZONE,
): string {
  const priorDate = businessDateOf(priorStartIso, tz);
  const candidate = addCalendarDays(priorDate, 1);
  return candidate < today ? today : candidate;
}

function durationMinutes(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 480;
  // Round to nearest 30 min so it matches ScheduleFields options.
  const mins = Math.round(ms / 60_000);
  return Math.max(30, Math.round(mins / 30) * 30);
}

/**
 * Build prefill values for "add another day" from the most recent
 * non-cancelled execution visit on the project.
 */
export function buildNextScheduleDayPrefill(
  visits: PriorVisitForSchedule[],
  opts: { today?: string; tz?: string } = {},
): NextScheduleDayPrefill | null {
  const today = opts.today ?? businessToday();
  const tz = opts.tz ?? BUSINESS_TIMEZONE;

  const prior = [...visits]
    .filter(
      (v) =>
        v.status !== "cancelled" &&
        (v.visit_type === "standard" ||
          v.visit_type === "punch_list" ||
          !v.visit_type),
    )
    .sort(
      (a, b) =>
        new Date(b.scheduled_start).getTime() - new Date(a.scheduled_start).getTime(),
    )[0];

  if (!prior) return null;

  return {
    date: nextDayAfterVisit(prior.scheduled_start, today, tz),
    startTime: businessTimeOf(prior.scheduled_start, tz),
    durationMinutes: durationMinutes(prior.scheduled_start, prior.scheduled_end),
    assignedUserId: prior.assigned_user_id ?? null,
    workOrderId: prior.work_order_id ?? null,
  };
}

/** Build /visits/new query string for an easy "Add a day" handoff. */
export function buildAddDayHref(
  jobId: string,
  visits: PriorVisitForSchedule[],
  opts: { today?: string; tz?: string } = {},
): string {
  const base = `/app/jobs/${jobId}/visits/new`;
  const params = new URLSearchParams({
    visit_type: "standard",
    intent: "book_work",
  });

  const prefill = buildNextScheduleDayPrefill(visits, opts);
  if (prefill) {
    params.set("date", prefill.date);
    params.set("start", prefill.startTime);
    params.set("duration", String(prefill.durationMinutes));
    if (prefill.workOrderId) params.set("work_order_id", prefill.workOrderId);
    if (prefill.assignedUserId) params.set("assigned_user_id", prefill.assignedUserId);
  }

  return `${base}?${params.toString()}`;
}
