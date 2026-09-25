import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { getPool } from "@/lib/db";
import { loadInvoicePdf } from "@/lib/pdf/load";
import { requirePortalClient } from "@/lib/portal/guard";
import { checkRateLimit, getClientIp, SENSITIVE_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const MAX_COMBINED_INVOICES = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/portal/[clientToken]/invoices-pdf?ids=a,b — TASK-161: the customer
 * picks invoices and gets one PDF. Every id must be an invoice billed to this
 * signed-in client (sponsored invoices carry the sponsor as client_id), or the
 * whole request is refused. Reading is allowed during a staff preview.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientToken: string }> },
) {
  const { clientToken } = await params;
  const guard = await requirePortalClient(clientToken, { write: false });
  if ("response" in guard) return guard.response;
  const { client } = guard;

  const rl = checkRateLimit(`portal-pdf:${getClientIp(request)}`, SENSITIVE_RATE_LIMIT);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const ids = [...new Set((request.nextUrl.searchParams.get("ids") ?? "").split(",").filter(Boolean))];
  if (ids.length === 0 || ids.length > MAX_COMBINED_INVOICES || !ids.every((id) => UUID.test(id))) {
    return NextResponse.json(
      { error: `Pick between 1 and ${MAX_COMBINED_INVOICES} invoices` },
      { status: 400 },
    );
  }

  const db = await getPool().connect();
  try {
    await db.query("BEGIN READ ONLY");
    await db.query(
      `SELECT set_config('app.current_account_id', $1, true), set_config('app.current_role', 'owner', true)`,
      [client.account_id],
    );
    const { rows } = await db.query<{ id: string }>(
      `SELECT id::text FROM invoices
       WHERE id = ANY($1::uuid[]) AND client_id = $2 AND account_id = $3 AND status <> 'draft'
       ORDER BY created_at`,
      [ids, client.id, client.account_id],
    );
    if (rows.length !== ids.length) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const merged = await PDFDocument.create();
    for (const { id } of rows) {
      const pdf = await loadInvoicePdf(db, client.account_id, id, { photos: false });
      if (!pdf) continue;
      const doc = await PDFDocument.load(pdf.bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
    }
    const bytes = await merged.save();
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Dovetails-invoices.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    logger.error("GET portal invoices-pdf failed", err);
    return NextResponse.json({ error: "Could not build the PDF" }, { status: 500 });
  } finally {
    await db.query("COMMIT").catch(() => undefined);
    db.release();
  }
}
