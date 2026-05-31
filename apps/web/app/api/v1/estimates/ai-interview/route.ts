import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { runInterviewTurn } from "@/lib/estimates/interview-agent";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).max(40),
  job_id: z.string().uuid().optional(),
  client_id: z.string().uuid().optional(),
});

export const POST = withAuth(async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Invalid request body" } },
      { status: 400 }
    );
  }

  const parseResult = bodySchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid request body", details: parseResult.error.flatten() } },
      { status: 400 }
    );
  }

  const { messages, job_id, client_id } = parseResult.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "AI interview is not configured" } },
      { status: 503 }
    );
  }

  // Build job context (same enrichment pattern as ai-draft route)
  let jobContext: string | undefined;
  if (job_id || client_id) {
    try {
      const pool = getPool();
      const parts: string[] = [];

      if (job_id) {
        const { rows: jobRows } = await pool.query<{
          title: string; notes: string | null; client_id: string; property_id: string | null;
        }>(
          `SELECT j.title, j.notes, j.client_id, j.property_id
           FROM jobs j WHERE j.id = $1 AND j.account_id = $2`,
          [job_id, session.accountId]
        );
        if (jobRows[0]) {
          const { title, notes, client_id: jClientId, property_id } = jobRows[0];
          parts.push(`Job: ${title}`);
          if (notes) parts.push(`Notes: ${notes}`);

          if (property_id) {
            const { rows: propRows } = await pool.query<{ address: string; year_built: number | null }>(
              `SELECT address, year_built FROM properties WHERE id = $1 AND account_id = $2`,
              [property_id, session.accountId]
            );
            if (propRows[0]) {
              parts.push(`Property: ${propRows[0].address}`);
              if (propRows[0].year_built) parts.push(`Year built: ${propRows[0].year_built}`);
            }
          }

          // Recent estimates for this client
          const effectiveClientId = client_id ?? jClientId;
          const { rows: recentRows } = await pool.query<{ title: string; total_cents: number }>(
            `SELECT j.title, e.total_cents
             FROM estimates e JOIN jobs j ON j.id = e.job_id
             WHERE e.account_id = $1 AND j.client_id = $2 AND e.status IN ('approved','invoiced','sent')
             ORDER BY e.created_at DESC LIMIT 3`,
            [session.accountId, effectiveClientId]
          );
          if (recentRows.length > 0) {
            parts.push(`Prior work: ${recentRows.map(r => `${r.title} ($${(r.total_cents/100).toFixed(0)})`).join('; ')}`);
          }
        }
      }

      if (parts.length > 0) jobContext = parts.join('\n');
    } catch (err) {
      logger.warn("ai-interview: failed to load job context", { error: (err as Error).message });
    }
  }

  try {
    const result = await runInterviewTurn(messages, jobContext);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("ai-interview: Claude API error", err as Error, { traceId: session.traceId });
    return NextResponse.json(
      { error: { code: "AI_ERROR", message: "Interview failed — please try again", traceId: session.traceId } },
      { status: 500 }
    );
  }
});
