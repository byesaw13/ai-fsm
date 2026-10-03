export type EstimateReviewLine = {
  id: string;
  description: string | null;
  unit_price_cents: number | string | null;
};

/** A line is ready when it has a description and a price above zero. */
export function lineNeedsPriceReview(line: EstimateReviewLine): boolean {
  const description = (line.description ?? "").trim();
  const price = Number(line.unit_price_cents ?? 0);
  return description.length === 0 || !Number.isFinite(price) || price <= 0;
}

export function estimateReviewHealth(lines: EstimateReviewLine[]): {
  total: number;
  ready: number;
  needsReview: number;
  firstId: string | null;
} {
  const needs = lines.filter(lineNeedsPriceReview);
  return {
    total: lines.length,
    ready: lines.length - needs.length,
    needsReview: needs.length,
    firstId: needs[0]?.id ?? null,
  };
}
