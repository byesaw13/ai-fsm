/**
 * PATCH /api/v1/production-rates/modifiers/[id]: change a modifier's percentage or calibration
 * (TASK-193). Owner and admin only. Saved quotes keep the hours they have.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { appendAuditLog } from "@/lib/db/audit";
import { updateProductionRateModifier } from "@/lib/db/production-rates";
import { getPathId } from "@/lib/route-utils";

export const dynamic = "force-dynamic";

const body = z
  .object({ modifier_pct: z.number().gt(-1).lt(5).optional(), calibrated: z.boolean().optional() })
  .refine((b) => b.modifier_pct !== undefined || b.calibrated !== undefined, "Nothing to change");

export const PATCH = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname);
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid modifier change", traceId: session.traceId } }, { status: 400 });
  }
  const result = await withEstimateContext(session, async (client) => {
    const changed = await updateProductionRateModifier(client, id, parsed.data);
    if (changed) {
      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "production_rate_modifier",
        entity_id: id,
        action: "update",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: changed.before,
        new_value: changed.after,
      });
    }
    return changed;
  });
  if (!result) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Modifier not found", traceId: session.traceId } }, { status: 404 });
  }
  return NextResponse.json({ data: result.after });
});
