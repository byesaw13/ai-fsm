// All money values in CENTS throughout this module.

export type PrepLevel = "none" | "minor" | "moderate" | "major";
export type PaintQuality = "economy" | "standard" | "premium" | "designer";
export type PaintingSurfaceType =
  | "walls"
  | "ceiling"
  | "trim"
  | "door"
  | "window"
  | "cabinet"
  | "exterior_siding"
  | "deck";
export type GeneralUnit = "hour" | "sqft" | "lf" | "unit" | "flat";
export type AdjustmentKind =
  | "trip_fee"
  | "surcharge"
  | "discount"
  | "credit"
  | "minimum_override";
export type EstimateJobType = "painting" | "general" | "repair" | "install" | "custom_build";

// ── Room-by-room painting input ───────────────────────────────────────────

export interface SurfaceSpec {
  type: PaintingSurfaceType;
  sqft?: number;
  linearFt?: number;
  count?: number;
  condition: "good" | "fair" | "poor";
  prep: PrepLevel;
  prime: boolean;
  textureMatch: boolean;
}

export interface RoomSpec {
  id: string;
  name: string;
  surfaces: SurfaceSpec[];
  coats: number;
}

// ── General service line items ─────────────────────────────────────────────

export interface LineItemSpec {
  id: string;
  priceBookCode?: string;
  priceBookId?: string;
  description: string;
  quantity: number;
  unit: GeneralUnit;
  unitLaborCents: number;
  materialCents?: number;
  visibleToCustomer?: boolean;
}

export interface AdjustmentSpec {
  id: string;
  type: AdjustmentKind;
  label: string;
  amountCents: number;
  reason?: string;
}

export interface RuleOverrideSpec {
  rule: string;
  reason: string;
  approvedBy: string;
  approvedAt: string;
}

// ── Main estimate specification (the frozen input) ─────────────────────────

export interface EstimateSpec {
  engineVersion: string;
  type: EstimateJobType;

  rooms?: RoomSpec[];
  paintQuality?: PaintQuality;

  lineItems?: LineItemSpec[];

  adjustments?: AdjustmentSpec[];
  overrides?: RuleOverrideSpec[];
  notes?: string;

  // Context flags consumed by guardrails
  tripCount?: "one_trip" | "multi_trip";
  requiresDryingOrCuring?: boolean;
  difficultAccess?: boolean;
  oldHouseRisk?: boolean;
  coordinationRequired?: boolean;
  finishExpectation?: "basic" | "clean" | "premium";
  hasMaRegulatedItems?: boolean;
}

// ── Rate card ──────────────────────────────────────────────────────────────

export interface PaintingRates {
  sqftRateCents: Record<PaintingSurfaceType, number>;
  prepMultipliers: Record<PrepLevel, number>;
  primeMultiplier: number;
  textureMatchMultiplier: number;
  additionalCoatMultiplier: number;
  coverageSqftPerGallon: number;
  paintCentsPerGallon: Record<PaintQuality, number>;
}

export interface PricingRules {
  version: string;
  laborCostCentsPerHour: number;
  laborBillingCentsPerHour: number;
  materialHandlingRate: number;
  depositRate: number;
  minimumTotalCents: number;
  marginFloor: number;
  painting: PaintingRates;
  tripFeeCents: number;
}

// ── Computed output ────────────────────────────────────────────────────────

export type ComputedLineCategory = "labor" | "material" | "handling" | "adjustment";

export interface ComputedLineItem {
  id: string;
  category: ComputedLineCategory;
  description: string;
  quantity: number;
  unit: string;
  unitAmountCents: number;
  totalCents: number;
  costBasisCents: number;
  marginCents: number;
  sourceRule: string;
  visibleToCustomer: boolean;
  roomId?: string;
  priceBookId?: string;
}

export interface EstimateSummary {
  laborCents: number;
  materialCents: number;
  handlingCents: number;
  subtotalCents: number;
  adjustmentsCents: number;
  totalCents: number;
  depositCents: number;
  balanceDueCents: number;
}

export interface InternalSummary {
  estimatedCostCents: number;
  grossMarginCents: number;
  grossMarginPct: number;
  effectiveLaborHours: number;
}

export interface RuleAuditEntry {
  rule: string;
  input: Record<string, unknown>;
  output: number | string | Record<string, unknown>;
  note?: string;
}

export interface GuardrailWarning {
  code: string;
  severity: "block" | "warn";
  message: string;
  overridable: boolean;
}

export interface ClientLineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  totalCents: number;
  visibleToCustomer: boolean;
}

export interface ClientView {
  lineItems: ClientLineItem[];
  summary: {
    subtotal: number;
    adjustments: number;
    total: number;
    depositDue: number;
    balanceDue: number;
  };
}

export interface InternalView {
  lineItems: ComputedLineItem[];
  summary: EstimateSummary;
  internalSummary: InternalSummary;
  audit: RuleAuditEntry[];
  warnings: GuardrailWarning[];
}

export interface EstimateResult {
  specVersion: string;
  rulesVersion: string;
  computedAt: string;
  lineItems: ComputedLineItem[];
  summary: EstimateSummary;
  internalSummary: InternalSummary;
  audit: RuleAuditEntry[];
  warnings: GuardrailWarning[];
  views: {
    client: ClientView;
    internal: InternalView;
  };
}
