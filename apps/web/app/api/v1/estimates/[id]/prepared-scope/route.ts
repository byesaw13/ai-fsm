/**
 * PUT /api/v1/estimates/[id]/prepared-scope — save the owner's edits to a
 * prepared scope and, with `apply: true`, rebuild the quote from it (TASK-179).
 *
 * Apply replaces only line items the prepared scope produced (those with a
 * prepared_group_key); lines the owner added by hand are kept as they are.
 * Totals, deposit and tax go through the same update path as the edit form.
 * Draft estimates only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";
import { withEstimateContext } from "@/lib/estimates/db";
import { updateEstimateById, type LineItemInput } from "@/lib/estimates/repository";
import { applyScopeEdits, preparedScopeToLineItems } from "@/lib/estimates/prepare-quote";
import { resolveLaborRateCents } from "@/lib/estimates/tm-briefing";
import { loadPricingSettings } from "@/lib/pricing/settings";
import { parsePreparedScope } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prepared_scope: z.unknown(),
  apply: z.boolean().default(false),
});

function errorResponse(session: AuthSession, status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, traceId: session.traceId } }, { status });
}

export const PUT = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname.replace(/\/prepared-scope$/, ""));

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid request body");
  }
  const incoming = parsePreparedScope(body.prepared_scope);
  if (!incoming) return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid prepared scope");

  try {
    const result = await withEstimateContext(session, async (client) => {
      const { rows } = await client.query<{
        status: string;
        subtotal_cents: number;
        tax_cents: number;
        prepared_scope: unknown;
        property_state: string | null;
      }>(
        `SELECT e.status, e.subtotal_cents, e.tax_cents, e.prepared_scope, p.state AS property_state
         FROM estimates e
         LEFT JOIN properties p ON p.id = e.property_id
         WHERE e.id = $1 AND e.account_id = $2
         FOR UPDATE OF e`,
        [id, session.accountId],
      );
      const est = rows[0];
      if (!est) throw Object.assign(new Error("Estimate not found"), { code: "NOT_FOUND" });
      if (est.status !== "draft") {
        throw Object.assign(new Error("Only a draft quote can be changed from its prepared scope"), { code: "IMMUTABLE_ENTITY" });
      }
      const stored = parsePreparedScope(est.prepared_scope);
      if (!stored) throw Object.assign(new Error("This quote has no prepared scope"), { code: "NO_PREPARED_SCOPE" });

      const merged = applyScopeEdits(stored, incoming);
      await client.query(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(merged), id]);
      if (!body.apply) return { prepared_scope: merged, applied: false };

      const settings = await loadPricingSettings(client, session.accountId);
      const { labor_rate_cents } = resolveLaborRateCents(est.property_state, settings);
      const { lineItems, groupKeys } = preparedScopeToLineItems(merged, labor_rate_cents);

      // Lines the owner added by hand stay exactly as they are, after the prepared ones.
      const { rows: handLines } = await client.query<LineItemInput & { sort_order: number }>(
        `SELECT description, quantity::float AS quantity, unit_price_cents, line_item_type,
                visible_to_customer, adjustment_type, sort_order, price_book_id
         FROM estimate_line_items
         WHERE estimate_id = $1 AND option_id IS NULL AND prepared_group_key IS NULL
         ORDER BY sort_order`,
        [id],
      );
      const combined: LineItemInput[] = [
        ...lineItems.map((li, i) => ({
          description: li.description,
          quantity: li.quantity,
          unit_price_cents: li.unit_price_cents,
          line_item_type: li.line_item_type,
          visible_to_customer: li.visible_to_customer,
          sort_order: i,
          prepared_group_key: groupKeys[i],
        })),
        ...handLines.map((li, i) => ({ ...li, sort_order: lineItems.length + i })),
      ];
      const taxRate = est.subtotal_cents > 0 ? Math.round((est.tax_cents / est.subtotal_cents) * 10_000) / 100 : 0;
      await updateEstimateById(client, id, session, { line_items: combined, tax_rate: taxRate });
      return { prepared_scope: merged, applied: true };
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") return errorResponse(session, 404, "NOT_FOUND", err.message);
    if (err.code === "IMMUTABLE_ENTITY") return errorResponse(session, 422, "IMMUTABLE_ENTITY", err.message);
    if (err.code === "NO_PREPARED_SCOPE") return errorResponse(session, 400, "NO_PREPARED_SCOPE", err.message);
    logger.error("PUT /api/v1/estimates/[id]/prepared-scope error", error, { traceId: session.traceId, estimateId: id });
    return errorResponse(session, 500, "INTERNAL_ERROR", "Failed to save the prepared scope");
  }
});
