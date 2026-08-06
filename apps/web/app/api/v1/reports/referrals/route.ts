/**
 * GET /api/v1/reports/referrals?month=YYYY-MM
 * Owner/admin — lead source / referral ROI from booking_requests + linked invoices.
 * TASK-017 thin ship: group by referral_source; revenue via job_id → invoices.
 */
import { NextRequest, NextResponse } from "next/server";
import {
  buildReferralRoiRow,
  sortReferralRoiRows,
  type ReferralRoiRow,
} from "@ai-fsm/domain";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type AggRow = {
  source: string | null;
  request_count: string;
  job_count: string;
  revenue_cents: string;
  paid_cents: string;
};

export const GET = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  try {
    const { searchParams } = new URL(request.url);
    const month = (searchParams.get("month") ?? "").trim();
    const targetMonth =
      month && /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);

    // Requests created in month; invoice revenue for jobs linked to those requests
    // (all invoice statuses except void — same spirit as profitability report).
    const rows = await query<AggRow>(
      `SELECT
         br.referral_source AS source,
         COUNT(DISTINCT br.id)::int AS request_count,
         COUNT(DISTINCT br.job_id)::int AS job_count,
         COALESCE(SUM(i.total_cents), 0)::bigint AS revenue_cents,
         COALESCE(SUM(i.paid_cents), 0)::bigint AS paid_cents
       FROM booking_requests br
       LEFT JOIN invoices i
         ON i.job_id = br.job_id
        AND i.account_id = br.account_id
        AND i.status IS DISTINCT FROM 'void'
       WHERE br.account_id = $1
         AND to_char(br.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = $2
       GROUP BY br.referral_source
       ORDER BY paid_cents DESC NULLS LAST`,
      [session.accountId, targetMonth],
    );

    const sources: ReferralRoiRow[] = sortReferralRoiRows(
      rows.map((r) =>
        buildReferralRoiRow({
          source: r.source,
          request_count: Number(r.request_count),
          job_count: Number(r.job_count),
          revenue_cents: Number(r.revenue_cents),
          paid_cents: Number(r.paid_cents),
        }),
      ),
    );

    const totals = sources.reduce(
      (acc, s) => ({
        request_count: acc.request_count + s.request_count,
        job_count: acc.job_count + s.job_count,
        revenue_cents: acc.revenue_cents + s.revenue_cents,
        paid_cents: acc.paid_cents + s.paid_cents,
      }),
      { request_count: 0, job_count: 0, revenue_cents: 0, paid_cents: 0 },
    );

    // Realtor referrer breakdown (name/brokerage) for the same month
    const referrerRows = await query<{
      referral_name: string | null;
      brokerage_name: string | null;
      request_count: string;
      job_count: string;
      paid_cents: string;
    }>(
      `SELECT
         br.referral_name,
         br.brokerage_name,
         COUNT(DISTINCT br.id)::int AS request_count,
         COUNT(DISTINCT br.job_id)::int AS job_count,
         COALESCE(SUM(i.paid_cents), 0)::bigint AS paid_cents
       FROM booking_requests br
       LEFT JOIN invoices i
         ON i.job_id = br.job_id
        AND i.account_id = br.account_id
        AND i.status IS DISTINCT FROM 'void'
       WHERE br.account_id = $1
         AND br.referral_source = 'realtor'
         AND to_char(br.created_at AT TIME ZONE 'UTC', 'YYYY-MM') = $2
       GROUP BY br.referral_name, br.brokerage_name
       ORDER BY paid_cents DESC NULLS LAST
       LIMIT 50`,
      [session.accountId, targetMonth],
    );

    return NextResponse.json({
      data: {
        month: targetMonth,
        sources,
        totals,
        realtor_referrers: referrerRows.map((r) => ({
          referral_name: r.referral_name,
          brokerage_name: r.brokerage_name,
          request_count: Number(r.request_count),
          job_count: Number(r.job_count),
          paid_cents: Number(r.paid_cents),
        })),
      },
    });
  } catch (error) {
    logger.error("GET /api/v1/reports/referrals error", error, { traceId: session.traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to load referral report",
          traceId: session.traceId,
        },
      },
      { status: 500 },
    );
  }
});
