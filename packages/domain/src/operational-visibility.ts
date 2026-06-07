import type { EstimateStatus, InvoiceStatus, JobStatus, VisitStatus } from "./statuses";

export type OperationalVisibility = "active" | "historical" | "archived";

export function getJobOperationalVisibility(status: JobStatus): OperationalVisibility {
  switch (status) {
    case "draft":
    case "quoted":
    case "scheduled":
    case "in_progress":
      return "active";
    case "completed":
    case "invoiced":
      return "historical";
    case "cancelled":
      return "archived";
  }
}

export function getVisitOperationalVisibility(status: VisitStatus): OperationalVisibility {
  switch (status) {
    case "scheduled":
    case "arrived":
    case "in_progress":
      return "active";
    case "completed":
      return "historical";
    case "cancelled":
      return "archived";
  }
}

export function getEstimateOperationalVisibility(status: EstimateStatus): OperationalVisibility {
  switch (status) {
    case "draft":
    case "sent":
    case "approved":
      return "active";
    case "declined":
    case "expired":
      return "historical";
  }
}

export function getInvoiceOperationalVisibility(status: InvoiceStatus): OperationalVisibility {
  switch (status) {
    case "draft":
    case "sent":
    case "partial":
    case "overdue":
      return "active";
    case "paid":
      return "historical";
    case "void":
      return "archived";
  }
}

export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ["draft", "quoted", "scheduled", "in_progress"];
export const HISTORICAL_JOB_STATUSES: readonly JobStatus[] = ["completed", "invoiced"];
export const ARCHIVED_JOB_STATUSES: readonly JobStatus[] = ["cancelled"];

export const ACTIVE_VISIT_STATUSES: readonly VisitStatus[] = ["scheduled", "arrived", "in_progress"];
export const HISTORICAL_VISIT_STATUSES: readonly VisitStatus[] = ["completed"];
export const ARCHIVED_VISIT_STATUSES: readonly VisitStatus[] = ["cancelled"];

export const ACTIVE_ESTIMATE_STATUSES: readonly EstimateStatus[] = ["draft", "sent", "approved"];
export const HISTORICAL_ESTIMATE_STATUSES: readonly EstimateStatus[] = ["declined", "expired"];

export const ACTIVE_INVOICE_STATUSES: readonly InvoiceStatus[] = ["draft", "sent", "partial", "overdue"];
export const HISTORICAL_INVOICE_STATUSES: readonly InvoiceStatus[] = ["paid"];
export const ARCHIVED_INVOICE_STATUSES: readonly InvoiceStatus[] = ["void"];
