import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, withRole } from "@/lib/auth/middleware";
import { withReportContext } from "@/lib/reports/db";
import { appendAuditLog } from "@/lib/db/audit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET /api/v1/reports/period-closes?month=YYYY-MM
// Returns whether the given month is closed for the current account.
// ---------------------------------------------------------------------------

const getQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
});

export const GET = withAuth(async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = getQuerySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameter — month must be YYYY-MM",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { month } = parseResult.data;

  try {
    const row = await withReportContext(session, async (client) => {
      const result = await client.query(
        `SELECT id, account_id, period_month, closed_by, closed_at, notes
         FROM period_closes
         WHERE account_id = $1 AND period_month = $2
         LIMIT 1`,
        [session.accountId, month]
      );
      return result.rows[0] ?? null;
    });

    if (!row) {
      return NextResponse.json({ closed: false });
    }

    return NextResponse.json({ closed: true, close: row });
  } catch (error) {
    logger.error("GET /api/v1/reports/period-closes error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to fetch period close status",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/reports/period-closes
// Marks the given month as closed.  409 if already closed.
// ---------------------------------------------------------------------------

const createSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM"),
  notes: z.string().max(2000).nullable().optional(),
});

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid JSON body",
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const parseResult = createSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request body",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { month, notes } = parseResult.data;

  try {
    const close = await withReportContext(session, async (client) => {
      // Check for existing close
      const existing = await client.query(
        `SELECT id FROM period_closes WHERE account_id = $1 AND period_month = $2`,
        [session.accountId, month]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        throw Object.assign(new Error("Period already closed"), {
          code: "CONFLICT",
        });
      }

      const result = await client.query(
        `INSERT INTO period_closes (account_id, period_month, closed_by, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING id, account_id, period_month, closed_by, closed_at, notes`,
        [session.accountId, month, session.userId, notes ?? null]
      );

      const row = result.rows[0];

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "period_close",
        entity_id: row.id,
        action: "insert",
        actor_id: session.userId,
        trace_id: session.traceId,
        new_value: { period_month: month },
      });

      return row;
    });

    return NextResponse.json({ close }, { status: 201 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "CONFLICT") {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: `Period ${month} is already closed`,
            traceId: session.traceId,
          },
        },
        { status: 409 }
      );
    }
    logger.error("POST /api/v1/reports/period-closes error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to close period",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/reports/period-closes?month=YYYY-MM
// Reopens a closed month.  Owner only.  404 if not found.
// ---------------------------------------------------------------------------

export const DELETE = withRole(["owner"], async (request: NextRequest, session) => {
  const { searchParams } = new URL(request.url);
  const parseResult = getQuerySchema.safeParse({
    month: searchParams.get("month") ?? undefined,
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameter — month must be YYYY-MM",
          details: { issues: parseResult.error.issues },
          traceId: session.traceId,
        },
      },
      { status: 400 }
    );
  }

  const { month } = parseResult.data;

  try {
    await withReportContext(session, async (client) => {
      const existing = await client.query(
        `SELECT id FROM period_closes WHERE account_id = $1 AND period_month = $2`,
        [session.accountId, month]
      );
      if (!existing.rowCount || existing.rowCount === 0) {
        throw Object.assign(new Error("Period close not found"), {
          code: "NOT_FOUND",
        });
      }

      const closeId = existing.rows[0].id as string;

      await client.query(
        `DELETE FROM period_closes WHERE account_id = $1 AND period_month = $2`,
        [session.accountId, month]
      );

      await appendAuditLog(client, {
        account_id: session.accountId,
        entity_type: "period_close",
        entity_id: closeId,
        action: "delete",
        actor_id: session.userId,
        trace_id: session.traceId,
        old_value: { period_month: month },
      });
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "NOT_FOUND") {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: `No close record found for period ${month}`,
            traceId: session.traceId,
          },
        },
        { status: 404 }
      );
    }
    logger.error("DELETE /api/v1/reports/period-closes error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to reopen period",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
