/**
 * PUT /api/v1/estimates/[id]/prepared-scope — save the owner's edits to a
 * prepared scope and, with `apply: true`, rebuild the quote from it (TASK-179).
 *
 * Apply replaces only line items the prepared scope produced (those with a
 * prepared_group_key); lines the owner added by hand are kept as they are.
 * Totals, deposit and tax go through the same update path as the edit form.
 * Itemized materials (TASK-187) are written to the buy list on Apply.
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
import { applyScopeEdits, buildProposalNotes, preparedScopeToLineItems } from "@/lib/estimates/prepare-quote";
import { resolveLaborRateCents } from "@/lib/estimates/tm-briefing";
import { preparedShoppingList } from "@/lib/estimates/itemize-materials";
import { loadPricingSettings } from "@/lib/pricing/settings";
import { modelPreparedProfit, parsePreparedScope } from "@ai-fsm/domain";
import { parseHourInput, storedHourSource } from "@/lib/estimates/stored-hours";

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
        notes: string | null;
        prepared_scope: unknown;
        property_state: string | null;
      }>(
        `SELECT e.status, e.subtotal_cents, e.tax_cents, e.notes, e.prepared_scope, p.state AS property_state
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
      let built;
      try {
        built = preparedScopeToLineItems(merged, labor_rate_cents);
      } catch (err) {
        throw Object.assign(err as Error, { code: "INVALID_PRICE" });
      }
      const { lineItems, groupKeys } = built;

      // Lines the owner added by hand stay exactly as they are, after the prepared ones.
      const { rows: handLines } = await client.query<
        LineItemInput & { sort_order: number; hours_low: string | number | null; hours_high: string | number | null; hours_source: string | null }
      >(
        `SELECT description, quantity::float AS quantity, unit_price_cents, unit_cost_cents, line_item_type,
                visible_to_customer, adjustment_type, sort_order, price_book_id,
                hours_low, hours_high, hours_source
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
          unit_cost_cents: li.unit_cost_cents ?? null,
          line_item_type: li.line_item_type,
          visible_to_customer: li.visible_to_customer,
          sort_order: i,
          prepared_group_key: groupKeys[i],
          hours_low: li.hours_low ?? null,
          hours_high: li.hours_high ?? null,
          hours_source: li.hours_source ?? null,
        })),
        ...handLines.map((li, i) => ({
          ...li,
          hours_low: parseHourInput(li.hours_low),
          hours_high: parseHourInput(li.hours_high),
          hours_source: storedHourSource(li.hours_source),
          sort_order: lineItems.length + i,
        })),
      ];
      const taxRate = est.subtotal_cents > 0 ? Math.round((est.tax_cents / est.subtotal_cents) * 10_000) / 100 : 0;
      await updateEstimateById(client, id, session, { line_items: combined, tax_rate: taxRate });

      // TASK-180: pricing lane, internal costs from the owner's hours (not price ÷ rate),
      // and the customer's "What's included" when notes are blank or still Apply's own text.
      const profit = modelPreparedProfit(merged, {
        laborRateCents: labor_rate_cents,
        laborCostCents: settings.labor_cost_cents_per_hour,
      });
      const notesAreOurs = !est.notes?.trim() || est.notes === stored.proposal_notes;
      const proposal = notesAreOurs ? buildProposalNotes(merged, labor_rate_cents) : null;
      const final = { ...merged, proposal_notes: proposal ?? merged.proposal_notes ?? null };
      const shopping = preparedShoppingList(merged);
      await client.query(
        `UPDATE estimates
         SET pricing_mode = $1,
             internal_labor_cost_cents = $2,
             internal_material_cost_cents = $3,
             notes = COALESCE($4, notes),
             prepared_scope = $5,
             shopping_list_json = COALESCE($7, shopping_list_json)
         WHERE id = $6`,
        [
          merged.pricing?.mode === "fixed" ? "flat_rate" : "hourly_internal",
          profit.labor_cost_cents,
          profit.materials_cents,
          proposal,
          JSON.stringify(final),
          id,
          // TASK-187: itemized materials feed the job's buy list.
          shopping ? JSON.stringify(shopping) : null,
        ],
      );
      return { prepared_scope: final, applied: true };
    });
    return NextResponse.json(result);
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") return errorResponse(session, 404, "NOT_FOUND", err.message);
    if (err.code === "IMMUTABLE_ENTITY") return errorResponse(session, 422, "IMMUTABLE_ENTITY", err.message);
    if (err.code === "NO_PREPARED_SCOPE") return errorResponse(session, 400, "NO_PREPARED_SCOPE", err.message);
    if (err.code === "INVALID_PRICE") return errorResponse(session, 400, "INVALID_PRICE", err.message);
    logger.error("PUT /api/v1/estimates/[id]/prepared-scope error", error, { traceId: session.traceId, estimateId: id });
    return errorResponse(session, 500, "INTERNAL_ERROR", "Failed to save the prepared scope");
  }
});
