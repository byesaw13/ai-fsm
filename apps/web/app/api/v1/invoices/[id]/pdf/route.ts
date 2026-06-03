import { NextResponse, type NextRequest } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import { withInvoiceContext } from "@/lib/invoices/db";
import { loadInvoicePdf } from "@/lib/pdf/load";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, session) => {
  const id = request.nextUrl.pathname.split("/").at(-2)!;
  try {
    const pdf = await withInvoiceContext(session, (client) =>
      loadInvoicePdf(client, session.accountId, id),
    );
    if (!pdf) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Invoice not found" } },
        { status: 404 },
      );
    }
    return new NextResponse(Buffer.from(pdf.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${pdf.filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/invoices/[id]/pdf error", error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Failed to render invoice PDF" } },
      { status: 500 },
    );
  }
});
