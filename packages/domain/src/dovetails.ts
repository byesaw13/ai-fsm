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

/** Internal labor cost. Never shown on customer-facing output. */
export const LABOR_RATE_CENTS_PER_HOUR = 85_00; // $85.00/hr

/** Minimum customer-facing service value unless intentionally bundled or credited. */
export const MINIMUM_SERVICE_FEE_CENTS = 150_00; // $150.00

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

/** Material handling / service fee: 15% of material subtotal. */
export const MATERIAL_HANDLING_RATE = 0.15;

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
