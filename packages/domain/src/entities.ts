import { z } from "zod";
import {
  roleSchema,
  jobTypeSchema,
  jobStatusSchema,
  visitStatusSchema,
  lineItemTypeSchema,
  estimateStatusSchema,
  presentationModeSchema,
  invoiceStatusSchema,
  paymentMethodSchema,
  automationTypeSchema,
  auditActionSchema,
} from "./statuses";

const uuidField = z.string().uuid();
const centsField = z.number().int().nonnegative();
const timestampField = z.string().datetime();

// === Core entities ===

export const accountSchema = z.object({
  id: uuidField,
  name: z.string().min(1),
  settings: z.record(z.unknown()).default({}),
  created_at: timestampField,
  updated_at: timestampField,
});
export type Account = z.infer<typeof accountSchema>;

export const userSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().nullable().optional(),
  role: roleSchema,
  created_at: timestampField,
  updated_at: timestampField,
});
export type User = z.infer<typeof userSchema>;

export const clientSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  name: z.string().min(1),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  created_at: timestampField,
  updated_at: timestampField,
});
export type Client = z.infer<typeof clientSchema>;

export const propertySchema = z.object({
  id: uuidField,
  account_id: uuidField,
  client_id: uuidField,
  name: z.string().nullable().optional(),
  address: z.string().min(1),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: timestampField,
  updated_at: timestampField,
});
export type Property = z.infer<typeof propertySchema>;

export const jobSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  client_id: uuidField,
  property_id: uuidField.nullable().optional(),
  title: z.string().min(1),
  job_number: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  status: jobStatusSchema,
  job_type: jobTypeSchema.default("custom"),
  priority: z.number().int().default(0),
  scheduled_start: timestampField.nullable().optional(),
  scheduled_end: timestampField.nullable().optional(),
  actual_cost_cents: centsField.nullable().optional(),
  travel_miles: z.number().nonnegative().nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
  updated_at: timestampField,
});
export type Job = z.infer<typeof jobSchema>;

export const visitSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  job_id: uuidField,
  assigned_user_id: uuidField.nullable().optional(),
  status: visitStatusSchema,
  scheduled_start: timestampField,
  scheduled_end: timestampField,
  arrived_at: timestampField.nullable().optional(),
  completed_at: timestampField.nullable().optional(),
  tech_notes: z.string().nullable().optional(),
  materials_used: z.string().nullable().optional(),
  created_at: timestampField,
  updated_at: timestampField,
});
export type Visit = z.infer<typeof visitSchema>;

// === Estimate sub-schemas ===

export const estimateAdjustmentTypeSchema = z.enum([
  "bundle_credit",
  "member_credit",
  "promo",
  "travel_surcharge",
  "risk_adjustment",
  "return_trip_charge",
  "coordination_fee",
]);
export type EstimateAdjustmentType = z.infer<typeof estimateAdjustmentTypeSchema>;

export const pricingModeSchema = z.enum(["flat_rate", "hourly_internal"]);
export type PricingMode = z.infer<typeof pricingModeSchema>;

export const estimateTripCountSchema = z.enum(["one_trip", "multi_trip"]);
export type EstimateTripCount = z.infer<typeof estimateTripCountSchema>;

export const estimateFinishExpectationSchema = z.enum(["basic", "clean", "premium"]);
export type EstimateFinishExpectation = z.infer<typeof estimateFinishExpectationSchema>;

export const estimateMinimumOverrideReasonSchema = z.enum([
  "bundled",
  "membership_included",
  "promo",
  "owner_approved",
]);
// Type is exported from dovetails.ts as EstimateMinimumOverrideReason

export const estimatePricingReviewStatusSchema = z.enum(["needs_review", "passed", "blocked"]);
// Type is exported from dovetails.ts as EstimatePricingReviewStatus

export const estimateLineItemSchema = z.object({
  id: uuidField,
  estimate_id: uuidField,
  option_id: uuidField.nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: centsField,
  total_cents: centsField,
  line_item_type: lineItemTypeSchema.default("labor"),
  visible_to_customer: z.boolean().default(true),
  adjustment_type: estimateAdjustmentTypeSchema.nullable().optional(),
  sort_order: z.number().int().default(0),
  created_at: timestampField,
});
export type EstimateLineItem = z.infer<typeof estimateLineItemSchema>;

export const estimateOptionSchema = z.object({
  id: uuidField,
  estimate_id: uuidField,
  label: z.string().min(1),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  subtotal_cents: centsField,
  tax_cents: centsField,
  total_cents: centsField,
  is_recommended: z.boolean().default(false),
  line_items: z.array(estimateLineItemSchema).default([]),
  created_at: timestampField,
});
export type EstimateOption = z.infer<typeof estimateOptionSchema>;

