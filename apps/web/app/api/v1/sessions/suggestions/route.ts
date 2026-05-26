import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// Returns candidate activities (jobs, visits, estimates) for a given date.
// Used by the new session form to suggest what happened during the day.
export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: { message: "date param required (YYYY-MM-DD)" } }, { status: 400 });
  }

  try {
    const [jobs, visits, estimates] = await Promise.all([
      query<{ id: string; title: string }>(
        `SELECT id, title FROM jobs
         WHERE account_id = $1
           AND status IN ('scheduled', 'in_progress', 'completed')
           AND EXISTS (
             SELECT 1 FROM visits v
             WHERE v.job_id = jobs.id AND v.scheduled_start::date = $2::date AND v.account_id = $1
           )
         ORDER BY title
         LIMIT 20`,
        [session.accountId, date]
      ),
      query<{ id: string; title: string | null; job_title: string | null; scheduled_start: string | null }>(
        `SELECT v.id, v.title, j.title AS job_title, v.scheduled_start::text
         FROM visits v
         LEFT JOIN jobs j ON j.id = v.job_id
         WHERE v.account_id = $1
           AND v.scheduled_start::date = $2::date
           AND v.status IN ('scheduled', 'arrived', 'in_progress', 'completed')
         ORDER BY v.scheduled_start
         LIMIT 20`,
        [session.accountId, date]
      ),
      query<{ id: string; id_short: string; client_name: string | null }>(
        `SELECT e.id, e.id_short, c.name AS client_name
         FROM estimates e
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE e.account_id = $1
           AND e.created_at::date = $2::date
         ORDER BY e.created_at DESC
         LIMIT 10`,
        [session.accountId, date]
      ),
    ]);

    return NextResponse.json({
      data: {
        jobs:      jobs.map(j => ({ entity_type: "job",      entity_id: j.id, label: j.title })),
        visits:    visits.map(v => ({ entity_type: "visit",   entity_id: v.id, label: v.title ?? v.job_title ?? v.id.slice(0, 8) })),
        estimates: estimates.map(e => ({ entity_type: "estimate", entity_id: e.id, label: e.client_name ?? e.id_short })),
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/sessions/suggestions error", error, { traceId: session.traceId });
    return NextResponse.json({ error: { message: "Failed to load suggestions" } }, { status: 500 });
  }
});
