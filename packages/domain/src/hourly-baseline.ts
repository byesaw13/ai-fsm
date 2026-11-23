/**
 * Hourly baseline (TASK-194). Implements docs/working/hourly-baseline.md exactly.
 *
 * A reference only: nothing here changes a price. Money is in cents and is
 * rounded once, at the end. Hours are not rounded. A missing value stays
 * missing and is never read as 0.
 */

export interface BaselineLine {
  type: "labor" | "materials" | "equipment" | "handling_fee" | "adjustment";
  /** Driving time billed at the labor rate. Its hours count; its charge does not count again. */
  isTravelTime: boolean;
  hoursLow: number | null;
  hoursHigh: number | null;
  /** quantity x unit cost. Null means not entered. */
  costCents: number | null;
  /** quantity x unit price (the customer price). */
  priceCents: number;
}

export interface BaselineInput {
  lines: BaselineLine[];
  /** Estimate-level range. Used only when there are no work labor lines. */
  estimateHours: { low: number | null; high: number | null } | null;
  /** Other travel charges: travel lines that are not driving time, plus the estimate's travel surcharge. */
  travelSurchargeCents: number;
  sellRateCents: number;
  costFloorCents: number;
  /** 15 means 15%. */
  handlingPct: number;
  handlingOn: boolean;
  otherDirectCents: number | null;
  otherDirectConfirmed: boolean;
  /** The quote's selling total before tax. */
  quotedCents: number;
  /** 10 means a stronger warning from 10% below the midpoint. */
  warningPct: number;
}

export interface BaselineMissing {
  kind: "hours" | "cost" | "other_direct";
  lineIndex?: number;
}

export interface BaselineResult {
  complete: boolean;
  missing: BaselineMissing[];
  hours: { low: number; mid: number; high: number } | null;
  baseline: { low: number; mid: number; high: number } | null;
  gapCents: number | null;
  /** Two decimals. */
  gapPct: number | null;
  effectiveRateCents: number | null;
  warning: "none" | "below" | "strong";
  belowCostFloor: boolean | null;
}

function validRange(low: number | null | undefined, high: number | null | undefined): boolean {
  return (
    low != null && high != null &&
    Number.isFinite(low) && Number.isFinite(high) &&
    low >= 0 && high > 0 && low <= high
  );
}

function hasHourLine(line: BaselineLine): boolean {
  return line.type === "labor" || line.isTravelTime;
}

export function computeHourlyBaseline(input: BaselineInput): BaselineResult {
  const missing: BaselineMissing[] = [];
  const workLines = input.lines.filter((l) => l.type === "labor" && !l.isTravelTime);

  let low = 0;
  let high = 0;
  let hoursMissing = false;

  input.lines.forEach((line, lineIndex) => {
    if (!hasHourLine(line)) return;
    if (!validRange(line.hoursLow, line.hoursHigh)) {
      missing.push({ kind: "hours", lineIndex });
      hoursMissing = true;
      return;
    }
    low += line.hoursLow!;
    high += line.hoursHigh!;
  });

  if (workLines.length === 0) {
    const range = input.estimateHours;
    if (range && validRange(range.low, range.high)) {
      low += range.low!;
      high += range.high!;
    } else {
      missing.unshift({ kind: "hours" });
      hoursMissing = true;
    }
  }

  let materialsCost = 0;
  let handlingBase = 0;
  let equipmentCost = 0;
  let costsMissing = false;
  input.lines.forEach((line, lineIndex) => {
    if (line.type !== "materials" && line.type !== "equipment") return;
    if (line.costCents == null || !Number.isFinite(line.costCents)) {
      missing.push({ kind: "cost", lineIndex });
      costsMissing = true;
      return;
    }
    if (line.type === "equipment") {
      equipmentCost += line.costCents;
      return;
    }
    materialsCost += line.costCents;
    // A line priced above its cost is already marked up: no handling on top.
    if (line.priceCents <= line.costCents) handlingBase += line.costCents;
  });

  if (!input.otherDirectConfirmed) missing.push({ kind: "other_direct" });

  const complete = missing.length === 0;
  const none: BaselineResult = {
    complete,
    missing,
    hours: null,
    baseline: null,
    gapCents: null,
    gapPct: null,
    effectiveRateCents: null,
    warning: "none",
    belowCostFloor: null,
  };
  if (hoursMissing) return none;

  const mid = (low + high) / 2;
  const hours = { low, mid, high };
  if (costsMissing) return { ...none, hours };

  const handling = input.handlingOn ? (handlingBase * input.handlingPct) / 100 : 0;
  const fixed = materialsCost + handling + equipmentCost + input.travelSurchargeCents;
  const at = (h: number) => Math.round(h * input.sellRateCents + fixed);
  const baseline = { low: at(low), mid: at(mid), high: at(high) };

  const gapCents = input.quotedCents - baseline.mid;
  const rawPct = baseline.mid > 0 ? (gapCents / baseline.mid) * 100 : 0;
  const gapPct = Math.round(rawPct * 100) / 100 || 0;
  const warning: BaselineResult["warning"] =
    gapCents >= 0 ? "none" : rawPct <= -input.warningPct ? "strong" : "below";

  if (!complete) return { ...none, hours, baseline, gapCents, gapPct, warning };

  const laborLeft = input.quotedCents - materialsCost - equipmentCost - (input.otherDirectCents ?? 0);
  const effectiveRateCents = Math.round(laborLeft / high);
  return {
    complete,
    missing,
    hours,
    baseline,
    gapCents,
    gapPct,
    effectiveRateCents,
    warning,
    belowCostFloor: effectiveRateCents < input.costFloorCents,
  };
}
