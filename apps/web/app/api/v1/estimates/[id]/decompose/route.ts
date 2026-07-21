import { NextRequest, NextResponse } from "next/server";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { decomposeIntoTasks, TaskDecompositionError } from "@/lib/estimates/task-decomposer";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

function idFromPath(req: NextRequest): string | undefined {
  return req.nextUrl.pathname.split("/").at(-2); // .../estimates/<id>/decompose
}

/**
 * POST /api/v1/estimates/[id]/decompose — AI proposes a work breakdown
 * (work orders + task checklists) from the estimate scope. Read-only: writes
 * nothing. The owner reviews and applies via .../decompose/apply.
 */
export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = idFromPath(request);
  if (!id) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } }, { status: 404 });
  }

  try {
    const input = await withEstimateContext(session, async (client) => {
      const est = await client.query<{ scope_assumptions: string | null; notes: string | null; room_specs: unknown }>(
        `SELECT scope_assumptions, notes, room_specs FROM estimates WHERE id = $1 AND account_id = $2`,
        [id, session.accountId],
      );
      if (est.rowCount === 0) return null;
      const row = est.rows[0];

      const labor = await client.query<{ description: string }>(
        `SELECT description FROM estimate_line_items
          WHERE estimate_id = $1 AND line_item_type = 'labor' AND visible_to_customer = true
          ORDER BY sort_order ASC`,
        [id],
      );

      const rooms = Array.isArray(row.room_specs)
        ? (row.room_specs as Array<Record<string, unknown>>).map((r) => ({
            name: String(r.name ?? r.room ?? "Area"),
            notes: (r.notes ?? null) as string | null,
          }))
        : [];

      return {
        scope: [row.scope_assumptions, row.notes].filter(Boolean).join("\n").trim(),
        rooms,
        laborLines: labor.rows.map((l) => l.description).filter(Boolean),
      };
    });

    if (!input) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Estimate not found", traceId: session.traceId } }, { status: 404 });
    }

    const draft = await decomposeIntoTasks(input);
    return NextResponse.json({ data: { draft } });
  } catch (error) {
    if (error instanceof TaskDecompositionError) {
      return NextResponse.json({ error: { code: error.code, message: error.message, traceId: session.traceId } }, { status: error.httpStatus });
    }
    logger.error("POST /api/v1/estimates/[id]/decompose error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Could not propose a breakdown", traceId: session.traceId } }, { status: 500 });
  }
});
