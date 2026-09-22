import type { PoolClient } from "pg";
import { clockIn, getOpenClock } from "@/lib/operations/time-clock";
import { businessToday } from "@/lib/operations/business-day";
import {
  findOpenSessionForVehicle,
  lastKnownOdometer,
  startOpenVehicleSession,
} from "@/lib/mileage/sessions";
import { priorDayNeedsMileage } from "./day-setup";

export type CompanyDayConnectInput = {
  alreadyClockedIn: boolean;
  hasOpenSession: boolean;
  vehicleId: string | null | undefined;
  lastOdometer: number | null;
  priorDayNeedsMileage?: boolean;
};

export type CompanyDayConnectAction = {
  clockIn: boolean;
  startSession: boolean;
  startOdometer: number | null;
};

const NOOP: CompanyDayConnectAction = { clockIn: false, startSession: false, startOdometer: null };

function isKnownOdometer(n: number | null): n is number {
  return n != null && Number.isInteger(n) && n >= 0;
}

/** Bluetooth vehicle_connect is Start day. Never clocks out, closes day, or starts job_work. */
export function startCompanyDayOnConnect(input: CompanyDayConnectInput): CompanyDayConnectAction {
  if (!input.vehicleId) return NOOP;
  if (input.alreadyClockedIn && input.hasOpenSession) return NOOP;

  const odoKnown = isKnownOdometer(input.lastOdometer);
  if (input.hasOpenSession || !odoKnown || input.priorDayNeedsMileage) {
    return input.alreadyClockedIn ? NOOP : { clockIn: true, startSession: false, startOdometer: null };
  }

  return { clockIn: true, startSession: true, startOdometer: input.lastOdometer };
}

export function shouldStartCompanyDayOnEvent(kind: string): boolean {
  return kind === "vehicle_connect";
}

export function locationEventDropReason(input: {
  enabled: boolean;
  paused: boolean;
  activeSession: boolean;
  kind: string;
}): "tracking_disabled" | "paused" | "no_active_workday" | null {
  if (!input.enabled) return "tracking_disabled";
  if (input.paused) return "paused";
  if (!input.activeSession && !shouldStartCompanyDayOnEvent(input.kind)) return "no_active_workday";
  return null;
}

export type CompanyDayConnectDeps = {
  getOpenClock: typeof getOpenClock;
  clockIn: typeof clockIn;
  lastKnownOdometer: typeof lastKnownOdometer;
  findOpenSessionForVehicle: typeof findOpenSessionForVehicle;
  startOpenVehicleSession: typeof startOpenVehicleSession;
};

const defaultDeps: CompanyDayConnectDeps = {
  getOpenClock,
  clockIn,
  lastKnownOdometer,
  findOpenSessionForVehicle,
  startOpenVehicleSession,
};

const VAN_CONNECT_NOTE = "Bluetooth vehicle connect";

export async function applyCompanyDayOnConnect(
  client: PoolClient,
  args: {
    accountId: string;
    userId: string;
    vehicleId: string | null;
    sessionDate?: string;
  },
  deps: Partial<CompanyDayConnectDeps> = {},
): Promise<CompanyDayConnectAction> {
  const d = { ...defaultDeps, ...deps };
  if (!args.vehicleId) return NOOP;

  // One pg client cannot pipeline queries; getOpenClock also takes FOR UPDATE.
  const today = args.sessionDate ?? businessToday();
  const openClock = await d.getOpenClock(client, args.accountId, args.userId);
  const openSession = await d.findOpenSessionForVehicle(client, args.accountId, args.vehicleId);
  const lastOdo = await d.lastKnownOdometer(client, args.accountId, args.vehicleId);
  const { lastWorkedDate, lastEndedMileageDate } = await loadPriorWorkAndMileageDates(
    client,
    args.accountId,
    args.userId,
    today,
  );
  const priorOpenSessionDate =
    openSession && openSession.session_date < today ? openSession.session_date : null;

  const action = startCompanyDayOnConnect({
    alreadyClockedIn: openClock != null,
    hasOpenSession: openSession != null && openSession.session_date >= today,
    vehicleId: args.vehicleId,
    lastOdometer: lastOdo,
    priorDayNeedsMileage: priorDayNeedsMileage({
      today,
      priorOpenSessionDate,
      lastWorkedDate,
      lastEndedMileageDate,
    }),
  });

  if (action.clockIn) {
    await d.clockIn(client, args.accountId, args.userId, { notes: VAN_CONNECT_NOTE });
  }
  if (action.startSession && action.startOdometer != null) {
    await d.startOpenVehicleSession(client, {
      accountId: args.accountId,
      userId: args.userId,
      vehicleId: args.vehicleId,
      sessionDate: today,
      startOdometer: action.startOdometer,
      notes: VAN_CONNECT_NOTE,
    });
  }
  return action;
}

async function loadPriorWorkAndMileageDates(
  client: PoolClient,
  accountId: string,
  userId: string,
  today: string,
): Promise<{ lastWorkedDate: string | null; lastEndedMileageDate: string | null }> {
  const worked = await client.query<{ last_worked: string | null }>(
    `SELECT MAX(d)::text AS last_worked FROM (
       SELECT session_date AS d FROM vehicle_sessions
        WHERE account_id = $1 AND created_by = $2 AND session_date < $3::date AND status <> 'voided'
       UNION ALL
       SELECT clock_in_at::date FROM time_clock_sessions
        WHERE account_id = $1 AND user_id = $2 AND voided_at IS NULL AND clock_in_at::date < $3::date
       UNION ALL
       SELECT scheduled_start::date FROM visits
        WHERE account_id = $1 AND assigned_user_id = $2
          AND status NOT IN ('cancelled') AND scheduled_start::date < $3::date
     ) x`,
    [accountId, userId, today],
  );
  const ended = await client.query<{ last_ended: string | null }>(
    `SELECT MAX(session_date)::text AS last_ended
       FROM vehicle_sessions
      WHERE account_id = $1 AND created_by = $2
        AND end_odometer IS NOT NULL AND session_date < $3::date`,
    [accountId, userId, today],
  );
  return {
    lastWorkedDate: worked.rows[0]?.last_worked ?? null,
    lastEndedMileageDate: ended.rows[0]?.last_ended ?? null,
  };
}
