import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import { appendAuditLog } from "@/lib/db/audit";
import { withInvoiceContext } from "@/lib/invoices/db";
import { assertDraftInvoice, recalculateInvoiceTotals } from "@/lib/invoices/line-items";
import { applyLaborRateMode } from "@/lib/invoices/labor-rate-mode";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["hourly", "price_book", "flat"]),
  price_book_id: z.string().uuid().optional(),
  price_cents: z.number().int().nonnegative().optional(),
  flat_cents: z.number().int().nonnegative().optional(),
});

export const POST = withRole(["owner", "admin"], async (request, session) => {
  const invoiceId = request.nextUrl.pathname.split("/").at(-2)!;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid body",
          details: parsed.error.flatten().fieldErrors,
          traceId: session.traceId,
        },
      },
      { status: 422 },
    );
  }

  try {
    const data = await withInvoiceContext(session, async (client) => {
      const invoice = await assertDraftInvoice(client, invoiceId, session.accountId);
      if (!invoice.job_id) {
        throw Object.assign(new Error("Invoice is not linked to a job"), {
          code: "INVALID_INVOICE",
        });
      }

      const lineItem = await applyLaborRateMode(client, {
        invoiceId,
        accountId: session.accountId,
        jobId: invoice.job_id,
        mode: parsed.data.mode,
        priceBookId: parsed.data.price_book_id,
        priceCents: parsed.data.price_cents,
        flatCents: parsed.data.flat_cents,
      });
      const totals = await recalculateInvoiceTotals(client, invoiceId, session.accountId);

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "invoice",
        entity_id: invoiceId,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { action: "labor_rate_mode", mode: parsed.data.mode, lineItem, totals },
      });

      return { line_item: lineItem, totals, mode: parsed.data.mode };
    });

    return NextResponse.json({ data });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: err.message, traceId: session.traceId } },
        { status: 404 },
      );
    }
    if (err.code === "IMMUTABLE_ENTITY") {
      return NextResponse.json(
        { error: { code: "IMMUTABLE_ENTITY", message: err.message, traceId: session.traceId } },
        { status: 422 },
      );
    }
    if (err.code === "INVALID_INVOICE" || err.code === "NO_TRACKED_TIME" || err.code === "VALIDATION_ERROR") {
      return NextResponse.json(
        { error: { code: err.code, message: err.message, traceId: session.traceId } },
        { status: 400 },
      );
    }
    logger.error("POST /api/v1/invoices/[id]/labor-rate error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to apply labor rate", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
