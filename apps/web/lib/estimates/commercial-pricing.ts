/** Commercial lane on a quote. Not the form layout (itemized / multi-option). */
export type CommercialPricingMode = "flat_rate" | "hourly_internal";

/** Form layout. Must not share a query param with commercial pricing. */
export type EstimatePresentation = "itemized" | "flat_rate" | "multi_option";

export function isCommercialPricingMode(value: string | null | undefined): value is CommercialPricingMode {
  return value === "flat_rate" || value === "hourly_internal";
}

export function isEstimatePresentation(value: string | null | undefined): value is EstimatePresentation {
  return value === "itemized" || value === "flat_rate" || value === "multi_option";
}

/**
 * Split the overloaded `?pricing_mode=` query.
 * `hourly_internal` is commercial T&M. `itemized` / `multi_option` are layout.
 * `flat_rate` means a bid quote and a one-price form.
 */
export function splitQuotePricingQuery(raw?: string | null): {
  commercial?: CommercialPricingMode;
  presentation?: EstimatePresentation;
} {
  if (raw === "hourly_internal") return { commercial: "hourly_internal" };
  if (raw === "itemized" || raw === "multi_option") return { presentation: raw };
  if (raw === "flat_rate") return { commercial: "flat_rate", presentation: "flat_rate" };
  return {};
}

/** Bid vs T&M stored on the estimate (and copied onto the job). */
export function commercialPricingForQuote(input: {
  explicit?: string | null;
  entryMode?: string | null;
  hasTmDraft?: boolean;
}): CommercialPricingMode {
  if (isCommercialPricingMode(input.explicit)) return input.explicit;
  if (input.entryMode === "tm" || input.hasTmDraft) return "hourly_internal";
  return "flat_rate";
}
