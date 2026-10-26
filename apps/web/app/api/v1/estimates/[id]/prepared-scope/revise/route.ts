/**
 * POST /api/v1/estimates/[id]/prepared-scope/revise — Revise with a note (TASK-186).
 *
 * Without `accept`: saves the owner's current edits and answers, asks the model
 * for changes from the answers and the instruction, and returns the proposal
 * (not saved) with each change and its reason. With `accept`: re-applies that
 * proposal's changes to the saved scope and saves the result, with the note in
 * the revision log. The quote's lines change only when the owner presses Apply.
 * Draft estimates only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { logger } from "@/lib/logger";
import { getPathId } from "@/lib/route-utils";
import { withEstimateContext } from "@/lib/estimates/db";
import { loadAssessmentSummary } from "@/lib/estimates/assessment-summary-loader";
import { applyScopeEdits } from "@/lib/estimates/prepare-quote";
import { loadPreparationInputs } from "@/lib/estimates/preparation-inputs";
import { describeAiFailure } from "@/lib/estimates/ai-failure";
import {
  MAX_REVISION_INSTRUCTION,
  applyRevision,
  extractRevision,
  recordRevision,
  revisionOutputSchema,
} from "@/lib/estimates/revise-quote";
import { parsePreparedScope, type PreparedScope } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  prepared_scope: z.unknown(),
  instruction: z.string().max(MAX_REVISION_INSTRUCTION).default(""),
  accept: z.object({ output: z.unknown() }).optional(),
});

function errorResponse(session: AuthSession, status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message, traceId: session.traceId } }, { status });
}

function fail(code: string, message: string): never {
  throw Object.assign(new Error(message), { code });
}

/** Lock the draft, merge the owner's edits, and hand back the merged scope. */
async function mergeEdits(
  client: { query: <T>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }> },
  session: AuthSession,
  id: string,
  incoming: PreparedScope,
): Promise<PreparedScope> {
  const { rows } = await client.query<{ status: string; prepared_scope: unknown }>(
    `SELECT status, prepared_scope FROM estimates WHERE id = $1 AND account_id = $2 FOR UPDATE`,
    [id, session.accountId],
  );
  const est = rows[0];
  if (!est) fail("NOT_FOUND", "Estimate not found");
  if (est.status !== "draft") fail("IMMUTABLE_ENTITY", "Only a draft quote can be revised");
  const stored = parsePreparedScope(est.prepared_scope);
  if (!stored) fail("NO_PREPARED_SCOPE", "This quote has no prepared scope");
  return applyScopeEdits(stored, incoming);
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  const id = getPathId(request.nextUrl.pathname.replace(/\/prepared-scope\/revise$/, ""));

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid request body");
  }
  const incoming = parsePreparedScope(body.prepared_scope);
  if (!incoming) return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid prepared scope");
  const instruction = body.instruction.trim();

  try {
    const summary = await loadAssessmentSummary(session, incoming.source.visit_id);
    if (!summary) return errorResponse(session, 400, "NO_ASSESSMENT", "The assessment this quote came from is gone");

    if (body.accept) {
      const parsed = revisionOutputSchema.safeParse(body.accept.output);
      if (!parsed.success) return errorResponse(session, 400, "VALIDATION_ERROR", "Invalid revision");
      const saved = await withEstimateContext(session, async (client) => {
        const merged = await mergeEdits(client, session, id, incoming);
        const inputs = await loadPreparationInputs(client);
        const revised = applyRevision(merged, parsed.data, { summary, ...inputs }).scope;
        const final = recordRevision(revised, instruction, parsed.data.summary, new Date().toISOString());
        await client.query(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(final), id]);
        return final;
      });
      return NextResponse.json({ prepared_scope: saved });
    }

    // Save the edits and answers first so nothing typed is lost if the model fails.
    const { merged, inputs } = await withEstimateContext(session, async (client) => {
      const merged = await mergeEdits(client, session, id, incoming);
      await client.query(`UPDATE estimates SET prepared_scope = $1 WHERE id = $2`, [JSON.stringify(merged), id]);
      return { merged, inputs: await loadPreparationInputs(client) };
    });
    if (!instruction && !merged.questions.some((q) => q.answer)) {
      return errorResponse(session, 400, "VALIDATION_ERROR", "Answer a question or say what to change");
    }

    let output;
    let failure: unknown = null;
    try {
      output = await extractRevision(merged, summary, instruction);
    } catch (err) {
      failure = err;
      output = null;
    }
    if (!output) {
      const reason = describeAiFailure(failure);
      logger.warn("revise-quote: AI revision failed", { estimateId: id, code: reason.code, error: (failure as Error | null)?.message });
      return errorResponse(session, 503, reason.code, `${reason.message} Your edits and answers are saved.`);
    }
    const proposal = applyRevision(merged, output, { summary, ...inputs });
    return NextResponse.json({
      prepared_scope: merged,
      proposed_scope: proposal.scope,
      changes: proposal.changes,
      summary: output.summary,
      output,
    });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") return errorResponse(session, 404, "NOT_FOUND", err.message);
    if (err.code === "IMMUTABLE_ENTITY") return errorResponse(session, 422, "IMMUTABLE_ENTITY", err.message);
    if (err.code === "NO_PREPARED_SCOPE") return errorResponse(session, 400, "NO_PREPARED_SCOPE", err.message);
    logger.error("POST /api/v1/estimates/[id]/prepared-scope/revise error", error, { traceId: session.traceId, estimateId: id });
    return errorResponse(session, 500, "INTERNAL_ERROR", "Failed to revise the prepared scope");
  }
});
