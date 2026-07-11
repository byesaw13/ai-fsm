/**
 * Travel & mileage charging — pure domain logic for Dovetails Services LLC.
 *
 * All policy thresholds and rates are inputs (from business settings).
 * Never hard-code business-policy numbers in application code paths;
 * DEFAULT_TRAVEL_SETTINGS are seed/fallback values only.
 */

// ---------------------------------------------------------------------------
// Enums & labels
// ---------------------------------------------------------------------------

export const TRAVEL_POLICY_TIERS = [
  "local",
  "extended",
  "distant",
  "long_distance",
] as const;
export type TravelPolicyTier = (typeof TRAVEL_POLICY_TIERS)[number];

export const TRAVEL_POLICY_TIER_LABELS: Record<TravelPolicyTier, string> = {
  local: "Local — Included",
  extended: "Extended Area — Mileage",
  distant: "Distant — Mileage + Travel Time",
  long_distance: "Long Distance — Owner Review",
};

export const TRAVEL_TIME_ROUNDING = [
  "exact",
  "nearest_15",
  "nearest_30",
] as const;
export type TravelTimeRounding = (typeof TRAVEL_TIME_ROUNDING)[number];

export const TRAVEL_TIME_RATE_MODES = [
  "standard_labor",
  "custom",
  "none",
] as const;
export type TravelTimeRateMode = (typeof TRAVEL_TIME_RATE_MODES)[number];

export const TRIP_CALCULATION_METHODS = [
  "once_for_project",
  "once_per_visit",
  "once_per_workday",
  "custom",
] as const;
export type TripCalculationMethod = (typeof TRIP_CALCULATION_METHODS)[number];

export const TRIP_DIRECTION_MODES = ["round_trip", "one_way"] as const;
export type TripDirectionMode = (typeof TRIP_DIRECTION_MODES)[number];

export const TRAVEL_CHARGE_MODES = [
  "include_in_labor",
  "separate_line",
  "waive",
  "custom",
] as const;
export type TravelChargeMode = (typeof TRAVEL_CHARGE_MODES)[number];

export const TRAVEL_CHARGE_MODE_LABELS: Record<TravelChargeMode, string> = {
  include_in_labor: "Include travel in labor pricing",
  separate_line: "Show travel as a separate line item",
  waive: "Waive travel",
  custom: "Custom travel amount",
};

export const INVOICE_TRAVEL_BILLING_MODES = [
  "estimated",
  "actual",
  "none",
  "custom",
] as const;
export type InvoiceTravelBillingMode = (typeof INVOICE_TRAVEL_BILLING_MODES)[number];

export const CLIENT_RELATIONSHIP_TYPES = [
  "standard",
  "realtor",
  "preferred",
  "referral_partner",
] as const;
export type ClientRelationshipType = (typeof CLIENT_RELATIONSHIP_TYPES)[number];

export const CLIENT_RELATIONSHIP_TYPE_LABELS: Record<ClientRelationshipType, string> = {
  standard: "Standard Customer",
  realtor: "Realtor",
  preferred: "Preferred Client",
  referral_partner: "Referral Partner",
};

export const CLIENT_TRAVEL_RULES = [
  "standard_policy",
  "mileage_waived",
  "travel_time_waived",
  "all_travel_waived",
  "custom_included_radius",
  "custom_mileage_rate",
  "custom_travel_time_rate",
  "minimum_project_value_exemption",
  "manual_review_required",
] as const;
export type ClientTravelRule = (typeof CLIENT_TRAVEL_RULES)[number];

export const CLIENT_TRAVEL_RULE_LABELS: Record<ClientTravelRule, string> = {
  standard_policy: "Standard policy",
  mileage_waived: "Mileage waived",
  travel_time_waived: "Travel time waived",
  all_travel_waived: "All travel waived",
  custom_included_radius: "Custom included radius",
  custom_mileage_rate: "Custom mileage rate",
  custom_travel_time_rate: "Custom travel-time rate",
  minimum_project_value_exemption: "Minimum project value exemption",
  manual_review_required: "Manual review required",
};

