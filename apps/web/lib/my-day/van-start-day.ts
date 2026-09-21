import type { PoolClient } from "pg";
import { clockIn, getOpenClock } from "@/lib/operations/time-clock";
import { businessToday } from "@/lib/operations/business-day";
import {
  findOpenSessionForVehicle,
  lastKnownOdometer,
  startOpenVehicleSession,
} from "@/lib/mileage/sessions";

export type CompanyDayConnectInput = {
  alreadyClockedIn: boolean;
  hasOpenSession: boolean;
  vehicleId: string | null | undefined;
  lastOdometer: number | null;
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
  if (input.hasOpenSession || !odoKnown) {
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
  const openClock = await d.getOpenClock(client, args.accountId, args.userId);
  const openSession = await d.findOpenSessionForVehicle(client, args.accountId, args.vehicleId);
  const lastOdo = await d.lastKnownOdometer(client, args.accountId, args.vehicleId);

  const action = startCompanyDayOnConnect({
    alreadyClockedIn: openClock != null,
    hasOpenSession: openSession != null,
    vehicleId: args.vehicleId,
    lastOdometer: lastOdo,
  });

  if (action.clockIn) {
    await d.clockIn(client, args.accountId, args.userId, { notes: VAN_CONNECT_NOTE });
  }
  if (action.startSession && action.startOdometer != null) {
    await d.startOpenVehicleSession(client, {
      accountId: args.accountId,
      userId: args.userId,
      vehicleId: args.vehicleId,
      sessionDate: args.sessionDate ?? businessToday(),
      startOdometer: action.startOdometer,
      notes: VAN_CONNECT_NOTE,
    });
  }
  return action;
}
