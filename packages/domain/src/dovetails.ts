/**
 * Dovetails Services LLC — canonical business rules.
 *
 * These are the source of truth for all pricing logic.
 * Never hard-code these values anywhere else in the codebase.
 * All money values are in CENTS unless the name ends in _RATE or _PCT.
 */

// ---------------------------------------------------------------------------
// Labor
// ---------------------------------------------------------------------------

/** Internal burdened cost of labor. Never shown on customer-facing output. */
export const LABOR_COST_CENTS_PER_HOUR = 85_00; // $85.00/hr

/**
 * Customer-facing additional labor rate (solo technician, 0.25-hr increments).
 * @deprecated Use LABOR_COST_CENTS_PER_HOUR for internal margin math.
 */
export const LABOR_RATE_CENTS_PER_HOUR = LABOR_COST_CENTS_PER_HOUR;

/** Customer-facing hourly rate for T&M or add-on labor line items. */
export const LABOR_CUSTOMER_RATE_CENTS_PER_HOUR = 115_00; // $115.00/hr

/** Minimum customer-facing service value unless intentionally bundled or credited. */
export const MINIMUM_SERVICE_FEE_CENTS = 185_00; // $185.00 (2026 rate)

// ---------------------------------------------------------------------------
// Block pricing
// ---------------------------------------------------------------------------

/** Half-day labor block (up to 4 book hours). */
export const HALF_DAY_RATE_CENTS = 515_00;
export const BLOCK_PRICING_HALF_DAY_HOURS = 4;

/** Full-day labor block (up to 7–8 book hours). */
export const FULL_DAY_RATE_CENTS = 980_00;
export const BLOCK_PRICING_FULL_DAY_HOURS = 7;

// ---------------------------------------------------------------------------
// Bundle discount
// ---------------------------------------------------------------------------

/** 12% discount when 4+ distinct tasks are combined in one visit. */
export const BUNDLE_DISCOUNT_RATE = 0.12;
export const BUNDLE_DISCOUNT_MIN_TASKS = 4;

/** Gross margin floor — estimates below 30% are blocked. */
export const BUNDLE_MARGIN_FLOOR = 0.30;

// ---------------------------------------------------------------------------
// Regional pricing deltas
// ---------------------------------------------------------------------------

/** MA labor premium above NH baseline (heavier regulation, longer drive patterns). */
export const MA_LABOR_RATE_DELTA = 0.15; // +15%

// ---------------------------------------------------------------------------
// Emergency & after-hours multipliers
// ---------------------------------------------------------------------------

export const EMERGENCY_RATE_MULTIPLIERS = {
  saturday_daytime:  1.40,
  sunday_daytime:    1.50,
  weekday_evenings:  1.50,  // 5pm–10pm
  overnight:         2.00,  // 10pm–6am, 2-hr min, +$150 dispatch
  federal_holiday:   2.00,  // 2-hr min
  true_emergency:    2.00,  // active water/electrical hazard, +$200 dispatch
} as const;
export type EmergencyRateWindow = keyof typeof EMERGENCY_RATE_MULTIPLIERS;

// ---------------------------------------------------------------------------
// Painting pricing (per square foot, in cents)
// ---------------------------------------------------------------------------

export const PAINTING_RATE_MIN_CENTS = 175;      // $1.75/sq ft
export const PAINTING_RATE_STANDARD_CENTS = 205;  // $2.05/sq ft
export const PAINTING_TRIM_ADD_CENTS = 20;        // +$0.20/sq ft

/**
 * Prep level multipliers (1–10 scale).
 * Levels 1–5 use the standard rate.
 * Levels 6–10 apply an increasing multiplier.
 */
