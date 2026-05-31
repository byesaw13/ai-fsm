import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { getPool } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/reports/referrals
 *
 * Returns referral metrics grouped by referral_source, then by realtor/brokerage.
 * Joins booking_requests → jobs → estimates to compute revenue metrics.
 */
export const GET = withRole(["owner", "admin"], async (_request, session) => {
  const pool = getPool();

  // Source-level summary
  const { rows: sourceRows } = await pool.query<{
    referral_source: string;
    total_leads: string;
    converted_to_job: string;
    total_revenue_cents: string;
  }>(
    `SELECT
       COALESCE(br.referral_source, 'unknown') AS referral_source,
       COUNT(DISTINCT br.id)::text AS total_leads,
       COUNT(DISTINCT br.job_id) FILTER (WHERE br.job_id IS NOT NULL)::text AS converted_to_job,
       COALESCE(SUM(e.total_cents) FILTER (WHERE e.status IN ('approved', 'invoiced')), 0)::text AS total_revenue_cents
     FROM booking_requests br
     LEFT JOIN jobs j ON j.id = br.job_id AND j.account_id = br.account_id
     LEFT JOIN estimates e ON e.job_id = j.id AND e.account_id = br.account_id
     WHERE br.account_id = $1
     GROUP BY COALESCE(br.referral_source, 'unknown')
     ORDER BY COUNT(DISTINCT br.id) DESC`,
    [session.accountId]
  );

  // Realtor-level detail (only when referral_source = 'realtor')
  const { rows: realtorRows } = await pool.query<{
    referral_name: string | null;
    brokerage_name: string | null;
    total_leads: string;
    converted_to_job: string;
    won_estimates: string;
    total_revenue_cents: string;
    avg_job_size_cents: string;
  }>(
    `SELECT
       br.referral_name,
       br.brokerage_name,
       COUNT(DISTINCT br.id)::text AS total_leads,
       COUNT(DISTINCT br.job_id) FILTER (WHERE br.job_id IS NOT NULL)::text AS converted_to_job,
       COUNT(DISTINCT e.id) FILTER (WHERE e.status IN ('approved', 'invoiced'))::text AS won_estimates,
       COALESCE(SUM(e.total_cents) FILTER (WHERE e.status IN ('approved', 'invoiced')), 0)::text AS total_revenue_cents,
       COALESCE(
         AVG(e.total_cents) FILTER (WHERE e.status IN ('approved', 'invoiced')),
         0
       )::text AS avg_job_size_cents
     FROM booking_requests br
     LEFT JOIN jobs j ON j.id = br.job_id AND j.account_id = br.account_id
     LEFT JOIN estimates e ON e.job_id = j.id AND e.account_id = br.account_id
     WHERE br.account_id = $1
       AND br.referral_source = 'realtor'
     GROUP BY br.referral_name, br.brokerage_name
     ORDER BY SUM(e.total_cents) FILTER (WHERE e.status IN ('approved', 'invoiced')) DESC NULLS LAST`,
    [session.accountId]
  );

  return NextResponse.json({
    by_source: sourceRows.map((r) => ({
      referral_source: r.referral_source,
      total_leads: Number(r.total_leads),
      converted_to_job: Number(r.converted_to_job),
      total_revenue_cents: Number(r.total_revenue_cents),
    })),
    realtors: realtorRows.map((r) => ({
      referral_name: r.referral_name,
      brokerage_name: r.brokerage_name,
      total_leads: Number(r.total_leads),
      converted_to_job: Number(r.converted_to_job),
      won_estimates: Number(r.won_estimates),
      total_revenue_cents: Number(r.total_revenue_cents),
      avg_job_size_cents: Math.round(Number(r.avg_job_size_cents)),
    })),
  });
});
