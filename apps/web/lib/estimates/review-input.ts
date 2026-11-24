import type { PoolClient } from "pg";
import { parsePreparedScope } from "@ai-fsm/domain";
import { loadEstimateBaseline } from "./baseline";
import { preparedScopeGaps, reviewResultSchema, type EstimateReviewResult, type ReviewInput, type ReviewLine } from "./review";

const num = (v: number | string | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface LoadedReviewInput {
  status: string;
  updatedAt: Date;
  input: ReviewInput;
}

/** Everything the review reads, from stored rows and today's Settings (TASK-195). */
export async function loadReviewInput(
  client: PoolClient,
  estimateId: string,
  accountId: string,
): Promise<LoadedReviewInput | null> {
  const baseline = await loadEstimateBaseline(client, estimateId, accountId);
  if (!baseline) return null;
  const { rows } = await client.query<{ notes: string | null; prepared_scope: unknown; updated_at: Date }>(
    `SELECT notes, prepared_scope, updated_at FROM estimates WHERE id = $1 AND account_id = $2`,
    [estimateId, accountId],
  );
  const row = rows[0];
  const scope = parsePreparedScope(row.prepared_scope);

  const lines: ReviewLine[] = baseline.lines.map((l, i) => ({
    type: baseline.input.lines[i].type,
    description: l.description,
    quantity: num(l.quantity) ?? 0,
    price_cents: baseline.input.lines[i].priceCents,
    cost_cents: baseline.input.lines[i].costCents,
    hours_low: num(l.hours_low),
    hours_high: num(l.hours_high),
    hours_source: l.hours_source,
  }));

  // Good/Better/Best: each option's own lines, tagged with the option (no combined baseline).
  if (baseline.optionQuote) {
    const optionLines = await client.query<{
      label: string;
      line_item_type: string;
      description: string;
      quantity: string | number;
      unit_price_cents: string | number;
      unit_cost_cents: string | number | null;
      hours_low: string | number | null;
      hours_high: string | number | null;
      hours_source: string | null;
    }>(
      `SELECT o.label, li.line_item_type, li.description, li.quantity, li.unit_price_cents,
              li.unit_cost_cents, li.hours_low, li.hours_high, li.hours_source
       FROM estimate_line_items li
       JOIN estimate_options o ON o.id = li.option_id
       WHERE li.estimate_id = $1
       ORDER BY o.sort_order, li.sort_order, li.created_at`,
      [estimateId],
    );
    for (const l of optionLines.rows) {
      const quantity = num(l.quantity) ?? 0;
      const unitCost = num(l.unit_cost_cents);
      lines.push({
        type: (["materials", "equipment", "handling_fee", "adjustment"].includes(l.line_item_type)
          ? l.line_item_type
          : "labor") as ReviewLine["type"],
        description: l.description,
        quantity,
        price_cents: Math.round(quantity * (num(l.unit_price_cents) ?? 0)),
        cost_cents: unitCost == null ? null : Math.round(quantity * unitCost),
        hours_low: num(l.hours_low),
        hours_high: num(l.hours_high),
        hours_source: l.hours_source,
        option: l.label,
      });
    }
  }

  const billing_method: ReviewInput["billing_method"] = baseline.optionQuote
    ? "option_quote"
    : scope?.pricing?.mode === "fixed"
      ? "fixed_price"
      : scope
        ? "time_and_materials"
        : baseline.lines.length === 0
          ? "flat_price"
          : "itemized";

  return {
    status: baseline.status,
    updatedAt: row.updated_at,
    input: {
      billing_method,
      quoted_cents: baseline.input.quotedCents,
      rates: {
        sell_rate_cents: baseline.input.sellRateCents,
        cost_floor_cents: baseline.input.costFloorCents,
        handling_pct: baseline.input.handlingPct,
        warning_pct: baseline.input.warningPct,
        handling_in_baseline: baseline.input.handlingOn,
      },
      baseline: baseline.optionQuote ? null : baseline.result,
      lines,
      prepared_gaps: scope ? preparedScopeGaps(scope) : null,
      notes: row.notes,
    },
  };
}

/** What `estimates.review_result` holds. */
export interface StoredReview {
  result: EstimateReviewResult;
  source: "ai" | "rules";
  reviewed_at: string;
}

/** The stored review, and whether the estimate is unchanged since it ran. */
export function storedReviewFor(row: {
  review_result: unknown;
  review_for_updated_at: Date | string | null;
  updated_at: Date | string;
}): { review: StoredReview; current: boolean } | null {
  const raw = row.review_result as Partial<StoredReview> | null;
  if (!raw || typeof raw !== "object") return null;
  const parsed = reviewResultSchema.safeParse(raw.result);
  if (!parsed.success) return null;
  const forMs = row.review_for_updated_at == null ? NaN : new Date(row.review_for_updated_at).getTime();
  return {
    review: {
      result: parsed.data,
      source: raw.source === "ai" ? "ai" : "rules",
      reviewed_at: typeof raw.reviewed_at === "string" ? raw.reviewed_at : "",
    },
    current: Number.isFinite(forMs) && forMs === new Date(row.updated_at).getTime(),
  };
}
