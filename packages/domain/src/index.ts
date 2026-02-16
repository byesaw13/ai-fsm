import { z } from "zod";

// === Enums ===

export const roleSchema = z.enum(["owner", "admin", "tech"]);
export type Role = z.infer<typeof roleSchema>;

export const jobStatusSchema = z.enum([
  "draft",
  "quoted",
  "scheduled",
  "in_progress",
  "completed",
  "invoiced",
  "cancelled",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const visitStatusSchema = z.enum([
  "scheduled",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
]);
export type VisitStatus = z.infer<typeof visitStatusSchema>;

export const estimateStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
]);
export type EstimateStatus = z.infer<typeof estimateStatusSchema>;

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const automationTypeSchema = z.enum([
  "visit_reminder",
  "invoice_followup",
]);
export type AutomationType = z.infer<typeof automationTypeSchema>;

export const auditActionSchema = z.enum(["insert", "update", "delete"]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const paymentMethodSchema = z.enum([
  "cash",
  "check",
  "card",
  "transfer",
  "other",
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// === Status Transition Maps ===

export const jobTransitions: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["quoted", "scheduled"],
  quoted: ["scheduled", "draft"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  invoiced: [],
  cancelled: ["draft"],
};

export const visitTransitions: Record<VisitStatus, readonly VisitStatus[]> = {
  scheduled: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed"],
  completed: [],
  cancelled: [],
};

export const estimateTransitions: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["approved", "declined", "expired"],
  approved: [],
  declined: [],
  expired: [],
};

export const invoiceTransitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["partial", "paid", "overdue", "void"],
  partial: ["paid", "overdue", "void"],
  overdue: ["partial", "paid", "void"],
  paid: [],
  void: [],
};

// === Entity Schemas ===

const uuidField = z.string().uuid();
const centsField = z.number().int().nonnegative();
const timestampField = z.string().datetime();

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
  description: z.string().nullable().optional(),
  status: jobStatusSchema,
  priority: z.number().int().default(0),
  scheduled_start: timestampField.nullable().optional(),
  scheduled_end: timestampField.nullable().optional(),
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
  created_at: timestampField,
  updated_at: timestampField,
});
export type Visit = z.infer<typeof visitSchema>;

export const estimateLineItemSchema = z.object({
  id: uuidField,
  estimate_id: uuidField,
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: centsField,
  total_cents: centsField,
  sort_order: z.number().int().default(0),
  created_at: timestampField,
});
export type EstimateLineItem = z.infer<typeof estimateLineItemSchema>;

export const estimateSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  client_id: uuidField,
  job_id: uuidField.nullable().optional(),
  property_id: uuidField.nullable().optional(),
  status: estimateStatusSchema,
  subtotal_cents: centsField,
  tax_cents: centsField,
  total_cents: centsField,
  notes: z.string().nullable().optional(),
  internal_notes: z.string().nullable().optional(),
  sent_at: timestampField.nullable().optional(),
  expires_at: timestampField.nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
  updated_at: timestampField,
});
export type Estimate = z.infer<typeof estimateSchema>;

export const invoiceLineItemSchema = z.object({
  id: uuidField,
  invoice_id: uuidField,
  estimate_line_item_id: uuidField.nullable().optional(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit_price_cents: centsField,
  total_cents: centsField,
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
  notes: z.string().nullable().optional(),
  due_date: timestampField.nullable().optional(),
  sent_at: timestampField.nullable().optional(),
  paid_at: timestampField.nullable().optional(),
  created_by: uuidField,
  created_at: timestampField,
  updated_at: timestampField,
});
export type Invoice = z.infer<typeof invoiceSchema>;

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

// === API Error Model ===

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    traceId: z.string().uuid(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

// === Pagination ===

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  total: z.number().int().nonnegative(),
});
export type Pagination = z.infer<typeof paginationSchema>;