export const estimateSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  client_id: uuidField,
  job_id: uuidField.nullable().optional(),
  property_id: uuidField.nullable().optional(),
  status: estimateStatusSchema,
  presentation_mode: presentationModeSchema.default("standard"),
  pricing_mode: pricingModeSchema.default("flat_rate"),
  subtotal_cents: centsField,
  tax_cents: centsField,
  total_cents: centsField,
  deposit_cents: centsField,
  balance_cents: centsField,
  // Painting engine fields
  sq_ft: z.number().positive().nullable().optional(),
  prep_level: z.number().int().min(1).max(10).nullable().optional(),
  includes_trim: z.boolean().default(false),
  includes_ceiling: z.boolean().default(false),
  // Internal cost tracking (never shown to customer)
  internal_labor_cost_cents: centsField.nullable().optional(),
  internal_material_cost_cents: centsField.nullable().optional(),
  target_margin_pct: z.number().min(0).max(100).nullable().optional(),
  // Pricing guardrail fields
  trip_count: estimateTripCountSchema.default("one_trip"),
  requires_drying_or_curing: z.boolean().default(false),
  difficult_access: z.boolean().default(false),
  old_house_risk: z.boolean().default(false),
  coordination_required: z.boolean().default(false),
  finish_expectation: estimateFinishExpectationSchema.default("clean"),
  travel_surcharge_cents: centsField.default(0),
  risk_adjustment_cents: centsField.default(0),
  minimum_service_override_reason: estimateMinimumOverrideReasonSchema.nullable().optional(),
  minimum_service_override_note: z.string().nullable().optional(),
  pricing_review_status: estimatePricingReviewStatusSchema.default("needs_review"),
  pricing_reviewed_at: timestampField.nullable().optional(),
  pricing_reviewed_by: uuidField.nullable().optional(),
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  estimate_number: z.string().nullable().optional(),
  sent_at: timestampField.nullable().optional(),
  expires_at: timestampField.nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
  updated_at: timestampField,
  options: z.array(estimateOptionSchema).default([]),
});
export type Estimate = z.infer<typeof estimateSchema>;

// === Invoice ===

export const invoiceLineItemSchema = z.object({
  id: uuidField,
  invoice_id: uuidField,
  estimate_line_item_id: uuidField.nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: centsField,
  total_cents: centsField,
  line_item_type: lineItemTypeSchema.default("labor"),
  visible_to_customer: z.boolean().default(true),
  sort_order: z.number().int().default(0),
  created_at: timestampField,
});
export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;

export const invoiceSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  client_id: uuidField,
  job_id: uuidField.nullable().optional(),
  estimate_id: uuidField.nullable().optional(),
  property_id: uuidField.nullable().optional(),
  status: invoiceStatusSchema,
  invoice_number: z.string().min(1),
  subtotal_cents: centsField,
  tax_cents: centsField,
  total_cents: centsField,
  paid_cents: centsField,
  deposit_cents: centsField,
  deposit_paid_at: timestampField.nullable().optional(),
  balance_cents: centsField,
  notes: z.string().nullable().optional(),
  due_date: timestampField.nullable().optional(),
  sent_at: timestampField.nullable().optional(),
  paid_at: timestampField.nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
  updated_at: timestampField,
});
export type Invoice = z.infer<typeof invoiceSchema>;

// === Payment ===

export const paymentSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  invoice_id: uuidField,
  amount_cents: z.number().int().positive(),
  method: paymentMethodSchema,
  received_at: timestampField,
  notes: z.string().nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
});
export type Payment = z.infer<typeof paymentSchema>;

// === Automation ===

export const automationSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  type: automationTypeSchema,
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
  next_run_at: timestampField,
  last_run_at: timestampField.nullable().optional(),
  created_at: timestampField,
  updated_at: timestampField,
});
export type Automation = z.infer<typeof automationSchema>;

// === Audit ===

export const auditLogSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  entity_type: z.string().min(1),
  entity_id: uuidField,
  action: auditActionSchema,
  actor_id: uuidField,
  old_value: z.record(z.unknown()).nullable().optional(),
  new_value: z.record(z.unknown()).nullable().optional(),
  created_at: timestampField,
});
export type AuditLog = z.infer<typeof auditLogSchema>;

export const periodCloseSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  period_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  closed_by: uuidField,
  closed_at: timestampField,
  notes: z.string().nullable().optional(),
});
export type PeriodClose = z.infer<typeof periodCloseSchema>;

// === API utilities ===

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    traceId: z.string().uuid(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  total: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof paginationSchema>;

// === Paperless-ngx integration ===

export const documentLinkEntityTypeSchema = z.enum([
  "expense",
  "job",
  "client",
  "property",
  "invoice",
  "estimate",
]);
export type DocumentLinkEntityType = z.infer<typeof documentLinkEntityTypeSchema>;

export const documentLinkSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  entity_type: documentLinkEntityTypeSchema,
  entity_id: uuidField,
  paperless_doc_id: z.number().int().positive(),
  title: z.string().nullable().optional(),
  original_filename: z.string().nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
});
export type DocumentLink = z.infer<typeof documentLinkSchema>;

export const createDocumentLinkSchema = z.object({
  entity_type: documentLinkEntityTypeSchema,
  entity_id: z.string().uuid(),
  paperless_doc_id: z.number().int().positive(),
  title: z.string().max(500).nullable().optional(),
  original_filename: z.string().max(500).nullable().optional(),
});

// === Homebox asset integration ===

export const assetLinkEntityTypeSchema = z.enum(["job", "visit"]);
export type AssetLinkEntityType = z.infer<typeof assetLinkEntityTypeSchema>;

export const assetLinkStatusSchema = z.enum(["planned", "on_site", "returned"]);
export type AssetLinkStatus = z.infer<typeof assetLinkStatusSchema>;

export const assetLinkSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  entity_type: assetLinkEntityTypeSchema,
  entity_id: uuidField,
  homebox_item_id: z.string().uuid(),
  cached_name: z.string().nullable().optional(),
  cached_location: z.string().nullable().optional(),
  status: assetLinkStatusSchema,
  created_by: uuidField,
  created_at: timestampField,
});
export type AssetLink = z.infer<typeof assetLinkSchema>;
