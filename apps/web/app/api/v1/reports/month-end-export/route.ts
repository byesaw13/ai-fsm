import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { withReportContext } from "@/lib/reports/db";
import {
  formatExpensesCsv,
  formatInvoicesCsv,
  formatPaymentsCsv,
  formatMileageCsv,
} from "@/lib/reports/export";
import type {
  ExpenseExportRow,
  InvoiceExportRow,
  PaymentExportRow,
  MileageExportRow,
} from "@/lib/reports/export";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/reports/month-end-export?month=YYYY-MM&type=expenses|invoices|payments|mileage
//
// Returns a CSV file for the requested data type filtered to the given month.
// Mileage gracefully returns empty CSV if the mileage_logs table does not exist
// (pending migration from a future sprint).
// ---------------------------------------------------------------------------

const exportTypes = ["expenses", "invoices", "payments", "mileage"] as const;
type ExportType = (typeof exportTypes)[number];

const querySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  type: z.enum(exportTypes),
});

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = querySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
    type: searchParams.get("type") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters — month must be YYYY-MM, type must be one of: expenses, invoices, payments, mileage",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { month, type } = parseResult.data;
  const filename = `${type}-${month}.csv`;

  try {
    const csvContent = await withReportContext(session, async (client) => {
      return buildCsv(client, session.accountId, month, type);
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/reports/month-end-export error", error, {
      traceId: session.traceId,
      month,
      type,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to generate export",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// Per-type query builders
// ---------------------------------------------------------------------------

async function buildCsv(
  client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  accountId: string,
  month: string,
  type: ExportType
): Promise<string> {
  const monthStart = `${month}-01`;

  switch (type) {
    case "expenses": {
      const { rows } = await client.query(
        `SELECT e.expense_date, e.vendor_name, e.category, e.amount_cents,
                j.title AS job_title, e.notes
         FROM expenses e
         LEFT JOIN jobs j ON j.id = e.job_id
         WHERE e.account_id = $1
           AND e.expense_date >= $2::date
           AND e.expense_date < ($2::date + interval '1 month')
         ORDER BY e.expense_date, e.created_at`,
        [accountId, monthStart]
      );
      return formatExpensesCsv(rows as unknown as ExpenseExportRow[]);
    }

    case "invoices": {
      const { rows } = await client.query(
        `SELECT i.invoice_number, c.name AS client_name, i.status,
                i.subtotal_cents, i.tax_cents, i.total_cents, i.paid_cents,
                i.due_date, i.created_at
         FROM invoices i
         LEFT JOIN clients c ON c.id = i.client_id
         WHERE i.account_id = $1
           AND to_char(i.created_at, 'YYYY-MM') = $2
         ORDER BY i.created_at`,
        [accountId, month]
      );
      return formatInvoicesCsv(rows as unknown as InvoiceExportRow[]);
    }

    case "payments": {
      const { rows } = await client.query(
        `SELECT i.invoice_number, p.amount_cents, p.method, p.received_at, p.notes
         FROM payments p
         JOIN invoices i ON i.id = p.invoice_id
         WHERE p.account_id = $1
           AND p.received_at >= $2::date
           AND p.received_at < ($2::date + interval '1 month')
         ORDER BY p.received_at`,
        [accountId, monthStart]
      );
      return formatPaymentsCsv(rows as unknown as PaymentExportRow[]);
    }

    case "mileage": {
      // mileage_logs table may not exist if P8-T3 migration is not applied.
      // Return a header-only CSV rather than failing.
      try {
        const { rows } = await client.query(
          `SELECT ml.trip_date, ml.purpose, ml.miles,
                  j.title AS job_title, ml.notes
           FROM mileage_logs ml
           LEFT JOIN jobs j ON j.id = ml.job_id
           WHERE ml.account_id = $1
             AND ml.trip_date >= $2::date
             AND ml.trip_date < ($2::date + interval '1 month')
           ORDER BY ml.trip_date`,
          [accountId, monthStart]
        );
        return formatMileageCsv(rows as unknown as MileageExportRow[]);
      } catch {
        // Table does not exist — return empty CSV with headers
        return formatMileageCsv([]);
      }
    }
  }
}