export const PREP_LEVEL_MULTIPLIERS: Record<number, number> = {
  1: 1.00,
  2: 1.00,
  3: 1.00,
  4: 1.00,
  5: 1.00,
  6: 1.08,
  7: 1.14,
  8: 1.20,
  9: 1.28,
  10: 1.38,
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/**
 * Flat material handling rate used by the painting estimate engine only.
 * New code should use MATERIAL_MARKUP_TIERS for tiered markup logic.
 */
export const MATERIAL_HANDLING_RATE = 0.15;

/**
 * Tiered material markup rates.
 * - Under $25: bundled into labor, no separate markup
 * - $25–$250: 30% markup
 * - Over $250: 22.5% markup (midpoint of 20–25% range)
 */
export const MATERIAL_MARKUP_TIERS = [
  { maxCents: 25_00,       rate: 0    },
  { maxCents: 250_00,      rate: 0.30 },
  { maxCents: Infinity,    rate: 0.225 },
] as const;

/** Calculate material markup for a given material cost in cents. */
export function calculateMaterialMarkup(materialCostCents: number): number {
  const tier = MATERIAL_MARKUP_TIERS.find((t) => materialCostCents <= t.maxCents);
  return Math.round(materialCostCents * (tier?.rate ?? 0.225));
}

// ---------------------------------------------------------------------------
// Deposits & payment terms
// ---------------------------------------------------------------------------

/** Deposit required before scheduling: 30% of total estimate. */
export const DEPOSIT_RATE = 0.30;

/** Balance due upon completion: 70% of total estimate. */
export const BALANCE_RATE = 0.70;

// ---------------------------------------------------------------------------
// Payment options (for customer-facing output)
// ---------------------------------------------------------------------------

export const PAYMENT_OPTIONS = [
  "Check payable to Dovetails Services LLC",
  "Venmo @DovetailsServices",
  "Square (card on file)",
] as const;

// ---------------------------------------------------------------------------
// Standard estimate terms (auto-included on all estimates)
// ---------------------------------------------------------------------------

export const DOCUMENT_STANDARD_VERSION = "2026.05";

export const STANDARD_ESTIMATE_NOTES = `
All work performed by licensed and insured professionals.
Price is valid for 30 days from estimate date.
Any work outside the defined scope will be quoted separately.
`.trim();

export const STANDARD_PAYMENT_TERMS = `
A 30% deposit is required to schedule your project.
Remaining balance is due upon completion of work.
`.trim();

export const STANDARD_DISCLAIMER = `
This estimate covers the scope of work as described above.
Unforeseen conditions (e.g., hidden damage, additional prep) may affect final cost
and will be communicated before proceeding.
`.trim();

export const STANDARD_INVOICE_TERMS = `
Invoices show customer-facing service and material costs, not internal labor hours.
Payment is due by the listed due date unless alternate terms are agreed in writing.
Past-due balances may pause future scheduling until resolved.
`.trim();

export const ESTIMATE_DOCUMENT_SECTIONS = {
  preparation:
    "Preparation includes site protection, access setup, surface or work-area readiness, and confirming conditions before work begins.",
  repair_install_work:
    "Repair or installation work includes the customer-facing labor and service scope described in the line items above.",
  finish_work:
    "Finish work includes cleanup, touch-up, and reasonable presentation standards for the selected finish expectation.",
  materials:
    "Materials include listed customer-facing materials and applicable handling. Substitutions use comparable quality when availability changes.",
  exclusions:
    "Excluded work includes concealed damage, scope not listed, permit fees, hazardous materials, and owner-requested changes unless quoted separately.",
  client_responsibilities:
    "Client responsibilities include timely approvals, clear access to work areas, securing pets and valuables, and completing payment according to the terms.",
} as const;

// ---------------------------------------------------------------------------
// Membership standards
// ---------------------------------------------------------------------------

export const MEMBERSHIP_TIERS = ["essential", "plus", "premier"] as const;
export type MembershipTier = typeof MEMBERSHIP_TIERS[number];

export const MEMBERSHIP_TIER_LABELS: Record<MembershipTier, string> = {
  essential: "Essential",
  plus: "Plus",
  premier: "Premier",
};

export const MEMBERSHIP_TIER_VISITS_PER_YEAR: Record<MembershipTier, number> = {
  essential: 1,
  plus: 2,
  premier: 4,
};

/** Included minor preventive/correction work after the health-check phase. */
export const MEMBERSHIP_INCLUDED_LABOR_MINUTES_PER_VISIT = 60;

export const MEMBERSHIP_BILLING_CADENCES = ["annual", "monthly"] as const;
export type MembershipBillingCadence = typeof MEMBERSHIP_BILLING_CADENCES[number];

export const MEMBERSHIP_ROUTING_ZONES = ["core", "extended", "out_of_area"] as const;
export type MembershipRoutingZone = typeof MEMBERSHIP_ROUTING_ZONES[number];

export const MEMBERSHIP_ROUTING_ZONE_LABELS: Record<MembershipRoutingZone, string> = {
  core: "Core Zone",
  extended: "Extended Zone",
  out_of_area: "Out of Area",
};

export const MEMBERSHIP_VISIT_PHASES = ["health_check", "included_action", "reporting"] as const;
export type MembershipVisitPhase = typeof MEMBERSHIP_VISIT_PHASES[number];

export const MEMBERSHIP_CAP_STATUSES = ["within_cap", "cap_reached", "approval_required"] as const;
export type MembershipCapStatus = typeof MEMBERSHIP_CAP_STATUSES[number];

export const MEMBER_PRIORITY_LEVELS = ["standard", "priority", "vip"] as const;
export type MemberPriorityLevel = typeof MEMBER_PRIORITY_LEVELS[number];
export const MEMBER_PRIORITY_LABELS: Record<MemberPriorityLevel, string> = {
  standard: "Standard",
  priority: "Priority",
  vip: "VIP",
};

export type MemberRenewalStatus = "active" | "approaching" | "expired" | "not_set";

export function computeRenewalStatus(renewalDate: string | null | undefined): MemberRenewalStatus {
  if (!renewalDate) return "not_set";
  const daysUntil = Math.ceil((new Date(renewalDate).getTime() - Date.now()) / 86_400_000);
  if (daysUntil < 0) return "expired";
  if (daysUntil <= 30) return "approaching";
  return "active";
}

// ---------------------------------------------------------------------------
// Operations standards
// ---------------------------------------------------------------------------

export const JOB_ACCEPTANCE_CATEGORIES = [
  "membership",
  "realtor_baseline",
  "high_margin_project",
  "reactive_low_quality",
] as const;
export type JobAcceptanceCategory = typeof JOB_ACCEPTANCE_CATEGORIES[number];

export const JOB_ACCEPTANCE_CATEGORY_LABELS: Record<JobAcceptanceCategory, string> = {
  membership:           "Membership Work",
  realtor_baseline:     "Realtor Baseline",
  high_margin_project:  "High-Margin Project",
  reactive_low_quality: "Reactive / Low-Quality",
};

export const JOB_INTAKE_DECISIONS = ["accept", "decline", "defer", "reframe"] as const;
export type JobIntakeDecision = typeof JOB_INTAKE_DECISIONS[number];

export const JOB_INTAKE_DECISION_LABELS: Record<JobIntakeDecision, string> = {
  accept:  "Accept",
  decline: "Decline",
  defer:   "Defer",
  reframe: "Reframe",
};

export const JOB_INTAKE_RATING_FIELDS = [
  "strategy_fit",
  "scope_clarity",
  "margin_confidence",
  "schedule_impact",
  "quality_fit",
] as const;
export type JobIntakeRatingField = typeof JOB_INTAKE_RATING_FIELDS[number];

export const JOB_INTAKE_RATING_LABELS: Record<JobIntakeRatingField, string> = {
  strategy_fit:      "Strategy Fit",
  scope_clarity:     "Scope Clarity",
  margin_confidence: "Margin Confidence",
  schedule_impact:   "Schedule Impact",
  quality_fit:       "Quality Fit",
};

// ---------------------------------------------------------------------------
// Scheduling policy
// ---------------------------------------------------------------------------

export const MAINTENANCE_SCHEDULE_DAY_OF_WEEK = 3; // Wednesday (JS Date.getDay(), 0=Sun)
export const MAINTENANCE_JOB_CATEGORIES: JobAcceptanceCategory[] = ["membership", "realtor_baseline"];

// ---------------------------------------------------------------------------
// Job types
// ---------------------------------------------------------------------------

export const JOB_TYPES = ["painting", "maintenance", "repair", "custom"] as const;
export type JobType = typeof JOB_TYPES[number];

// ---------------------------------------------------------------------------
// Pricing modes
// ---------------------------------------------------------------------------

export const PRICING_MODES = ["flat_rate", "hourly_internal"] as const;
export type PricingMode = typeof PRICING_MODES[number];

// ---------------------------------------------------------------------------
// Line item categories
// ---------------------------------------------------------------------------

export const LINE_ITEM_TYPES = ["labor", "materials", "handling_fee", "adjustment"] as const;
export type LineItemType = typeof LINE_ITEM_TYPES[number];

// ---------------------------------------------------------------------------
// Estimate guardrails
// ---------------------------------------------------------------------------

export const ESTIMATE_TRIP_COUNT_OPTIONS = ["one_trip", "multi_trip"] as const;
export type EstimateTripCount = typeof ESTIMATE_TRIP_COUNT_OPTIONS[number];

export const ESTIMATE_TRIP_COUNT_LABELS: Record<EstimateTripCount, string> = {
  one_trip: "One Trip",
  multi_trip: "Multi-Trip",
};

export const ESTIMATE_FINISH_EXPECTATIONS = ["basic", "clean", "premium"] as const;
export type EstimateFinishExpectation = typeof ESTIMATE_FINISH_EXPECTATIONS[number];

export const ESTIMATE_FINISH_EXPECTATION_LABELS: Record<EstimateFinishExpectation, string> = {
  basic: "Basic",
  clean: "Clean",
  premium: "Premium",
};

export const ESTIMATE_MINIMUM_OVERRIDE_REASONS = [
  "bundled",
  "membership_included",
  "promo",
  "owner_approved",
] as const;
export type EstimateMinimumOverrideReason = typeof ESTIMATE_MINIMUM_OVERRIDE_REASONS[number];

export const ESTIMATE_MINIMUM_OVERRIDE_REASON_LABELS: Record<EstimateMinimumOverrideReason, string> = {
  bundled: "Bundled",
  membership_included: "Membership Included",
  promo: "Promotion",
  owner_approved: "Owner Approved",
};

export const ESTIMATE_ADJUSTMENT_TYPES = [
  "bundle_credit",
  "member_credit",
  "promo",
  "travel_surcharge",
  "risk_adjustment",
  "return_trip_charge",
  "coordination_fee",
] as const;
export type EstimateAdjustmentType = typeof ESTIMATE_ADJUSTMENT_TYPES[number];

export const ESTIMATE_ADJUSTMENT_TYPE_LABELS: Record<EstimateAdjustmentType, string> = {
  bundle_credit: "Bundle Credit",
  member_credit: "Member Credit",
  promo: "Promotion",
  travel_surcharge: "Travel Surcharge",
  risk_adjustment: "Risk Adjustment",
  return_trip_charge: "Return Trip Charge",
  coordination_fee: "Coordination Fee",
};

export const ESTIMATE_PRICING_REVIEW_STATUSES = ["needs_review", "passed", "blocked"] as const;
export type EstimatePricingReviewStatus = typeof ESTIMATE_PRICING_REVIEW_STATUSES[number];

// ---------------------------------------------------------------------------
// Digital Home Vault
// ---------------------------------------------------------------------------

export const VAULT_CATEGORIES = [
  "mechanical",
  "appliance",
  "filter",
  "paint_finish",
  "monitor",
  "vendor",
  "other",
] as const;
export type VaultCategory = typeof VAULT_CATEGORIES[number];

export const VAULT_CATEGORY_LABELS: Record<VaultCategory, string> = {
  mechanical:   "Mechanical Systems",
  appliance:    "Appliances",
  filter:       "Filters & Consumables",
  paint_finish: "Paint & Finishes",
  monitor:      "Monitor Items",
  vendor:       "Vendors & Referrals",
  other:        "Other",
};

export const VAULT_COMPLETENESS_TARGET_CATEGORIES = [
  "mechanical",
  "appliance",
  "filter",
  "paint_finish",
  "monitor",
  "vendor",
] as const satisfies readonly VaultCategory[];
export type VaultCompletenessCategory = typeof VAULT_COMPLETENESS_TARGET_CATEGORIES[number];

const VAULT_COLLECTION_STAGE_GROUPS = [
  ["mechanical", "filter"],
  ["appliance"],
  ["paint_finish", "monitor"],
  ["vendor"],
] as const satisfies readonly (readonly VaultCompletenessCategory[])[];

export interface VaultCollectionStep {
  visitNumber: number;
  annualVisitCount: number;
  cycleVisitNumber: number;
  cycleYear: number;
  focusCategories: VaultCompletenessCategory[];
  completedFocusCategories: VaultCompletenessCategory[];
  missingFocusCategories: VaultCompletenessCategory[];
  missingCoreCategories: VaultCompletenessCategory[];
}

function buildVaultCollectionStages(annualVisitCount: number): VaultCompletenessCategory[][] {
  const bucketCount = Math.max(1, Math.min(Math.trunc(annualVisitCount) || 1, VAULT_COLLECTION_STAGE_GROUPS.length));
  const baseSize = Math.floor(VAULT_COLLECTION_STAGE_GROUPS.length / bucketCount);
  const extraBuckets = VAULT_COLLECTION_STAGE_GROUPS.length % bucketCount;
  const groupedStages: VaultCompletenessCategory[][] = [];
  let cursor = 0;

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const size = baseSize + (bucket < extraBuckets ? 1 : 0);
    groupedStages.push(
      VAULT_COLLECTION_STAGE_GROUPS.slice(cursor, cursor + size).flatMap((stage) => [...stage])
    );
    cursor += size;
  }

  return groupedStages;
}

