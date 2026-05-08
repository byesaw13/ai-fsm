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
  essential_arr: string;
  plus_arr: string;
  premier_arr: string;
};

type CountRow = { count: string };

type RenewalRow = {
  id: string;
  name: string;
  membership_tier: string;
  member_priority: string;
  annual_price_cents: string;
  billing_cadence: string;
  renewal_date: string;
  client_name: string;
};

type CapOverrunRow = {
  id: string;
  scheduled_start: string | null;
  included_labor_cap_minutes: number | null;
  included_labor_minutes_used: number;
  membership_cap_status: string;
  plan_id: string;
  plan_name: string;
  client_name: string;
};

type SnapshotPendingRow = {
  id: string;
  scheduled_start: string | null;
  plan_id: string;
  plan_name: string;
  client_name: string;
};

type VaultRow = {
  property_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  client_name: string;
  plan_id: string;
  plan_name: string;
  membership_tier: string;
  vault_item_count: number;
  covered_categories: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VAULT_CATEGORY_TARGET = 6; // mechanical, appliance, filter, paint_finish, monitor, vendor

const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  plus: "Plus",
  premier: "Premier",
};

const PRIORITY_LABELS: Record<string, string> = {
  priority: "Priority",
  vip: "VIP",
};

function formatCents(cents: number | string): string {
  const n = Number(cents);
  return `$${(n / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function renewalBadge(renewalDate: string): { label: string; bg: string; color: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(renewalDate);
  const daysOut = Math.round((d.getTime() - today.getTime()) / 86_400_000);

  if (daysOut < 0) return { label: "Overdue", bg: "#fee2e2", color: "#dc2626" };
  if (daysOut <= 30) return { label: `${daysOut}d`, bg: "#fef3c7", color: "#d97706" };
  return { label: `${daysOut}d`, bg: "#dbeafe", color: "#2563eb" };
}

function vaultBadge(covered: number): { label: string; bg: string; color: string } {
  const pct = Math.round((covered / VAULT_CATEGORY_TARGET) * 100);
  if (covered >= VAULT_CATEGORY_TARGET)
    return { label: `${pct}%`, bg: "#dcfce7", color: "#16a34a" };
  if (covered >= 3)
    return { label: `${pct}%`, bg: "#fef3c7", color: "#d97706" };
  return { label: `${pct}%`, bg: "#fee2e2", color: "#dc2626" };
}

function capBadge(status: string): { label: string; bg: string; color: string } {
  if (status === "approval_required")
    return { label: "Approval Required", bg: "#fee2e2", color: "#dc2626" };
  return { label: "Cap Reached", bg: "#fef3c7", color: "#d97706" };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MembershipDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const accountId = session.accountId;

  const [
    planSummary,
    renewingSoon,
    overdueRenewals,
    capOverrunCount,
    snapshotPendingCount,
    renewalsList,
    capOverrunsList,
    snapshotPendingList,
    vaultList,
  ] = await Promise.all([
    // Active plan summary with ARR + tier breakdown
    query<PlanSummaryRow>(
      `SELECT
         COUNT(*)::text AS count,
         COALESCE(SUM(annual_price_cents), 0)::text AS arr_cents,
         COUNT(*) FILTER (WHERE membership_tier = 'essential')::text AS essential_count,
         COUNT(*) FILTER (WHERE membership_tier = 'plus')::text       AS plus_count,
         COUNT(*) FILTER (WHERE membership_tier = 'premier')::text    AS premier_count,
         COALESCE(SUM(annual_price_cents) FILTER (WHERE membership_tier = 'essential'), 0)::text AS essential_arr,
         COALESCE(SUM(annual_price_cents) FILTER (WHERE membership_tier = 'plus'),      0)::text AS plus_arr,
         COALESCE(SUM(annual_price_cents) FILTER (WHERE membership_tier = 'premier'),   0)::text AS premier_arr
       FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'`,
      [accountId]
    ),

    // Renewing within 30 days
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date > CURRENT_DATE
         AND renewal_date <= CURRENT_DATE + INTERVAL '30 days'`,
      [accountId]
    ),

    // Overdue renewals
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM maintenance_plans
       WHERE account_id = $1 AND status = 'active'
         AND renewal_date IS NOT NULL
         AND renewal_date < CURRENT_DATE`,
      [accountId]
    ),

    // Cap overrun count
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_cap_status IN ('cap_reached', 'approval_required')
         AND status NOT IN ('completed', 'cancelled')`,
      [accountId]
    ),

    // Snapshots pending count
    query<CountRow>(
      `SELECT COUNT(*)::text AS count FROM visits
       WHERE account_id = $1
         AND generated_from_plan_id IS NOT NULL
         AND membership_visit_phase = 'reporting'
         AND membership_snapshot_sent_at IS NULL
         AND status != 'cancelled'`,
      [accountId]
    ),

    // Renewals list — overdue + within 60 days
    query<RenewalRow>(
      `SELECT mp.id, mp.name, mp.membership_tier, mp.member_priority,
              mp.annual_price_cents::text, mp.billing_cadence, mp.renewal_date::text,
              c.name AS client_name
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

    // Cap overruns list
    query<CapOverrunRow>(
      `SELECT v.id, v.scheduled_start::text,
              v.included_labor_cap_minutes, v.included_labor_minutes_used,
              v.membership_cap_status,
              mp.id AS plan_id, mp.name AS plan_name,
              c.name AS client_name
       FROM visits v
       JOIN maintenance_plans mp ON v.generated_from_plan_id = mp.id
       JOIN clients c ON mp.client_id = c.id
       WHERE v.account_id = $1
         AND v.generated_from_plan_id IS NOT NULL
         AND v.membership_cap_status IN ('cap_reached', 'approval_required')
         AND v.status NOT IN ('completed', 'cancelled')
       ORDER BY v.scheduled_start ASC NULLS LAST
       LIMIT 20`,
      [accountId]
    ),

    // Snapshots pending list
    query<SnapshotPendingRow>(
      `SELECT v.id, v.scheduled_start::text,
              mp.id AS plan_id, mp.name AS plan_name,
              c.name AS client_name
       FROM visits v
       JOIN maintenance_plans mp ON v.generated_from_plan_id = mp.id
       JOIN clients c ON mp.client_id = c.id
       WHERE v.account_id = $1
         AND v.generated_from_plan_id IS NOT NULL
         AND v.membership_visit_phase = 'reporting'
         AND v.membership_snapshot_sent_at IS NULL
         AND v.status != 'cancelled'
       ORDER BY v.scheduled_start ASC NULLS LAST
       LIMIT 20`,
      [accountId]
    ),

    // Vault completeness per active plan with property
    query<VaultRow>(
      `SELECT
         p.id          AS property_id,
         p.address,
         p.city,
         p.state,
         c.name        AS client_name,
         mp.id         AS plan_id,
         mp.name       AS plan_name,
         mp.membership_tier,
         COUNT(DISTINCT pvi.id)::int AS vault_item_count,
         COUNT(DISTINCT pvi.category)
           FILTER (WHERE pvi.category IN ('mechanical','appliance','filter','paint_finish','monitor','vendor'))
           ::int AS covered_categories
       FROM maintenance_plans mp
       JOIN clients c ON mp.client_id = c.id
       LEFT JOIN properties p ON mp.property_id = p.id
       LEFT JOIN property_vault_items pvi
         ON pvi.property_id = p.id AND pvi.account_id = mp.account_id
       WHERE mp.account_id = $1 AND mp.status = 'active'
       GROUP BY p.id, p.address, p.city, p.state, c.name, mp.id, mp.name, mp.membership_tier
       ORDER BY covered_categories ASC NULLS FIRST, c.name ASC
       LIMIT 20`,
      [accountId]
    ),
  ]);

  const summary = planSummary[0] ?? {
    count: "0", arr_cents: "0",
    essential_count: "0", plus_count: "0", premier_count: "0",
    essential_arr: "0", plus_arr: "0", premier_arr: "0",
  };

  const activeCount     = parseInt(summary.count, 10);
  const arrCents        = parseInt(summary.arr_cents, 10);
  const soonCount       = parseInt(renewingSoon[0]?.count ?? "0", 10);
  const overdueCount    = parseInt(overdueRenewals[0]?.count ?? "0", 10);
  const capCount        = parseInt(capOverrunCount[0]?.count ?? "0", 10);
  const snapshotCount   = parseInt(snapshotPendingCount[0]?.count ?? "0", 10);

  const metrics: MetricCardData[] = [
    {
      label: "Active Members",
      value: activeCount,
      sub: `${summary.essential_count}E · ${summary.plus_count}P · ${summary.premier_count}Pr`,
      href: "/app/maintenance-plans",
      variant: "default",
    },
    {
      label: "Annual Run Rate",
      value: formatCents(arrCents),
      sub: `E ${formatCents(summary.essential_arr)} · P ${formatCents(summary.plus_arr)} · Pr ${formatCents(summary.premier_arr)}`,
    },
    {
      label: "Renewing in 30 Days",
      value: soonCount,
      href: "/app/maintenance-plans",
      variant: soonCount > 0 ? "alert" : "default",
    },
    {
      label: "Overdue Renewals",
      value: overdueCount,
      href: "/app/maintenance-plans",
      variant: overdueCount > 0 ? "alert" : "default",
    },
    {
      label: "Cap Overruns",
      value: capCount,
      href: "/app/visits",
      variant: capCount > 0 ? "alert" : "default",
    },
    {
      label: "Snapshots Pending",
      value: snapshotCount,
      href: "/app/visits",
      variant: snapshotCount > 0 ? "alert" : "default",
    },
  ];

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
  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
  };
  const trStyle: React.CSSProperties = {
    borderBottom: "1px solid var(--border)",
  };

  return (
    <PageContainer>
      <PageHeader title="Membership Dashboard" />

      <MetricGrid metrics={metrics} />

      {/* ── Upcoming Renewals ─────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-8)" }}>
        <SectionHeader title="Upcoming Renewals" count={renewalsList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active plans with renewal date within 60 days, including overdue.
        </p>
        {renewalsList.length === 0 ? (
          <EmptyState title="No renewals due in the next 60 days." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Renewal</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Annual</th>
                </tr>
              </thead>
              <tbody>
                {renewalsList.map((row) => {
                  const badge = renewalBadge(row.renewal_date);
                  const priorityLabel = PRIORITY_LABELS[row.member_priority];
                  return (
                    <tr key={row.id} style={trStyle}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link
                          href={`/app/maintenance-plans/${row.id}` as Route}
                          style={{ color: "var(--fg-link)", textDecoration: "none" }}
                        >
                          {row.name}
                        </Link>
                        {priorityLabel && (
                          <span
                            style={{
                              marginLeft: "var(--space-2)",
                              fontSize: "var(--text-xs)",
                              padding: "1px 6px",
                              borderRadius: 4,
                              background: row.member_priority === "vip" ? "#fef3c7" : "#dbeafe",
                              color: row.member_priority === "vip" ? "#d97706" : "#2563eb",
                            }}
                          >
                            {priorityLabel}
                          </span>
                        )}
                      </td>
                      <td style={td}>{TIER_LABELS[row.membership_tier] ?? row.membership_tier}</td>
                      <td style={td}>{formatDate(row.renewal_date)}</td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 500,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {formatCents(row.annual_price_cents)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Labor Cap Overruns ────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Labor Cap Overruns" count={capOverrunsList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active membership visits where the included labor cap has been reached.
        </p>
        {capOverrunsList.length === 0 ? (
          <EmptyState title="No active cap overruns." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Scheduled</th>
                  <th style={th}>Labor Used / Cap</th>
                  <th style={th}>Status</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {capOverrunsList.map((row) => {
                  const badge = capBadge(row.membership_cap_status);
                  const cap = row.included_labor_cap_minutes;
                  const used = row.included_labor_minutes_used;
                  return (
                    <tr key={row.id} style={trStyle}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link
                          href={`/app/maintenance-plans/${row.plan_id}` as Route}
                          style={{ color: "var(--fg-link)", textDecoration: "none" }}
                        >
                          {row.plan_name}
                        </Link>
                      </td>
                      <td style={td}>{formatDate(row.scheduled_start)}</td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                        {used} min / {cap != null ? `${cap} min` : "—"}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 500,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right" }}>
                        <Link
                          href={`/app/visits/${row.id}` as Route}
                          style={{ color: "var(--fg-link)", fontSize: "var(--text-xs)", textDecoration: "none" }}
                        >
                          View visit →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Snapshots Pending ─────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Snapshots Pending" count={snapshotPendingList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Membership visits in the reporting phase awaiting snapshot delivery to client.
        </p>
        {snapshotPendingList.length === 0 ? (
          <EmptyState title="No snapshots pending." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Visit Date</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {snapshotPendingList.map((row) => (
                  <tr key={row.id} style={trStyle}>
                    <td style={td}>{row.client_name}</td>
                    <td style={td}>
                      <Link
                        href={`/app/maintenance-plans/${row.plan_id}` as Route}
                        style={{ color: "var(--fg-link)", textDecoration: "none" }}
                      >
                        {row.plan_name}
                      </Link>
                    </td>
                    <td style={td}>{formatDate(row.scheduled_start)}</td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <Link
                        href={`/app/visits/${row.id}` as Route}
                        style={{ color: "var(--fg-link)", fontSize: "var(--text-xs)", textDecoration: "none" }}
                      >
                        Send snapshot →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Vault Completeness ────────────────────────────────────────────── */}
      <Card style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Vault Completeness" count={vaultList.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Digital Home Vault coverage per active membership — target: all {VAULT_CATEGORY_TARGET} core categories.
        </p>
        {vaultList.length === 0 ? (
          <EmptyState title="No active membership plans found." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Plan</th>
                  <th style={th}>Tier</th>
                  <th style={th}>Property</th>
                  <th style={th}>Items</th>
                  <th style={th}>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {vaultList.map((row) => {
                  const badge = vaultBadge(row.covered_categories ?? 0);
                  const propertyDisplay = row.address
                    ? [row.address, row.city, row.state].filter(Boolean).join(", ")
                    : "No property linked";
                  return (
                    <tr key={row.plan_id} style={trStyle}>
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
                      <td style={{ ...td, color: row.address ? "inherit" : "var(--fg-muted)" }}>
                        {row.property_id ? (
                          <Link
                            href={`/app/properties/${row.property_id}` as Route}
                            style={{ color: "var(--fg-link)", textDecoration: "none" }}
                          >
                            {propertyDisplay}
                          </Link>
                        ) : (
                          propertyDisplay
                        )}
                      </td>
                      <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>
                        {row.vault_item_count}
                      </td>
                      <td style={td}>
                        <span
                          style={{
                            fontSize: "var(--text-xs)",
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: badge.bg,
                            color: badge.color,
                            fontWeight: 500,
                          }}
                        >
                          {row.covered_categories ?? 0}/{VAULT_CATEGORY_TARGET} {badge.label}
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
    </PageContainer>
  );
}
