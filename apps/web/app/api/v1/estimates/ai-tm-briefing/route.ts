import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractTmBriefing } from "@/lib/estimates/tm-briefing";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  briefing: z.string().min(20).max(20000),
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
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: parseResult.error.flatten(),
        },
      },
      { status: 400 }
    );
  }

  const { briefing, job_id, client_id } = parseResult.data;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "AI T&M briefing is not configured" } },
      { status: 503 }
    );
  }

  let jobContext: string | undefined;
  if (job_id || client_id) {
    try {
      const pool = getPool();
      const parts: string[] = [];

      if (job_id) {
        const { rows: jobRows } = await pool.query<{
          title: string;
          notes: string | null;
          client_id: string;
          property_id: string | null;
        }>(
          `SELECT j.title, j.notes, j.client_id, j.property_id
           FROM jobs j WHERE j.id = $1 AND j.account_id = $2`,
          [job_id, session.accountId]
        );
        if (jobRows[0]) {
          const { title, notes, property_id } = jobRows[0];
          parts.push(`Job: ${title}`);
          if (notes) parts.push(`Notes: ${notes}`);

          if (property_id) {
            const { rows: propRows } = await pool.query<{
              address: string;
              city: string | null;
              state: string | null;
            }>(
              `SELECT address, city, state FROM properties
               WHERE id = $1 AND account_id = $2`,
              [property_id, session.accountId]
            );
            if (propRows[0]) {
              const p = propRows[0];
              const loc = [p.address, p.city, p.state].filter(Boolean).join(", ");
              parts.push(`Property: ${loc}`);
            }
          }
        }
      }

      if (parts.length > 0) jobContext = parts.join("\n");
    } catch (err) {
      logger.warn("ai-tm-briefing: failed to load job context", {
        error: (err as Error).message,
      });
    }
  }

  try {
    const draft = await extractTmBriefing(briefing, jobContext);
    if (!draft) {
      return NextResponse.json(
        {
          error: {
            code: "AI_EMPTY",
            message:
              "Could not extract a T&M estimate from this briefing. Add hours, scope, and location, then try again.",
          },
        },
        { status: 422 }
      );
    }
    return NextResponse.json({ draft });
  } catch (err) {
    logger.error("ai-tm-briefing: Claude API error", err as Error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "AI_ERROR",
          message: "T&M briefing extraction failed — please try again",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