export function getVaultCollectionStep(input: {
  annualVisitCount: number;
  visitNumber: number;
  recordedCategories: ReadonlyArray<VaultCategory>;
}): VaultCollectionStep {
  const annualVisitCount = Math.max(1, Math.trunc(input.annualVisitCount) || 1);
  const visitNumber = Math.max(1, Math.trunc(input.visitNumber) || 1);
  const stages = buildVaultCollectionStages(annualVisitCount);
  const cycleVisitNumber = ((visitNumber - 1) % stages.length) + 1;
  const cycleYear = Math.floor((visitNumber - 1) / stages.length) + 1;
  const recordedCategories = VAULT_COMPLETENESS_TARGET_CATEGORIES.filter((category) =>
    input.recordedCategories.includes(category)
  );
  const focusCategories = stages[cycleVisitNumber - 1] ?? [];
  const completedFocusCategories = focusCategories.filter((category) => recordedCategories.includes(category));
  const missingFocusCategories = focusCategories.filter((category) => !recordedCategories.includes(category));
  const missingCoreCategories = VAULT_COMPLETENESS_TARGET_CATEGORIES.filter(
    (category) => !recordedCategories.includes(category)
  );

  return {
    visitNumber,
    annualVisitCount,
    cycleVisitNumber,
    cycleYear,
    focusCategories,
    completedFocusCategories,
    missingFocusCategories,
    missingCoreCategories,
  };
}

