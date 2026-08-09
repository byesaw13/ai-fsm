import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  supplier: z.string().trim().min(1).max(100),
  branch_label: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullable().optional(),
});

export const PUT = withAuth(async (request: NextRequest, session: AuthSession) => {
  if (session.role !== "owner" && session.role !== "admin") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Only owners and admins can change supplier preferences", traceId: session.traceId } },
      { status: 403 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid body", details: parsed.error.flatten().fieldErrors, traceId: session.traceId } },
      { status: 422 },
    );
  }

  try {
    return await withDbSession(session, async (client) => {
      const supplier = parsed.data.supplier;
      const saved = await client.query(
        `INSERT INTO account_supplier_preferences
           (account_id, supplier, supplier_normalized, branch_label, address)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (account_id, supplier_normalized) DO UPDATE
         SET supplier = EXCLUDED.supplier,
             branch_label = EXCLUDED.branch_label,
             address = EXCLUDED.address
         RETURNING supplier, supplier_normalized, branch_label, address`,
        [session.accountId, supplier, supplier.toLowerCase(), parsed.data.branch_label, parsed.data.address ?? null],
      );
      return NextResponse.json({ data: saved.rows[0] });
    });
  } catch (err) {
    logger.error("PUT /api/v1/materials/supplier-preferences", err, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Could not update supplier preference", traceId: session.traceId } },
      { status: 500 },
    );
  }
});
