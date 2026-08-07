/**
 * Vehicle tax CSV export (TASK-093) — expenses with vehicle_id, grouped by vehicle.
 */
import { formatCentsForCsv, formatDateForCsv, objectsToCsv } from "@/lib/reports/export";

export type VehicleTaxExportRow = {
  vehicle_nickname: unknown;
  expense_date: unknown;
  vendor_name: unknown;
  category: unknown;
  amount_cents: unknown;
  notes?: unknown;
};

export function formatVehicleTaxCsv(rows: VehicleTaxExportRow[]): string {
  const headers = ["Vehicle", "Date", "Vendor", "Category", "Amount", "Notes"];
  const mapped: Record<string, unknown>[] = rows.map((r) => ({
    Vehicle: r.vehicle_nickname ?? "",
    Date: formatDateForCsv(r.expense_date),
    Vendor: r.vendor_name ?? "",
    Category: r.category ?? "",
    Amount: formatCentsForCsv(r.amount_cents),
    Notes: r.notes ?? "",
  }));
  return objectsToCsv(headers, mapped);
}
