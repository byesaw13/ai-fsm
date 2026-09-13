import {
  GPS_HOP_NOISE_MILES,
  isClaimMilesSource,
  isGpsEstimateSource,
  type MilesSource,
  type VehicleSessionStatus,
} from "./mileage";

export type MileageMonthSession = {
  id: string;
  session_date: string;
  miles: number;
  miles_source: MilesSource | null;
  status: VehicleSessionStatus | string | null;
  start_odometer: number | null;
  end_odometer: number | null;
  notes: string | null;
  tagged: boolean;
};

export type MileageDayGroup = {
  date: string;
  claimMiles: number;
  gpsMiles: number;
  claimSessions: MileageMonthSession[];
  gpsHops: MileageMonthSession[];
  hiddenNoiseHops: number;
  untaggedClaim: boolean;
};

export type MileageMonthSummary = {
  claimMiles: number;
  gpsMiles: number;
  claimDays: number;
  hiddenVoided: number;
  hiddenNoiseHops: number;
  days: MileageDayGroup[];
};

export function isVisibleClaimSession(s: MileageMonthSession): boolean {
  return s.status !== "voided" && isClaimMilesSource(s.miles_source);
}

export function isVisibleGpsHop(s: MileageMonthSession): boolean {
  return (
    s.status !== "voided" &&
    isGpsEstimateSource(s.miles_source) &&
    s.miles >= GPS_HOP_NOISE_MILES
  );
}

export function groupMileageMonth(sessions: MileageMonthSession[]): MileageMonthSummary {
  const hiddenVoided = sessions.filter((s) => s.status === "voided").length;
  const byDate = new Map<string, MileageMonthSession[]>();
  for (const s of sessions) {
    if (s.status === "voided") continue;
    const list = byDate.get(s.session_date) ?? [];
    list.push(s);
    byDate.set(s.session_date, list);
  }

  const days: MileageDayGroup[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([date, rows]) => {
      const claimSessions = rows.filter((s) => isClaimMilesSource(s.miles_source));
      const gpsAll = rows.filter((s) => isGpsEstimateSource(s.miles_source));
      const gpsHops = gpsAll.filter((s) => s.miles >= GPS_HOP_NOISE_MILES);
      const hiddenNoiseHops = gpsAll.length - gpsHops.length;
      const claimMiles = round1(claimSessions.reduce((n, s) => n + s.miles, 0));
      const gpsMiles = round1(gpsHops.reduce((n, s) => n + s.miles, 0));
      return {
        date,
        claimMiles,
        gpsMiles,
        claimSessions,
        gpsHops,
        hiddenNoiseHops,
        untaggedClaim: claimSessions.some((s) => !s.tagged),
      };
    });

  const visibleDays = days.filter((d) => d.claimSessions.length > 0 || d.gpsHops.length > 0);

  return {
    claimMiles: round1(visibleDays.reduce((n, d) => n + d.claimMiles, 0)),
    gpsMiles: round1(visibleDays.reduce((n, d) => n + d.gpsMiles, 0)),
    claimDays: visibleDays.filter((d) => d.claimSessions.length > 0).length,
    hiddenVoided,
    hiddenNoiseHops: days.reduce((n, d) => n + d.hiddenNoiseHops, 0),
    days: visibleDays,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
