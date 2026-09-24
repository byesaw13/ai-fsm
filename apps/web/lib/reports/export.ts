/**
 * Pure CSV formatting utilities for month-end export (P8-T6).
 *
 * All functions are side-effect-free — they accept plain data rows
 * and return a CSV string.  No IO, no DB, no HTTP.
 *
 * CSV follows RFC 4180:
 *   - Fields with commas, double-quotes, or newlines are enclosed in double-quotes.
 *   - Double-quotes inside quoted fields are escaped as "".
 *   - Lines end with CRLF.
 */

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

import { SPONSORED_PURPOSE_LABELS, type SponsoredPurpose } from "@/lib/invoices/sponsored";

/** Escape a single CSV field value per RFC 4180. */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Convert an array of row-objects into a CSV string (header + data rows). */
export function objectsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvField(row[h])).join(",")
  );
  return [headerLine, ...dataLines].join("\r\n") + "\r\n";
}

/** Format cents as a dollar string: 1050 → "$10.50" */
export function formatCentsForCsv(cents: unknown): string {
  const n = Number(cents ?? 0);
  const sign = n < 0 ? "-" : "";
  return `${sign}$${(Math.abs(n) / 100).toFixed(2)}`;
}

/** Format a date string or Date to YYYY-MM-DD. */
export function formatDateForCsv(value: unknown): string {
  if (!value) return "";
  const d = typeof value === "string" ? value : String(value);
  // Already YYYY-MM-DD or starts with ISO timestamp
  return d.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Row types (lightweight — just the columns we need for export)
// ---------------------------------------------------------------------------

export interface ExpenseExportRow {
  expense_date: unknown;
  vendor_name: unknown;
  category: unknown;
  amount_cents: unknown;
  job_title?: unknown;
  notes?: unknown;
}

export interface InvoiceExportRow {
  invoice_number: unknown;
  client_name: unknown;
  status: unknown;
  subtotal_cents: unknown;
  tax_cents: unknown;
  total_cents: unknown;
  paid_cents: unknown;
  due_date?: unknown;
  created_at: unknown;
  billing_context?: unknown;
  property_address?: unknown;
  beneficiary_name?: unknown;
  sponsored_purpose?: unknown;
  business_purpose?: unknown;
  work_summary?: unknown;
  paid_at?: unknown;
}

export interface PaymentExportRow {
  invoice_number: unknown;
  amount_cents: unknown;
  method: unknown;
  payment_type?: unknown;
  status?: unknown;
  received_at: unknown;
  notes?: unknown;
}

export interface MileageExportRow {
  trip_date: unknown;
  purpose?: unknown;
  miles: unknown;
  job_title?: unknown;
  notes?: unknown;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatExpensesCsv(rows: ExpenseExportRow[]): string {
  const headers = ["Date", "Vendor", "Category", "Amount", "Job", "Notes"];
  const mapped: Record<string, unknown>[] = rows.map((r) => ({
    Date: formatDateForCsv(r.expense_date),
    Vendor: r.vendor_name ?? "",
    Category: r.category ?? "",
    Amount: formatCentsForCsv(r.amount_cents),
    Job: r.job_title ?? "",
    Notes: r.notes ?? "",
  }));
  return objectsToCsv(headers, mapped);
}

export function formatInvoicesCsv(rows: InvoiceExportRow[]): string {
  const headers = [
    "Invoice #",
    "Client",
    "Billing Context",
    "Service Property",
    "Work For",
    "Sponsored Purpose",
    "Business Purpose",
    "Work Summary",
    "Paid Date",
    "Status",
    "Subtotal",
    "Tax",
    "Total",
    "Paid",
    "Due Date",
    "Created",
  ];
  const mapped: Record<string, unknown>[] = rows.map((r) => ({
    "Invoice #": r.invoice_number ?? "",
    Client: r.client_name ?? "",
    "Billing Context": r.billing_context === "realtor_sponsored" ? "Realtor-sponsored property expense" : "Standard",
    "Service Property": r.property_address ?? "",
    "Work For": r.beneficiary_name ?? "",
    "Sponsored Purpose": r.sponsored_purpose
      ? SPONSORED_PURPOSE_LABELS[r.sponsored_purpose as SponsoredPurpose] ?? String(r.sponsored_purpose)
      : "",
    "Business Purpose": r.business_purpose ?? "",
    "Work Summary": r.work_summary ?? "",
    "Paid Date": formatDateForCsv(r.paid_at),
    Status: r.status ?? "",
    Subtotal: formatCentsForCsv(r.subtotal_cents),
    Tax: formatCentsForCsv(r.tax_cents),
    Total: formatCentsForCsv(r.total_cents),
    Paid: formatCentsForCsv(r.paid_cents),
    "Due Date": formatDateForCsv(r.due_date),
    Created: formatDateForCsv(r.created_at),
  }));
  return objectsToCsv(headers, mapped);
}

export function formatPaymentsCsv(rows: PaymentExportRow[]): string {
  const headers = ["Invoice #", "Amount", "Method", "Type", "Status", "Received Date", "Notes"];
  const mapped: Record<string, unknown>[] = rows.map((r) => ({
    "Invoice #": r.invoice_number ?? "",
    Amount: formatCentsForCsv(r.amount_cents),
    Method: r.method ?? "",
    // Type/Status make refunds and pending links distinguishable from received
    // cash so a reader never sums a refund as income.
    Type: r.payment_type ?? "",
    Status: r.status ?? "",
    "Received Date": formatDateForCsv(r.received_at),
    Notes: r.notes ?? "",
  }));
  return objectsToCsv(headers, mapped);
}

export function formatMileageCsv(rows: MileageExportRow[]): string {
  const headers = ["Date", "Purpose", "Miles", "Job", "Notes"];
  const mapped: Record<string, unknown>[] = rows.map((r) => ({
    Date: formatDateForCsv(r.trip_date),
    Purpose: r.purpose ?? "",
    Miles: r.miles ?? "",
    Job: r.job_title ?? "",
    Notes: r.notes ?? "",
  }));
  return objectsToCsv(headers, mapped);
}
