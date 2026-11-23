import { baselineParts, type LoadedBaseline } from "@/lib/estimates/baseline";
import type { BaselinePanelProps } from "./sections/EstimateBaselinePanel";

/**
 * Draft: today's baseline, editable. Sent with a snapshot: the frozen baseline.
 * Sent before this work: "Hours not recorded". Option quotes: not available yet.
 */
export function baselinePanelProps(loaded: LoadedBaseline, estimateId: string): BaselinePanelProps {
  if (loaded.optionQuote) return { mode: "option" };
  const sources = [...new Set(
    loaded.lines
      .filter((l) => l.hours_low != null || l.hours_high != null)
      .map((l) => l.hours_source)
      .filter((s): s is string => !!s),
  )];

  if (loaded.status === "draft") {
    return {
      mode: "live",
      estimateId,
      result: loaded.result,
      quotedCents: loaded.input.quotedCents,
      sellRateCents: loaded.input.sellRateCents,
      costFloorCents: loaded.input.costFloorCents,
      handlingPct: loaded.input.handlingPct,
      handlingOn: loaded.input.handlingOn,
      otherDirectCents: loaded.input.otherDirectCents,
      confirmed: loaded.input.otherDirectConfirmed,
      sources,
      parts: baselineParts(loaded.input),
    };
  }

  const snap = loaded.frozen;
  if (!snap) return { mode: "not_recorded" };
  return {
    mode: "frozen",
    estimateId,
    result: snap.result,
    quotedCents: snap.quoted_cents,
    sellRateCents: snap.sell_rate_cents,
    costFloorCents: snap.cost_floor_cents,
    handlingPct: snap.handling_pct,
    handlingOn: snap.handling_on,
    otherDirectCents: snap.other_direct_cents,
    confirmed: true,
    sources,
    parts: baselineParts({ ...loaded.input, handlingPct: snap.handling_pct }),
    frozenAt: snap.frozen_at,
  };
}