export function computeVaultCompleteness(items: ReadonlyArray<{ category: VaultCategory }>) {
  const coveredCategories = VAULT_COMPLETENESS_TARGET_CATEGORIES.filter((category) =>
    items.some((item) => item.category === category)
  );
  const missingCategories = VAULT_COMPLETENESS_TARGET_CATEGORIES.filter(
    (category) => !coveredCategories.includes(category)
  );

  return {
    percent: Math.round((coveredCategories.length / VAULT_COMPLETENESS_TARGET_CATEGORIES.length) * 100),
    coveredCount: coveredCategories.length,
    totalCount: VAULT_COMPLETENESS_TARGET_CATEGORIES.length,
    coveredCategories,
    missingCategories,
  };
}

// ---------------------------------------------------------------------------
// Client document standards
// ---------------------------------------------------------------------------

export const CLIENT_DOCUMENT_STATUSES = [
  "draft",
  "sent",
  "approved",
  "final",
  "superseded",
  "archived",
] as const;
export type ClientDocumentStatus = typeof CLIENT_DOCUMENT_STATUSES[number];

export const CLIENT_DOCUMENT_TYPES = [
  "estimate",
  "invoice",
  "membership_plan",
  "visit_report",
  "pricing_codebook",
] as const;
export type ClientDocumentType = typeof CLIENT_DOCUMENT_TYPES[number];

function sanitizeFilenamePart(value: string, fallback: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "")
    .slice(0, 48);
  return sanitized || fallback;
}

function clientLastName(clientName: string | null | undefined): string {
  if (!clientName) return "UnknownClient";
  const parts = clientName.trim().split(/\s+/);
  return sanitizeFilenamePart(parts.at(-1) ?? clientName, "UnknownClient");
}

function titleToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function buildClientDocumentFilename(input: {
  date: string | Date;
  clientName: string | null | undefined;
  jobType: string | null | undefined;
  documentType: ClientDocumentType;
  status: ClientDocumentStatus;
}): string {
  const date =
    input.date instanceof Date
      ? input.date.toISOString().slice(0, 10)
      : input.date.slice(0, 10);

  return [
    date,
    clientLastName(input.clientName),
    sanitizeFilenamePart(titleToken(input.jobType ?? "Job"), "Job"),
    sanitizeFilenamePart(titleToken(input.documentType), "Document"),
    sanitizeFilenamePart(titleToken(input.status), "Status"),
  ].join("_");
}