export const TRAVEL_CALCULATION_SOURCES = [
  "map_provider",
  "haversine_estimate",
  "manual",
  "mileage_log",
  "carried_forward",
] as const;
export type TravelCalculationSource = (typeof TRAVEL_CALCULATION_SOURCES)[number];

// ---------------------------------------------------------------------------
// Settings defaults (seed only — runtime values come from DB)
// ---------------------------------------------------------------------------

export interface TravelSettings {
  origin_address: string;
  origin_city: string;
  origin_state: string;
  origin_zip: string;
  origin_latitude: number | null;
  origin_longitude: number | null;
  included_one_way_miles: number;
  mileage_only_cutoff_miles: number;
  travel_time_cutoff_miles: number;
  long_distance_review_miles: number;
  minimum_project_value_low_cents: number;
  minimum_project_value_high_cents: number;
  /** Cents per mile (e.g. 70 = $0.70). */
  default_mileage_rate_cents: number;
  /** Cents per hour for travel time. */
  default_travel_time_rate_cents: number;
  travel_time_rate_mode: TravelTimeRateMode;
  travel_time_rounding: TravelTimeRounding;
  default_trip_calculation_method: TripCalculationMethod;
  default_trip_direction: TripDirectionMode;
  customer_facing_line_title: string;
  customer_facing_description: string;
  show_formulas_to_customer: boolean;
  /** Warn when travel charge exceeds this fraction of project value (0–1). */
  high_travel_ratio_threshold: number;
}

/** Seed / fallback defaults for Dovetails Services LLC. */
export const DEFAULT_TRAVEL_SETTINGS: TravelSettings = {
  origin_address: "85 Rockingham Road",
  origin_city: "Derry",
  origin_state: "NH",
  origin_zip: "03038",
  origin_latitude: 42.8806,
  origin_longitude: -71.3273,
  included_one_way_miles: 20,
  mileage_only_cutoff_miles: 20,
  travel_time_cutoff_miles: 35,
  long_distance_review_miles: 60,
  minimum_project_value_low_cents: 75_000, // $750
  minimum_project_value_high_cents: 100_000, // $1,000
  default_mileage_rate_cents: 70, // $0.70/mi (override via mileage_rates table)
  default_travel_time_rate_cents: 85_00, // $85/hr public labor rate
  travel_time_rate_mode: "standard_labor",
  travel_time_rounding: "nearest_15",
  default_trip_calculation_method: "once_for_project",
  default_trip_direction: "round_trip",
  customer_facing_line_title: "Travel and Service-Area Adjustment",
  customer_facing_description:
    "Includes mileage and travel time associated with service outside the standard Dovetails Services local service area.",
  show_formulas_to_customer: false,
  high_travel_ratio_threshold: 0.25,
};

// ---------------------------------------------------------------------------
// Client rule overrides
// ---------------------------------------------------------------------------

export interface ClientTravelOverrides {
  relationship_type: ClientRelationshipType;
  travel_rule: ClientTravelRule;
  custom_included_one_way_miles: number | null;
  custom_mileage_rate_cents: number | null;
  custom_travel_time_rate_cents: number | null;
  minimum_project_value_exempt: boolean;
}

export const DEFAULT_CLIENT_TRAVEL_OVERRIDES: ClientTravelOverrides = {
  relationship_type: "standard",
  travel_rule: "standard_policy",
  custom_included_one_way_miles: null,
  custom_mileage_rate_cents: null,
  custom_travel_time_rate_cents: null,
  minimum_project_value_exempt: false,
};

// ---------------------------------------------------------------------------
// Calculation input / output
// ---------------------------------------------------------------------------

