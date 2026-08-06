import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  buildReferralRoiRow,
  sortReferralRoiRows,
  type ReferralRoiRow,
} from "@ai-fsm/domain";
import { getSession } from "@/lib/auth/session";
import { canViewReports } from "@/lib/auth/permissions";
import {
  EmptyState,
  FilterBar,
  PageContainer,
  PageHeader,
  HubSubnav,
} from "@/components/ui";
import type { FilterDef } from "@/components/ui";
import { MONEY_HUB_LINKS } from "@/lib/navigation/hubs";
import { query } from "@/lib/db";
import { formatCents } from "../format";

export const dynamic = "force-dynamic";

const FILTERS: FilterDef[] = [
  { name: "month", type: "text", label: "Month", placeholder: "2026-08" },
];

interface PageProps {
  searchParams: Promise<{ month?: string }>;
}

type AggRow = {
  source: string | null;
  request_count: string;
  job_count: string;
  revenue_cents: string;
  paid_cents: string;
};

export default async function ReferralRoiPage({ searchParams }: PageProps) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!canViewReports(session.role)) redirect("/app");

  const { month } = await searchParams;
  const today = new Date().toISOString().slice(0, 7);
  const targetMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : today;

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
     GROUP BY br.referral_source`,
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

  const realtorRows = await query<{
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

  const currentValues: Record<string, string> = {};
  if (month) currentValues.month = month;

  const [year, mon] = targetMonth.split("-");
  const monthLabel = new Date(parseInt(year, 10), parseInt(mon, 10) - 1, 1).toLocaleDateString(
    undefined,
    { year: "numeric", month: "long" },
  );

  const totalPaid = sources.reduce((s, r) => s + r.paid_cents, 0);
  const totalRequests = sources.reduce((s, r) => s + r.request_count, 0);

  return (
    <PageContainer>
      <PageHeader
        title="Lead source / referral ROI"
        subtitle={monthLabel}
        actions={
          <Link href={"/app/reports" as Route} style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>
            ← Profitability
          </Link>
        }
      />
      <HubSubnav hub="Money" links={MONEY_HUB_LINKS} pathname="/app/reports/referrals" />

      <div style={{ marginBottom: "var(--space-4)" }}>
        <FilterBar filters={FILTERS} baseHref="/app/reports/referrals" currentValues={currentValues} />
      </div>

      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-4)" }}>
        Booking requests created in this month, grouped by how the client found Dovetails.
        Revenue is invoices linked via the request&apos;s job (void invoices excluded).
      </p>

      {sources.length === 0 || totalRequests === 0 ? (
        <EmptyState
          title="No booking requests this month"
          description="When clients book online with a lead source, totals show up here."
        />
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--space-3)",
              marginBottom: "var(--space-4)",
            }}
          >
            <div className="p7-card" style={{ padding: "var(--space-3)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Requests</div>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }} data-testid="referral-total-requests">
                {totalRequests}
              </div>
            </div>
            <div className="p7-card" style={{ padding: "var(--space-3)" }}>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Paid revenue</div>
              <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }} data-testid="referral-total-paid">
                {formatCents(totalPaid)}
              </div>
            </div>
          </div>

          <div className="p7-card" style={{ overflowX: "auto", marginBottom: "var(--space-5)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }} data-testid="referral-roi-table">
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                  <th style={{ padding: "var(--space-2)" }}>Source</th>
                  <th style={{ padding: "var(--space-2)" }}>Requests</th>
                  <th style={{ padding: "var(--space-2)" }}>Jobs</th>
                  <th style={{ padding: "var(--space-2)" }}>Convert</th>
                  <th style={{ padding: "var(--space-2)" }}>Invoiced</th>
                  <th style={{ padding: "var(--space-2)" }}>Paid</th>
                  <th style={{ padding: "var(--space-2)" }}>$ / job</th>
                </tr>
              </thead>
              <tbody>
                {sources.map((row) => (
                  <tr key={row.source} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "var(--space-2)", fontWeight: 600 }}>{row.label}</td>
                    <td style={{ padding: "var(--space-2)" }}>{row.request_count}</td>
                    <td style={{ padding: "var(--space-2)" }}>{row.job_count}</td>
                    <td style={{ padding: "var(--space-2)" }}>
                      {row.conversion_rate == null ? "—" : `${Math.round(row.conversion_rate * 100)}%`}
                    </td>
                    <td style={{ padding: "var(--space-2)" }}>{formatCents(row.revenue_cents)}</td>
                    <td style={{ padding: "var(--space-2)" }}>{formatCents(row.paid_cents)}</td>
                    <td style={{ padding: "var(--space-2)" }}>
                      {row.paid_per_job_cents == null ? "—" : formatCents(row.paid_per_job_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {realtorRows.length > 0 && (
            <section>
              <h2 style={{ fontSize: "var(--text-base)", fontWeight: 700, marginBottom: "var(--space-2)" }}>
                Realtor referrers
              </h2>
              <div className="p7-card" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
                  <thead>
                    <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "var(--space-2)" }}>Name</th>
                      <th style={{ padding: "var(--space-2)" }}>Brokerage</th>
                      <th style={{ padding: "var(--space-2)" }}>Requests</th>
                      <th style={{ padding: "var(--space-2)" }}>Jobs</th>
                      <th style={{ padding: "var(--space-2)" }}>Paid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {realtorRows.map((r, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "var(--space-2)" }}>{r.referral_name?.trim() || "—"}</td>
                        <td style={{ padding: "var(--space-2)" }}>{r.brokerage_name?.trim() || "—"}</td>
                        <td style={{ padding: "var(--space-2)" }}>{Number(r.request_count)}</td>
                        <td style={{ padding: "var(--space-2)" }}>{Number(r.job_count)}</td>
                        <td style={{ padding: "var(--space-2)" }}>{formatCents(Number(r.paid_cents))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </PageContainer>
  );
}
