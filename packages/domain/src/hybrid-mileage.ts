/**
 * Hybrid mileage verification (TASK-091): odometer is tax PRIMARY;
 * GPS drive sum is corroboration. Comparison rule is checkMileageDelta.
 */
import { checkMileageDelta, type MileageDeltaResult } from "./day-review";
import { milesSourceLabel, type MilesSource } from "./mileage";

export type HybridVerifyReason = MileageDeltaResult["reason"];

export type HybridMileageDaySummary = {
  vehicleSessionId: string | null;
  vehicleName: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  /** Tax claim — odometer or manual primary miles. */
  primaryMiles: number | null;
  primarySource: MilesSource | null;
  /** Independent GPS corroboration (miles). */
  gpsMiles: number;
  deltaPercent: number | null;
  flagged: boolean;
  reason: HybridVerifyReason;
};

/** Owner-facing verify label for Day Review / Timeline / export. */
export function hybridVerifyLabel(reason: HybridVerifyReason, deltaPercent: number | null): string {
  if (reason === "ok") return "OK — GPS corroborates odometer";
  if (reason === "diverged") {
    const pct = deltaPercent != null ? ` (${deltaPercent}%)` : "";
    return `Diverged${pct} — review before claiming`;
  }
  if (reason === "no_gps_coverage") return "No GPS coverage — odometer stands";
  return "No odometer trip to compare";
}

export function buildHybridMileageDaySummary(input: {
  vehicleSessionId: string | null;
  vehicleName: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  primaryMiles: number | null;
  primarySource: MilesSource | null;
  gpsMiles: number;
}): HybridMileageDaySummary {
  const delta = checkMileageDelta(input.primaryMiles, input.gpsMiles);
  return {
    vehicleSessionId: input.vehicleSessionId,
    vehicleName: input.vehicleName,
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    primaryMiles: input.primaryMiles,
    primarySource: input.primarySource,
    gpsMiles: Math.round(input.gpsMiles * 10) / 10,
    deltaPercent: delta.deltaPercent,
    flagged: delta.flagged,
    reason: delta.reason,
  };
}

export type HybridMileageExportRow = {
  date: string;
  vehicleName: string;
  startOdometer: number | null;
  endOdometer: number | null;
  primaryMiles: number | null;
  primaryMethod: string;
  gpsMiles: number;
  verify: string;
  vehicleSessionId: string;
};

export function buildHybridMileageExportRow(input: {
  date: string;
  vehicleSessionId: string;
  vehicleName: string | null;
  startOdometer: number | null;
  endOdometer: number | null;
  primaryMiles: number | null;
  primarySource: MilesSource | null;
  gpsMiles: number;
}): HybridMileageExportRow {
  const summary = buildHybridMileageDaySummary({
    vehicleSessionId: input.vehicleSessionId,
    vehicleName: input.vehicleName,
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    primaryMiles: input.primaryMiles,
    primarySource: input.primarySource,
    gpsMiles: input.gpsMiles,
  });
  return {
    date: input.date,
    vehicleName: input.vehicleName ?? "Vehicle",
    startOdometer: input.startOdometer,
    endOdometer: input.endOdometer,
    primaryMiles: summary.primaryMiles,
    primaryMethod: milesSourceLabel(input.primarySource) ?? "Odometer",
    gpsMiles: summary.gpsMiles,
    verify: hybridVerifyLabel(summary.reason, summary.deltaPercent),
    vehicleSessionId: input.vehicleSessionId,
  };
}

/** CSV for accountant hand-off (TASK-091). */
export function hybridMileageExportToCsv(rows: HybridMileageExportRow[]): string {
  const header = [
    "date",
    "vehicle",
    "start_odometer",
    "end_odometer",
    "primary_miles",
    "primary_method",
    "gps_miles",
    "verify",
    "vehicle_session_id",
  ];
  const escape = (v: string | number | null): string => {
    if (v == null) return "";
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.date,
        r.vehicleName,
        r.startOdometer,
        r.endOdometer,
        r.primaryMiles,
        r.primaryMethod,
        r.gpsMiles,
        r.verify,
        r.vehicleSessionId,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n") + "\n";
}
