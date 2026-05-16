import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query } from "@/lib/db";
import {
  Card,
  EmptyState,
  MetricGrid,
  PageContainer,
  PageHeader,
  SectionHeader,
} from "@/components/ui";
import type { MetricCardData } from "@/components/ui";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PlanSummaryRow = {
  count: string;
  arr_cents: string;
  essential_count: string;
  plus_count: string;
  premier_count: string;
};

type VaultRow = {
  plan_id: string;
  plan_name: string;
  client_name: string;
  membership_tier: string;
  property_address: string | null;
  covered_count: string;
  completeness_pct: string;
};

type CapRow = {
  visit_id: string;
  plan_id: string;
  plan_name: string;
  client_name: string;
  membership_tier: string;
  membership_cap_status: string;
  included_labor_minutes: string;
  scheduled_start: string | null;
};

type RenewalRow = {
  plan_id: string;
  plan_name: string;
  client_name: string;
  membership_tier: string;
  annual_price_cents: string;
  renewal_date: string;
};

type BaselineRow = {
  visit_id: string;
  client_name: string;
  scheduled_start: string;
  converted: boolean;
  converted_plan_name: string | null;
  converted_plan_tier: string | null;
};

type BaselineSummaryRow = {
  total: string;
  converted: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number | string): string {
  return `$${(Number(cents) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function completenessColor(pct: number): string {
  if (pct >= 67) return "#16a34a";
  if (pct >= 34) return "#d97706";
  return "#dc2626";
}

function completenessLabel(pct: number): string {
  if (pct >= 67) return "Good";
  if (pct >= 34) return "Partial";
  return "Low";
}

function renewalBadge(renewalDate: string): { label: string; bg: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(renewalDate);
  const daysOut = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (daysOut < 0)  return { label: "Overdue",     bg: "#fee2e2", color: "#dc2626" };
  if (daysOut <= 30) return { label: `${daysOut}d`, bg: "#fef3c7", color: "#d97706" };
  return               { label: `${daysOut}d`,      bg: "#dbeafe", color: "#2563eb" };
}

const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  plus: "Plus",
  premier: "Premier",
};

const CAP_LABELS: Record<string, string> = {
  cap_reached: "Cap Reached",
  approval_required: "Approval Required",
};

// 6 target categories from domain
const TARGET_COUNT = 6;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MembershipDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;

  const [
    planSummary,
    vaultRows,
    capRows,
    renewalRows,
    baselineSummary,
    baselineRows,
  ] = await Promise.all([

    // Active membership summary
    query<PlanSummaryRow>(
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(annual_price_cents), 0)::text AS arr_cents,
         COUNT(*) FILTER (WHERE membership_tier = 'essential')::text AS essential_count,
         COUNT(*) FILTER (WHERE membership_tier = 'plus')::text       AS plus_count,
         COUNT(*) FILTER (WHERE membership_tier = 'premier')::text    AS premier_count
       FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'`,
      [accountId]
    ),

    // Vault completeness per active plan (sorted lowest first)
    query<VaultRow>(
      `SELECT
         mp.id AS plan_id,
         mp.name AS plan_name,
         c.name AS client_name,
         mp.membership_tier,
         p.address AS property_address,
         COALESCE(
           COUNT(DISTINCT pvi.category) FILTER (
             WHERE pvi.category IN ('mechanical','appliance','filter','paint_finish','monitor','vendor')
           ), 0
         )::text AS covered_count,
         ROUND(
           COALESCE(
             COUNT(DISTINCT pvi.category) FILTER (
               WHERE pvi.category IN ('mechanical','appliance','filter','paint_finish','monitor','vendor')
             ), 0
           )::numeric / $2 * 100
         )::text AS completeness_pct
       FROM maintenance_plans mp
       JOIN clients c ON mp.client_id = c.id
       LEFT JOIN properties p ON mp.property_id = p.id
       LEFT JOIN property_vault_items pvi
         ON pvi.property_id = p.id AND pvi.account_id = mp.account_id
       WHERE mp.account_id = $1 AND mp.status = 'active'
       GROUP BY mp.id, mp.name, c.name, mp.membership_tier, p.address
       ORDER BY completeness_pct::numeric ASC, c.name ASC`,
      [accountId, TARGET_COUNT]
    ),

    // Active membership visits at/over labor cap
    query<CapRow>(
      `SELECT
         v.id AS visit_id,
         mp.id AS plan_id,
         mp.name AS plan_name,
         c.name AS client_name,
         mp.membership_tier,
         v.membership_cap_status,
         mp.included_labor_minutes_per_visit::text AS included_labor_minutes,
         v.scheduled_start::text AS scheduled_start
       FROM visits v
       JOIN maintenance_plans mp ON mp.id = v.generated_from_plan_id
       JOIN jobs j ON j.id = v.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE v.account_id = $1
         AND v.generated_from_plan_id IS NOT NULL
         AND v.membership_cap_status IN ('cap_reached','approval_required')
         AND v.status NOT IN ('completed','cancelled')
       ORDER BY v.scheduled_start ASC
       LIMIT 20`,
      [accountId]
    ),

    // Upcoming renewals — overdue + within 60 days
    query<RenewalRow>(
      `SELECT
         mp.id AS plan_id,
         mp.name AS plan_name,
         c.name AS client_name,
         mp.membership_tier,
         mp.annual_price_cents::text,
         mp.renewal_date::text AS renewal_date
       FROM maintenance_plans mp
       JOIN clients c ON mp.client_id = c.id
       WHERE mp.account_id = $1
         AND mp.status = 'active'
         AND mp.renewal_date IS NOT NULL
         AND mp.renewal_date <= CURRENT_DATE + INTERVAL '60 days'
       ORDER BY mp.renewal_date ASC
       LIMIT 20`,
      [accountId]
    ),

    // Realtor baseline conversion summary
    query<BaselineSummaryRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE mp.id IS NOT NULL)::text AS converted
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       LEFT JOIN LATERAL (
         SELECT id FROM maintenance_plans
         WHERE client_id = j.client_id
           AND account_id = $1
           AND status = 'active'
           AND created_at > v.scheduled_start
         LIMIT 1
       ) mp ON true
       WHERE v.account_id = $1
         AND v.visit_type = 'realtor_baseline'
         AND v.status = 'completed'`,
      [accountId]
    ),

    // Realtor baseline conversion detail (most recent 20)
    query<BaselineRow>(
      `SELECT
         v.id AS visit_id,
         c.name AS client_name,
         v.scheduled_start::text AS scheduled_start,
         (mp.id IS NOT NULL) AS converted,
         mp.plan_name AS converted_plan_name,
         mp.membership_tier AS converted_plan_tier
       FROM visits v
       JOIN jobs j ON j.id = v.job_id
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN LATERAL (
         SELECT id, name AS plan_name, membership_tier
         FROM maintenance_plans
         WHERE client_id = j.client_id
           AND account_id = $1
           AND status = 'active'
           AND created_at > v.scheduled_start
         ORDER BY created_at ASC
         LIMIT 1
       ) mp ON true
       WHERE v.account_id = $1
         AND v.visit_type = 'realtor_baseline'
         AND v.status = 'completed'
       ORDER BY v.scheduled_start DESC
       LIMIT 20`,
      [accountId]
    ),
  ]);

  // -- Derived values --------------------------------------------------------

  const summary = planSummary[0] ?? {
    count: "0", arr_cents: "0",
    essential_count: "0", plus_count: "0", premier_count: "0",
  };
  const activeMembers = parseInt(summary.count, 10);
  const arrCents = parseInt(summary.arr_cents, 10);

  const avgCompleteness = vaultRows.length > 0
    ? Math.round(vaultRows.reduce((sum, r) => sum + parseInt(r.completeness_pct, 10), 0) / vaultRows.length)
    : 0;

  const bSummary = baselineSummary[0] ?? { total: "0", converted: "0" };
  const totalBaselines = parseInt(bSummary.total, 10);
  const convertedBaselines = parseInt(bSummary.converted, 10);
  const conversionRate = totalBaselines > 0
    ? Math.round((convertedBaselines / totalBaselines) * 100)
    : 0;

  const renewalAlertCount = renewalRows.filter((r) => {
    const daysOut = Math.round(
      (new Date(r.renewal_date).getTime() - Date.now()) / 86_400_000
    );
    return daysOut <= 30;
  }).length;

  // -- Metrics ---------------------------------------------------------------

  const metrics: MetricCardData[] = [
    {
      label: "Active Members",
      value: activeMembers,
      sub: `${summary.essential_count}E · ${summary.plus_count}P · ${summary.premier_count}Pr`,
      href: "/app/maintenance-plans",
      variant: "default",
    },
    {
      label: "Annual Run Rate",
      value: fmt(arrCents),
      sub: "Active memberships",
      href: "/app/maintenance-plans",
      variant: "default",
    },
    {
      label: "Renewing ≤30 Days",
      value: renewalAlertCount,
      sub: `${renewalRows.length} within 60 days`,
      href: "#renewals",
      variant: renewalAlertCount > 0 ? "alert" : "default",
    },
    {
      label: "Avg Vault Completeness",
      value: `${avgCompleteness}%`,
      sub: `${TARGET_COUNT} target categories`,
      href: "#vault",
      variant: avgCompleteness < 50 ? "alert" : avgCompleteness < 80 ? "default" : "success",
    },
    {
      label: "Cap Overruns",
      value: capRows.length,
      sub: "Active visits at/over cap",
      href: "#cap",
      variant: capRows.length > 0 ? "alert" : "default",
    },
    {
      label: "Realtor Conversion",
      value: totalBaselines > 0 ? `${conversionRate}%` : "—",
      sub: totalBaselines > 0 ? `${convertedBaselines} of ${totalBaselines} baselines` : "No completed baselines",
      href: "#baselines",
      variant: "default",
    },
  ];

  // -- Table styles ----------------------------------------------------------

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "var(--space-2) var(--space-3)",
    color: "var(--fg-muted)",
    fontWeight: 500,
    fontSize: "var(--text-sm)",
    borderBottom: "1px solid var(--border)",
  };
  const td: React.CSSProperties = {
    padding: "var(--space-2) var(--space-3)",
    fontSize: "var(--text-sm)",
    verticalAlign: "middle",
  };

  // --------------------------------------------------------------------------

  return (
    <PageContainer>
      <PageHeader
        title="Membership Dashboard"
        subtitle="Vault health, renewals, cap status, and realtor conversion"
      />

      <MetricGrid metrics={metrics} />

      {/* ── Vault Completeness ─────────────────────────────────────────────── */}
      <Card id="vault" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Vault Completeness" count={vaultRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active memberships sorted by vault completeness (lowest first). Target: all 6 core categories documented.
        </p>
        {vaultRows.length === 0 ? (
          <EmptyState title="No active memberships" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Property</th>
                  <th style={{ ...th, textAlign: "center" }}>Score</th>
                  <th style={{ ...th, textAlign: "center" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {vaultRows.map((row) => {
                  const pct = parseInt(row.completeness_pct, 10);
                  const covered = parseInt(row.covered_count, 10);
                  const color = completenessColor(pct);
                  return (
                    <tr key={row.plan_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link
                          href={`/app/maintenance-plans/${row.plan_id}` as Route}
                          style={{ color: "var(--fg-link)", textDecoration: "none" }}
                        >
                          {row.plan_name}
                        </Link>
                      </td>
                      <td style={td}>{TIER_LABELS[row.membership_tier] ?? row.membership_tier}</td>
                      <td style={{ ...td, color: "var(--fg-muted)" }}>{row.property_address ?? "—"}</td>
                      <td style={{ ...td, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 600, color }}>
                        {covered}/{TARGET_COUNT}
                      </td>
                      <td style={{ ...td, textAlign: "center" }}>
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "2px 8px",
                          borderRadius: 4, fontWeight: 500,
                          background: color + "20", color,
                        }}>
                          {completenessLabel(pct)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Labor Cap Status ───────────────────────────────────────────────── */}
      <Card id="cap" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Labor Cap Overruns" count={capRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active membership visits currently at or over the included labor cap.
        </p>
        {capRows.length === 0 ? (
          <EmptyState title="No cap overruns" description="All active membership visits are within the included labor cap." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Included Labor</th>
                  <th style={th}>Scheduled</th>
                  <th style={th}>Cap Status</th>
                </tr>
              </thead>
              <tbody>
                {capRows.map((row) => (
                  <tr key={row.visit_id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{row.client_name}</td>
                    <td style={td}>
                      <Link
                        href={`/app/visits/${row.visit_id}` as Route}
                        style={{ color: "var(--fg-link)", textDecoration: "none" }}
                      >
                        {row.plan_name}
                      </Link>
                    </td>
                    <td style={td}>{TIER_LABELS[row.membership_tier] ?? row.membership_tier}</td>
                    <td style={td}>{row.included_labor_minutes} min</td>
                    <td style={td}>{fmtDate(row.scheduled_start)}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: "var(--text-xs)", padding: "2px 8px",
                        borderRadius: 4, fontWeight: 500,
                        background: "#fee2e2", color: "#dc2626",
                      }}>
                        {CAP_LABELS[row.membership_cap_status] ?? row.membership_cap_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Upcoming Renewals ──────────────────────────────────────────────── */}
      <Card id="renewals" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Upcoming Renewals" count={renewalRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active memberships renewing within 60 days, including overdue.
        </p>
        {renewalRows.length === 0 ? (
          <EmptyState title="No renewals due in the next 60 days." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Renewal Date</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {renewalRows.map((row) => {
                  const badge = renewalBadge(row.renewal_date);
                  return (
                    <tr key={row.plan_id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link
                          href={`/app/maintenance-plans/${row.plan_id}` as Route}
                          style={{ color: "var(--fg-link)", textDecoration: "none" }}
                        >
                          {row.plan_name}
                        </Link>
                      </td>
                      <td style={td}>{TIER_LABELS[row.membership_tier] ?? row.membership_tier}</td>
                      <td style={td}>{fmtDate(row.renewal_date)}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "2px 8px",
                          borderRadius: 4, fontWeight: 500,
                          background: badge.bg, color: badge.color,
                        }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmt(row.annual_price_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {renewalRows.length > 0 && (
          <div style={{ marginTop: "var(--space-3)", textAlign: "right" }}>
            <Link
              href={"/app/maintenance-plans" as Route}
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
            >
              All memberships →
            </Link>
          </div>
        )}
      </Card>

      {/* ── Realtor Baseline Conversion ────────────────────────────────────── */}
      <Card id="baselines" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Realtor Baseline Conversion" count={totalBaselines} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Completed realtor baseline visits and whether the client converted to an active membership.
          {totalBaselines > 0 && (
            <> Conversion rate: <strong>{conversionRate}%</strong> ({convertedBaselines} of {totalBaselines}).</>
          )}
        </p>
        {baselineRows.length === 0 ? (
          <EmptyState
            title="No completed baseline visits"
            description="Completed realtor baseline visits will appear here with their membership conversion status."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Visit Date</th>
                  <th style={th}>Converted</th>
                  <th style={th}>Membership Plan</th>
                </tr>
              </thead>
              <tbody>
                {baselineRows.map((row) => (
                  <tr key={row.visit_id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={td}>{row.client_name}</td>
                    <td style={td}>{fmtDate(row.scheduled_start)}</td>
                    <td style={td}>
                      <span style={{
                        fontSize: "var(--text-xs)", padding: "2px 8px",
                        borderRadius: 4, fontWeight: 500,
                        background: row.converted ? "#dcfce7" : "#f1f5f9",
                        color: row.converted ? "#16a34a" : "#64748b",
                      }}>
                        {row.converted ? "Yes" : "No"}
                      </span>
                    </td>
                    <td style={td}>
                      {row.converted_plan_name
                        ? `${row.converted_plan_name} (${TIER_LABELS[row.converted_plan_tier ?? ""] ?? row.converted_plan_tier})`
                        : <span style={{ color: "var(--fg-muted)" }}>—</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
