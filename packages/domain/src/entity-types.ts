import type {
  Role,
  JobType,
  JobStatus,
  VisitStatus,
  LineItemType,
  EstimateStatus,
  PresentationMode,
  InvoiceStatus,
  PaymentMethod,
  AutomationType,
  AuditAction,
} from "./statuses";
import type {
  EstimateAdjustmentType,
  EstimateFinishExpectation,
  EstimateTripCount,
  PricingMode,
} from "./estimate-schemas";
import type {
  EstimateMinimumOverrideReason,
  EstimatePricingReviewStatus,
} from "./dovetails";

// === Core entities ===

export type Account = {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export type User = {
  id: string;
  account_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: Role;
  created_at: string;
  updated_at: string;
}

export type Client = {
  id: string;
  account_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  company_name?: string | null;
  address_line1?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  created_at: string;
  updated_at: string;
}

export type Property = {
  id: string;
  account_id: string;
  client_id: string;
  name?: string | null;
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export type Job = {
  id: string;
  account_id: string;
  client_id: string;
  property_id?: string | null;
  title: string;
  job_number?: string | null;
  description?: string | null;
  status: JobStatus;
  job_type: JobType;
  priority: number;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  actual_cost_cents?: number | null;
  travel_miles?: number | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type Visit = {
  id: string;
  account_id: string;
  job_id: string;
  assigned_user_id?: string | null;
  status: VisitStatus;
  scheduled_start: string;
  scheduled_end: string;
  arrived_at?: string | null;
  completed_at?: string | null;
  tech_notes?: string | null;
  materials_used?: string | null;
  created_at: string;
  updated_at: string;
}

// === Estimate sub-types ===

export type EstimateLineItem = {
  id: string;
  estimate_id: string;
  option_id?: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: LineItemType;
  visible_to_customer: boolean;
  adjustment_type?: EstimateAdjustmentType | null;
  sort_order: number;
  created_at: string;
}

export type EstimateOption = {
  id: string;
  estimate_id: string;
  label: string;
  description?: string | null;
  sort_order: number;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  is_recommended: boolean;
  line_items: EstimateLineItem[];
  created_at: string;
}

export type Estimate = {
  id: string;
  account_id: string;
  client_id: string;
  job_id?: string | null;
  property_id?: string | null;
  status: EstimateStatus;
  presentation_mode: PresentationMode;
  pricing_mode: PricingMode;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  sq_ft?: number | null;
  prep_level?: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  internal_labor_cost_cents?: number | null;
  internal_material_cost_cents?: number | null;
  target_margin_pct?: number | null;
  trip_count: EstimateTripCount;
  requires_drying_or_curing: boolean;
  difficult_access: boolean;
  old_house_risk: boolean;
  coordination_required: boolean;
  finish_expectation: EstimateFinishExpectation;
  travel_surcharge_cents: number;
  risk_adjustment_cents: number;
  minimum_service_override_reason?: EstimateMinimumOverrideReason | null;
  minimum_service_override_note?: string | null;
  pricing_review_status: EstimatePricingReviewStatus;
  pricing_reviewed_at?: string | null;
  pricing_reviewed_by?: string | null;
  notes?: string | null;
  internal_notes?: string | null;
  estimate_number?: string | null;
  sent_at?: string | null;
  expires_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  options: EstimateOption[];
}

// === Invoice ===

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  estimate_line_item_id?: string | null;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: LineItemType;
  visible_to_customer: boolean;
  sort_order: number;
  created_at: string;
}

export type Invoice = {
  id: string;
  account_id: string;
  client_id: string;
  job_id?: string | null;
  estimate_id?: string | null;
  property_id?: string | null;
  status: InvoiceStatus;
  invoice_number: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_cents: number;
  deposit_cents: number;
  deposit_paid_at?: string | null;
  balance_cents: number;
  notes?: string | null;
  due_date?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// === Payment ===

export type Payment = {
  id: string;
  account_id: string;
  invoice_id: string;
  amount_cents: number;
  method: PaymentMethod;
  received_at: string;
  notes?: string | null;
  created_by: string;
  created_at: string;
}

// === Automation ===

export type Automation = {
  id: string;
  account_id: string;
  type: AutomationType;
  enabled: boolean;
  config: Record<string, unknown>;
  next_run_at: string;
  last_run_at?: string | null;
  created_at: string;
  updated_at: string;
}

// === Audit ===

export type AuditLog = {
  id: string;
  account_id: string;
  entity_type: string;
  entity_id: string;
  action: AuditAction;
  actor_id: string;
  old_value?: Record<string, unknown> | null;
  new_value?: Record<string, unknown> | null;
  created_at: string;
}

export type PeriodClose = {
  id: string;
  account_id: string;
  period_month: string;
  closed_by: string;
  closed_at: string;
  notes?: string | null;
}

// === API utilities ===

export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    traceId: string;
  };
}

export type Pagination = {
  page: number;
  limit: number;
  total: number;
}

// === Paperless-ngx integration ===

export type DocumentLinkEntityType =
  | "expense"
  | "job"
  | "client"
  | "property"
  | "invoice"
  | "estimate";

export type DocumentLink = {
  id: string;
  account_id: string;
  entity_type: DocumentLinkEntityType;
  entity_id: string;
  paperless_doc_id: number;
  title?: string | null;
  original_filename?: string | null;
  created_by: string;
  created_at: string;
}

// === Homebox asset integration ===

export type AssetLinkEntityType = "job" | "visit";

export type AssetLinkStatus = "planned" | "on_site" | "returned";

export type AssetLink = {
  id: string;
  account_id: string;
  entity_type: AssetLinkEntityType;
  entity_id: string;
  homebox_item_id: string;
  cached_name?: string | null;
  cached_location?: string | null;
  status: AssetLinkStatus;
  created_by: string;
  created_at: string;
}