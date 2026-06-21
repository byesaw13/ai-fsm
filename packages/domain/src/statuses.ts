import { z } from "zod";

// === Roles ===

export const roleSchema = z.enum(["owner", "admin", "tech"]);
export type Role = z.infer<typeof roleSchema>;

// === Job ===

export const jobTypeSchema = z.enum([
  "maintenance",
  "painting",
  "repair",
  "custom",
  "plumbing",
  "electrical",
  "hvac",
  "carpentry",
  "roofing",
  "flooring",
  "windows_doors",
  "appliances",
  "drywall",
  "landscaping",
]);
export type JobType = z.infer<typeof jobTypeSchema>;

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

export const jobTransitions: Record<JobStatus, readonly JobStatus[]> = {
  draft: ["quoted", "scheduled"],
  quoted: ["scheduled", "draft"],
  scheduled: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: ["invoiced"],
  invoiced: [],
  cancelled: ["draft"],
};

// === Visit ===

export const visitStatusSchema = z.enum([
  "scheduled",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
]);
export type VisitStatus = z.infer<typeof visitStatusSchema>;

export const visitTransitions: Record<VisitStatus, readonly VisitStatus[]> = {
  scheduled: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export const VISIT_TYPES = [
  "standard",
  "site_visit",
  "realtor_baseline",
  "membership_health_check",
  "punch_list",
] as const;
export type VisitType = typeof VISIT_TYPES[number];

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  standard: "Standard Visit",
  site_visit: "Site Visit",
  realtor_baseline: "Realtor Baseline Inspection",
  membership_health_check: "Membership Health Check",
  punch_list: "Punch List",
};

// === Booking Request ===

export const bookingRequestStatusSchema = z.enum([
  "pending",
  "needs_info",
  "duplicate",
  "reviewed",
  "converted",
  "cancelled",
]);
export type BookingRequestStatus = z.infer<typeof bookingRequestStatusSchema>;

// "converted" is terminal and set only by /convert endpoint
export const bookingRequestPatchStatusSchema = z.enum([
  "pending",
  "needs_info",
  "duplicate",
  "reviewed",
  "cancelled",
]);

// === Estimate ===

export const estimateStatusSchema = z.enum([
  "draft",
  "sent",
  "approved",
  "declined",
  "expired",
]);
export type EstimateStatus = z.infer<typeof estimateStatusSchema>;

export const estimateTransitions: Record<EstimateStatus, readonly EstimateStatus[]> = {
  draft: ["sent"],
  sent: ["approved", "declined", "expired"],
  approved: [],
  declined: [],
  expired: [],
};

export const presentationModeSchema = z.enum(["standard", "multi_option"]);
export type PresentationMode = z.infer<typeof presentationModeSchema>;

export const lineItemTypeSchema = z.enum(["labor", "materials", "handling_fee", "adjustment"]);
export type LineItemType = z.infer<typeof lineItemTypeSchema>;

// === Invoice ===

export const invoiceStatusSchema = z.enum([
  "draft",
  "sent",
  "partial",
  "paid",
  "overdue",
  "void",
]);
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;

export const invoiceTransitions: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  draft: ["sent", "void"],
  sent: ["draft", "partial", "paid", "overdue", "void"],
  partial: ["draft", "paid", "overdue", "void"],
  overdue: ["draft", "partial", "paid", "void"],
  paid: [],
  void: [],
};

// === Payment ===

export const paymentMethodSchema = z.enum([
  "square",
  "venmo",
  "cash",
  "check",
  "zelle",
  "ach",
  // legacy values retained for back-compat with existing payment rows
  "card",
  "transfer",
  "other",
]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  square: "Square",
  venmo: "Venmo",
  cash: "Cash",
  check: "Check",
  zelle: "Zelle",
  ach: "ACH",
  card: "Card",
  transfer: "Transfer",
  other: "Other",
};

export const paymentTypeSchema = z.enum([
  "deposit",
  "progress",
  "final",
  "refund",
  "adjustment",
]);
export type PaymentType = z.infer<typeof paymentTypeSchema>;

export const paymentTypeLabels: Record<PaymentType, string> = {
  deposit: "Deposit",
  progress: "Progress",
  final: "Final",
  refund: "Refund",
  adjustment: "Adjustment",
};

export const paymentStatusSchema = z.enum([
  "pending",
  "paid",
  "failed",
  "refunded",
  "cancelled",
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

// === Automation ===

export const automationTypeSchema = z.enum([
  "visit_reminder",
  "invoice_followup",
  "booking_confirmed",
  "membership_renewal_nudge",
  "review_request",
  "client_reactivation",
  "recurring_inspection",
  "property_issue_scan",
  "stale_job_nudge",
  "estimate_followup",
  "seasonal_reminder_spring",
  "seasonal_reminder_fall",
]);
export type AutomationType = z.infer<typeof automationTypeSchema>;

// === Expense ===

export const expenseCategorySchema = z.enum([
  "materials",
  "tools",
  "fuel",
  "vehicle",
  "subcontractors",
  "office",
  "insurance",
  "utilities",
  "marketing",
  "meals",
  "travel",
  "other",
]);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

export const EXPENSE_CATEGORIES = expenseCategorySchema.options;

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  materials: "Materials",
  tools: "Tools & Equipment",
  fuel: "Fuel",
  vehicle: "Vehicle",
  subcontractors: "Subcontractors",
  office: "Office & Admin",
  insurance: "Insurance",
  utilities: "Utilities",
  marketing: "Marketing",
  meals: "Meals & Entertainment",
  travel: "Travel",
  other: "Other",
};

// === Audit ===

export const auditActionSchema = z.enum(["insert", "update", "delete"]);
export type AuditAction = z.infer<typeof auditActionSchema>;
