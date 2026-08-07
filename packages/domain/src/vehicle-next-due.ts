/**
 * Service / renewal next-due calculators (TASK-093).
 * Last-done from service records (non-suspect); next = min of miles and months windows.
 */

export type ServiceRecordForDue = {
  servicedAt: string; // ISO date
  odometer: number | null;
  odometerSuspect: boolean;
  serviceTypes: string[];
};

export type ServiceScheduleForDue = {
  serviceType: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
  isActive: boolean;
};

export type NextDueResult = {
  serviceType: string;
  dueOdometer: number | null;
  dueDate: string | null; // YYYY-MM-DD
  /** Miles until due (negative = overdue). null if no miles schedule. */
  milesRemaining: number | null;
  /** Days until due (negative = overdue). null if no months schedule. */
  daysRemaining: number | null;
  status: "ok" | "due_soon" | "overdue" | "unknown";
};

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00Z`).getTime();
  const b = new Date(`${toIso}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

export function lastDoneForType(
  records: ServiceRecordForDue[],
  serviceType: string,
): ServiceRecordForDue | null {
  const hits = records
    .filter(
      (r) =>
        !r.odometerSuspect &&
        r.serviceTypes.includes(serviceType),
    )
    .sort((a, b) => b.servicedAt.localeCompare(a.servicedAt));
  return hits[0] ?? null;
}

/**
 * Compute next-due for one schedule given current odometer and today.
 * due_soon window: 500 mi or 14 days (defaults).
 */
export function computeServiceNextDue(input: {
  schedule: ServiceScheduleForDue;
  records: ServiceRecordForDue[];
  currentOdometer: number | null;
  today: string; // YYYY-MM-DD
  soonMiles?: number;
  soonDays?: number;
}): NextDueResult {
  const { schedule, records, currentOdometer, today } = input;
  const soonMiles = input.soonMiles ?? 500;
  const soonDays = input.soonDays ?? 14;
  const last = lastDoneForType(records, schedule.serviceType);

  let dueOdometer: number | null = null;
  let dueDate: string | null = null;

  if (schedule.intervalMiles != null && last?.odometer != null) {
    dueOdometer = last.odometer + schedule.intervalMiles;
  }
  if (schedule.intervalMonths != null && last) {
    dueDate = addMonths(last.servicedAt.slice(0, 10), schedule.intervalMonths);
  } else if (schedule.intervalMonths != null && !last) {
    // No history → due now on calendar axis
    dueDate = today;
  }

  if (schedule.intervalMiles != null && !last) {
    // Miles schedule with no prior → unknown until first service
    if (dueDate == null) {
      return {
        serviceType: schedule.serviceType,
        dueOdometer: null,
        dueDate: null,
        milesRemaining: null,
        daysRemaining: null,
        status: "unknown",
      };
    }
  }

  const milesRemaining =
    dueOdometer != null && currentOdometer != null
      ? dueOdometer - currentOdometer
      : null;
  const daysRemaining = dueDate != null ? daysBetween(today, dueDate) : null;

  let status: NextDueResult["status"] = "ok";
  if (
    (milesRemaining != null && milesRemaining < 0) ||
    (daysRemaining != null && daysRemaining < 0)
  ) {
    status = "overdue";
  } else if (
    (milesRemaining != null && milesRemaining <= soonMiles) ||
    (daysRemaining != null && daysRemaining <= soonDays)
  ) {
    status = "due_soon";
  } else if (milesRemaining == null && daysRemaining == null) {
    status = "unknown";
  }

  return {
    serviceType: schedule.serviceType,
    dueOdometer,
    dueDate,
    milesRemaining,
    daysRemaining,
    status,
  };
}

export type RenewalForDue = {
  renewalType: string;
  currentDueDate: string;
  isActive: boolean;
};

export function computeRenewalDueStatus(input: {
  renewal: RenewalForDue;
  today: string;
  soonDays?: number;
}): { daysRemaining: number; status: "ok" | "due_soon" | "overdue" } {
  const soonDays = input.soonDays ?? 30;
  const daysRemaining = daysBetween(input.today, input.renewal.currentDueDate);
  let status: "ok" | "due_soon" | "overdue" = "ok";
  if (daysRemaining < 0) status = "overdue";
  else if (daysRemaining <= soonDays) status = "due_soon";
  return { daysRemaining, status };
}

/** Soft-flag odometer if lower than last known. */
export function shouldFlagSuspectOdometer(
  odometer: number | null | undefined,
  lastKnown: number | null | undefined,
): boolean {
  if (odometer == null || lastKnown == null) return false;
  return odometer < lastKnown;
}