export interface TravelCalculationInput {
  one_way_miles: number;
  one_way_minutes: number;
  /** Number of trips (each trip is one round-trip or one-way per direction mode). */
  trip_count: number;
  trip_direction: TripDirectionMode;
  settings: TravelSettings;
  /** Active mileage rate in cents/mile (snapshotted). */
  mileage_rate_cents: number;
  /** Active travel-time rate in cents/hour (snapshotted). 0 = no charge. */
  travel_time_rate_cents: number;
  client?: Partial<ClientTravelOverrides> | null;
  project_value_cents?: number | null;
  /** Override recommended total (custom mode). */
  custom_total_cents?: number | null;
  charge_mode?: TravelChargeMode;
}

export interface TravelWarning {
  code:
    | "geocode_failed"
    | "extended_area"
    | "distant"
    | "long_distance"
    | "high_travel_ratio"
    | "manual_review_required"
    | "min_project_value";
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface TravelCalculationResult {
  one_way_miles: number;
  round_trip_miles: number;
  one_way_minutes: number;
  round_trip_minutes: number;
  trip_count: number;
  trip_direction: TripDirectionMode;
  total_miles: number;
  total_minutes: number;
  included_miles: number;
  billable_miles: number;
  mileage_rate_cents: number;
  mileage_charge_cents: number;
  billable_travel_minutes: number;
  travel_time_rate_cents: number;
  travel_time_charge_cents: number;
  /** Pre-override recommended total. */
  recommended_total_cents: number;
  /** Final charge after client rules / charge mode / custom. */
  total_travel_charge_cents: number;
  policy_tier: TravelPolicyTier;
  policy_tier_label: string;
  charge_mode: TravelChargeMode;
  client_rule: ClientTravelRule;
  relationship_type: ClientRelationshipType;
  warnings: TravelWarning[];
  owner_review_required: boolean;
  waived_mileage: boolean;
  waived_travel_time: boolean;
  waived_all: boolean;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function formatOriginAddress(s: Pick<
  TravelSettings,
  "origin_address" | "origin_city" | "origin_state" | "origin_zip"
>): string {
  const cityLine = [s.origin_city, s.origin_state].filter(Boolean).join(", ");
  return [s.origin_address, cityLine, s.origin_zip].filter(Boolean).join(", ");
}

export function determinePolicyTier(
  oneWayMiles: number,
  settings: Pick<
    TravelSettings,
    | "mileage_only_cutoff_miles"
    | "travel_time_cutoff_miles"
    | "long_distance_review_miles"
  >
): TravelPolicyTier {
  if (oneWayMiles > settings.long_distance_review_miles) return "long_distance";
  if (oneWayMiles > settings.travel_time_cutoff_miles) return "distant";
  if (oneWayMiles > settings.mileage_only_cutoff_miles) return "extended";
  return "local";
}

/**
 * Round travel minutes per configured increment.
 * nearest_15 / nearest_30 round half-up (standard money-style).
 */
export function roundTravelMinutes(
  minutes: number,
  mode: TravelTimeRounding
): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (mode === "exact") return Math.round(minutes);
  const step = mode === "nearest_15" ? 15 : 30;
  return Math.round(minutes / step) * step;
}

export function resolveClientOverrides(
  client?: Partial<ClientTravelOverrides> | null
): ClientTravelOverrides {
  return {
    ...DEFAULT_CLIENT_TRAVEL_OVERRIDES,
    ...(client ?? {}),
  };
}

/**
 * Compute travel charges from distance/time inputs and policy settings.
 * Pure — no I/O. Distance lookup happens outside this function.
 */
export function calculateTravelCharges(
  input: TravelCalculationInput
): TravelCalculationResult {
  const settings = input.settings;
  const client = resolveClientOverrides(input.client);
  const chargeMode: TravelChargeMode = input.charge_mode ?? "separate_line";

  const oneWayMiles = Math.max(0, roundMiles(input.one_way_miles));
  const oneWayMinutes = Math.max(0, Math.round(input.one_way_minutes));
  const tripCount = Math.max(1, Math.floor(input.trip_count || 1));
  const direction = input.trip_direction;

  const legsPerTrip = direction === "round_trip" ? 2 : 1;
  const roundTripMiles = roundMiles(oneWayMiles * 2);
  const roundTripMinutes = oneWayMinutes * 2;
  const totalMiles = roundMiles(oneWayMiles * legsPerTrip * tripCount);
  const totalMinutes = oneWayMinutes * legsPerTrip * tripCount;

  // Included mileage: included one-way × legs per trip × trips
  let includedOneWay =
    client.travel_rule === "custom_included_radius" &&
    client.custom_included_one_way_miles != null
      ? client.custom_included_one_way_miles
      : settings.included_one_way_miles;
  includedOneWay = Math.max(0, includedOneWay);
  const includedMiles = roundMiles(includedOneWay * legsPerTrip * tripCount);

  let mileageRate =
    client.travel_rule === "custom_mileage_rate" &&
    client.custom_mileage_rate_cents != null
      ? client.custom_mileage_rate_cents
      : input.mileage_rate_cents;

  let travelTimeRate =
    client.travel_rule === "custom_travel_time_rate" &&
    client.custom_travel_time_rate_cents != null
      ? client.custom_travel_time_rate_cents
      : input.travel_time_rate_cents;

  if (settings.travel_time_rate_mode === "none") {
    travelTimeRate = 0;
  }

  const waivedAll =
    client.travel_rule === "all_travel_waived" || chargeMode === "waive";
  const waivedMileage =
    waivedAll || client.travel_rule === "mileage_waived";
  const waivedTravelTime =
    waivedAll || client.travel_rule === "travel_time_waived";

  const tier = determinePolicyTier(oneWayMiles, settings);

  // Billable mileage only when beyond included (never negative)
  let billableMiles = Math.max(0, roundMiles(totalMiles - includedMiles));
  // Local tier: force zero billable even if floating-point noise
  if (tier === "local") billableMiles = 0;
  if (waivedMileage) billableMiles = 0;

  const mileageChargeCents = Math.round(billableMiles * mileageRate);

  // Travel time only when one-way exceeds travel_time_cutoff
  let billableTravelMinutes = 0;
  if (
    !waivedTravelTime &&
    oneWayMiles > settings.travel_time_cutoff_miles &&
    travelTimeRate > 0
  ) {
    billableTravelMinutes = roundTravelMinutes(
      totalMinutes,
      settings.travel_time_rounding
    );
  }
  const travelTimeChargeCents = Math.round(
    (billableTravelMinutes / 60) * travelTimeRate
  );

  let recommended = mileageChargeCents + travelTimeChargeCents;
  if (waivedAll) recommended = 0;

  let total = recommended;
  if (chargeMode === "custom" && input.custom_total_cents != null) {
    total = Math.max(0, Math.round(input.custom_total_cents));
  } else if (chargeMode === "waive") {
    total = 0;
  } else if (chargeMode === "include_in_labor") {
    // Still compute recommended for owner visibility; charge is not added as a line
    total = recommended;
  }

  const warnings: TravelWarning[] = [];
  if (tier === "extended") {
    warnings.push({
      code: "extended_area",
      message: `Extended area (${oneWayMiles} mi one-way) — mileage beyond ${settings.included_one_way_miles} mi applies.`,
      severity: "info",
    });
  }
  if (tier === "distant" || tier === "long_distance") {
    warnings.push({
      code: "distant",
      message: `One-way distance ${oneWayMiles} mi exceeds ${settings.travel_time_cutoff_miles} mi — mileage and travel time apply.`,
      severity: "warning",
    });
  }
  if (tier === "long_distance") {
    warnings.push({
      code: "long_distance",
      message: `Long-distance job (${oneWayMiles} mi one-way). Owner review required. Recommended minimum project value $${(settings.minimum_project_value_low_cents / 100).toFixed(0)}–$${(settings.minimum_project_value_high_cents / 100).toFixed(0)}.`,
      severity: "critical",
    });
  }

  const minExempt =
    client.minimum_project_value_exempt ||
    client.travel_rule === "minimum_project_value_exemption";
  if (
    tier === "long_distance" &&
    !minExempt &&
    input.project_value_cents != null &&
    input.project_value_cents < settings.minimum_project_value_low_cents
  ) {
    warnings.push({
      code: "min_project_value",
      message: `Project value is below the recommended long-distance minimum of $${(settings.minimum_project_value_low_cents / 100).toFixed(0)}.`,
      severity: "critical",
    });
  }

  if (
    input.project_value_cents != null &&
    input.project_value_cents > 0 &&
    total > 0 &&
    total / input.project_value_cents >= settings.high_travel_ratio_threshold
  ) {
    const pct = Math.round(
      (total / input.project_value_cents) * 100
    );
    warnings.push({
      code: "high_travel_ratio",
      message: `Travel charge is ${pct}% of project value — review before sending.`,
      severity: "warning",
    });
  }

  if (client.travel_rule === "manual_review_required") {
    warnings.push({
      code: "manual_review_required",
      message: "Customer rule requires manual owner review of travel charges.",
      severity: "warning",
    });
  }

  const ownerReviewRequired =
    tier === "long_distance" ||
    client.travel_rule === "manual_review_required" ||
    warnings.some((w) => w.severity === "critical");

  return {
    one_way_miles: oneWayMiles,
    round_trip_miles: roundTripMiles,
    one_way_minutes: oneWayMinutes,
    round_trip_minutes: roundTripMinutes,
    trip_count: tripCount,
    trip_direction: direction,
    total_miles: totalMiles,
    total_minutes: totalMinutes,
    included_miles: includedMiles,
    billable_miles: billableMiles,
    mileage_rate_cents: mileageRate,
    mileage_charge_cents: waivedMileage ? 0 : mileageChargeCents,
    billable_travel_minutes: billableTravelMinutes,
    travel_time_rate_cents: travelTimeRate,
    travel_time_charge_cents: waivedTravelTime ? 0 : travelTimeChargeCents,
    recommended_total_cents: recommended,
    total_travel_charge_cents: total,
    policy_tier: tier,
    policy_tier_label: TRAVEL_POLICY_TIER_LABELS[tier],
    charge_mode: chargeMode,
    client_rule: client.travel_rule,
    relationship_type: client.relationship_type,
    warnings,
    owner_review_required: ownerReviewRequired,
    waived_mileage: waivedMileage,
    waived_travel_time: waivedTravelTime,
    waived_all: waivedAll,
  };
}

/** Round miles to 0.1 — matching mileage log granularity. */
export function roundMiles(miles: number): number {
  if (!Number.isFinite(miles)) return 0;
  return Math.round(miles * 10) / 10;
}

/**
 * Estimate drive minutes from miles when map duration is unavailable.
 * Uses ~35 mph average mixed road speed (NH/ME rural-suburban).
 */
export function estimateDriveMinutesFromMiles(miles: number): number {
  if (miles <= 0) return 0;
  return Math.round((miles / 35) * 60);
}

/**
 * Suggest trip_count from calculation method + planned visits/workdays.
 */
export function resolveTripCount(input: {
  method: TripCalculationMethod;
  planned_visits?: number | null;
  planned_workdays?: number | null;
  custom_trip_count?: number | null;
}): number {
  switch (input.method) {
    case "once_per_visit":
      return Math.max(1, Math.floor(input.planned_visits ?? 1));
    case "once_per_workday":
      return Math.max(1, Math.floor(input.planned_workdays ?? 1));
    case "custom":
      return Math.max(1, Math.floor(input.custom_trip_count ?? 1));
    case "once_for_project":
    default:
      return 1;
  }
}

/**
 * Diff estimated vs actual travel for invoice reconciliation.
 * Never auto-applies a higher charge — caller must require owner review.
 */
export function compareTravelSnapshots(input: {
  estimated_total_cents: number;
  actual_total_cents: number;
}): {
  difference_cents: number;
  actual_exceeds_estimate: boolean;
  requires_owner_review: boolean;
} {
  const difference = input.actual_total_cents - input.estimated_total_cents;
  const exceeds = difference > 0;
  return {
    difference_cents: difference,
    actual_exceeds_estimate: exceeds,
    requires_owner_review: exceeds,
  };
}
