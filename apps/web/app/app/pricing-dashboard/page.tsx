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
import { MINIMUM_SERVICE_FEE_CENTS } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MarginRow = {
  avg_margin: string | null;
  estimate_count: string;
  with_margin_count: string;
};

type BelowMinRow = {
  id: string;
  status: string;
  total_cents: string;
  created_at: string;
  client_name: string;
  job_title: string;
  override_reason: string | null;
};

type OverrideRow = {
  reason: string;
  count: string;
};

type DiscountRow = {
  adjustment_type: string;
  count: string;
  total_cents: string;
};

type PriceBookUsageRow = {
  total_line_items: string;
  with_price_book: string;
};

type MarginBucketRow = {
  bucket: string;
  count: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number | string): string {
  const n = Number(cents);
  if (isNaN(n)) return "—";
  return `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const OVERRIDE_LABELS: Record<string, string> = {
  bundled:              "Bundled service",
  membership_included:  "Membership included",
  promo:                "Promotional",
  owner_approved:       "Owner approved",
};

const DISCOUNT_LABELS: Record<string, string> = {
  bundle_credit:     "Bundle credit",
  member_credit:     "Member credit",
  promo:             "Promotional",
  travel_surcharge:  "Travel surcharge",
  risk_adjustment:   "Risk adjustment",
  return_trip_charge:"Return trip charge",
  coordination_fee:  "Coordination fee",
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  draft:    { bg: "#f1f5f9", color: "#475569" },
  sent:     { bg: "#dbeafe", color: "#2563eb" },
  approved: { bg: "#dcfce7", color: "#16a34a" },
  declined: { bg: "#fee2e2", color: "#dc2626" },
  expired:  { bg: "#fef3c7", color: "#d97706" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PricingDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app/my-day");

  const accountId = session.accountId;
  const minCents = MINIMUM_SERVICE_FEE_CENTS;

  const [
    marginRows,
    belowMinRows,
    overrideRows,
    discountRows,
    priceBookUsageRows,
    marginBucketRows,
  ] = await Promise.all([

    // Margin summary
    query<MarginRow>(
      `SELECT
         ROUND(AVG(target_margin_pct), 1)::text AS avg_margin,
         COUNT(*)::text AS estimate_count,
         COUNT(*) FILTER (WHERE target_margin_pct IS NOT NULL)::text AS with_margin_count
       FROM estimates
       WHERE account_id = $1
         AND status IN ('draft','sent','approved')`,
      [accountId]
    ),

    // Estimates below minimum service fee (non-overridden)
    query<BelowMinRow>(
      `SELECT
         e.id,
         e.status,
         e.total_cents::text,
         e.created_at::text,
         c.name AS client_name,
         j.title AS job_title,
         e.minimum_service_override_reason AS override_reason
       FROM estimates e
       JOIN jobs j ON j.id = e.job_id
       JOIN clients c ON c.id = j.client_id
       WHERE e.account_id = $1
         AND e.status IN ('draft','sent','approved')
         AND e.total_cents < $2
       ORDER BY e.total_cents ASC
       LIMIT 20`,
      [accountId, minCents]
    ),

    // Override reason breakdown
    query<OverrideRow>(
      `SELECT
         minimum_service_override_reason AS reason,
         COUNT(*)::text AS count
       FROM estimates
       WHERE account_id = $1
         AND minimum_service_override_reason IS NOT NULL
       GROUP BY minimum_service_override_reason
       ORDER BY count DESC`,
      [accountId]
    ),

    // Discount / adjustment line items (grouped by type, excluding surcharges)
    query<DiscountRow>(
      `SELECT
         adjustment_type,
         COUNT(*)::text AS count,
         COALESCE(SUM(total_cents), 0)::text AS total_cents
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE e.account_id = $1
         AND eli.adjustment_type IS NOT NULL
       GROUP BY adjustment_type
       ORDER BY count DESC`,
      [accountId]
    ),

    // Price book usage rate across all line items
    query<PriceBookUsageRow>(
      `SELECT
         COUNT(*)::text AS total_line_items,
         COUNT(*) FILTER (WHERE eli.price_book_id IS NOT NULL)::text AS with_price_book
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE e.account_id = $1
         AND eli.line_item_type IN ('labor','materials')`,
      [accountId]
    ),

    // Margin distribution buckets
    query<MarginBucketRow>(
      `SELECT bucket, COUNT(*)::text AS count
       FROM (
         SELECT
           CASE
             WHEN target_margin_pct IS NULL         THEN 'Not set'
             WHEN target_margin_pct < 20             THEN '<20%'
             WHEN target_margin_pct < 35             THEN '20–35%'
             WHEN target_margin_pct < 50             THEN '35–50%'
             ELSE '50%+'
           END AS bucket
         FROM estimates
         WHERE account_id = $1
           AND status IN ('draft','sent','approved')
       ) sub
       GROUP BY bucket
       ORDER BY
         CASE bucket
           WHEN 'Not set' THEN 0
           WHEN '<20%'    THEN 1
           WHEN '20–35%'  THEN 2
           WHEN '35–50%'  THEN 3
           ELSE 4
         END`,
      [accountId]
    ),
  ]);

  // -- Derived values --------------------------------------------------------

  const mRow = marginRows[0] ?? { avg_margin: null, estimate_count: "0", with_margin_count: "0" };
  const totalEstimates = parseInt(mRow.estimate_count, 10);
  const withMarginCount = parseInt(mRow.with_margin_count, 10);
  const avgMargin = mRow.avg_margin ? `${mRow.avg_margin}%` : "—";

  const overrideTotalCount = overrideRows.reduce((s, r) => s + parseInt(r.count, 10), 0);
  const overrideRate = totalEstimates > 0
    ? Math.round((overrideTotalCount / totalEstimates) * 100)
    : 0;

  const usage = priceBookUsageRows[0] ?? { total_line_items: "0", with_price_book: "0" };
  const totalLineItems = parseInt(usage.total_line_items, 10);
  const withPriceBook = parseInt(usage.with_price_book, 10);
  const priceBookRate = totalLineItems > 0
    ? Math.round((withPriceBook / totalLineItems) * 100)
    : 0;

  const discountOnlyRows = discountRows.filter((r) =>
    ["bundle_credit", "member_credit", "promo"].includes(r.adjustment_type)
  );
  const totalDiscountCents = discountOnlyRows.reduce((s, r) => s + parseInt(r.total_cents, 10), 0);

  // -- Metrics ---------------------------------------------------------------

  const metrics: MetricCardData[] = [
    {
      label: "Avg Target Margin",
      value: avgMargin,
      sub: `${withMarginCount} of ${totalEstimates} estimates have margin set`,
      href: "#margins",
      variant: "default",
    },
    {
      label: "Below Minimum Fee",
      value: belowMinRows.length,
      sub: `Estimates under ${fmt(minCents)}`,
      href: "#below-min",
      variant: belowMinRows.length > 0 ? "alert" : "default",
    },
    {
      label: "Override Rate",
      value: `${overrideRate}%`,
      sub: `${overrideTotalCount} minimum fee overrides`,
      href: "#overrides",
      variant: overrideRate > 20 ? "alert" : "default",
    },
    {
      label: "Total Credits Issued",
      value: fmt(totalDiscountCents),
      sub: `${discountOnlyRows.reduce((s, r) => s + parseInt(r.count, 10), 0)} discount line items`,
      href: "#discounts",
      variant: "default",
    },
    {
      label: "Price Book Usage",
      value: `${priceBookRate}%`,
      sub: `${withPriceBook} of ${totalLineItems} labor/material lines`,
      href: "#pricebook",
      variant: priceBookRate < 50 ? "alert" : priceBookRate < 80 ? "default" : "success",
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
        title="Pricing Dashboard"
        subtitle="Margin health, minimum fee compliance, overrides, discounts, and price book adoption"
      />

      <MetricGrid metrics={metrics} />

      {/* ── Margin Distribution ────────────────────────────────────────────── */}
      <Card id="margins" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Margin Distribution" count={totalEstimates} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Target margin breakdown across active estimates (draft, sent, approved).
        </p>
        {marginBucketRows.length === 0 ? (
          <EmptyState title="No estimates found" />
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {marginBucketRows.map((row) => {
              const count = parseInt(row.count, 10);
              const pct = totalEstimates > 0 ? Math.round((count / totalEstimates) * 100) : 0;
              const isLow = row.bucket === "<20%" || row.bucket === "Not set";
              return (
                <div key={row.bucket} style={{
                  flex: "1 1 120px",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: isLow ? "#fee2e210" : "var(--color-surface-raised, #f8fafc)",
                  border: `1px solid ${isLow ? "#fca5a5" : "var(--border)"}`,
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
                    {row.bucket}
                  </div>
                  <div style={{ fontSize: "var(--text-xl)", fontWeight: 700, color: isLow ? "#dc2626" : "var(--fg)" }}>
                    {count}
                  </div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Estimates Below Minimum ────────────────────────────────────────── */}
      <Card id="below-min" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title={`Estimates Below Minimum (${fmt(minCents)})`} count={belowMinRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Active estimates under the minimum service fee. Overridden estimates are included — check the override reason.
        </p>
        {belowMinRows.length === 0 ? (
          <EmptyState
            title="No estimates below minimum"
            description="All active estimates meet the minimum service fee."
          />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Client</th>
                  <th style={th}>Job</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "right" }}>Total</th>
                  <th style={th}>Override</th>
                  <th style={th}>Created</th>
                </tr>
              </thead>
              <tbody>
                {belowMinRows.map((row) => {
                  const statusStyle = STATUS_COLORS[row.status] ?? { bg: "#f1f5f9", color: "#475569" };
                  return (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{row.client_name}</td>
                      <td style={td}>
                        <Link
                          href={`/app/estimates/${row.id}` as Route}
                          style={{ color: "var(--fg-link)", textDecoration: "none" }}
                        >
                          {row.job_title}
                        </Link>
                      </td>
                      <td style={td}>
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "2px 8px",
                          borderRadius: 4, fontWeight: 500,
                          background: statusStyle.bg, color: statusStyle.color,
                        }}>
                          {row.status}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#dc2626", fontWeight: 600 }}>
                        {fmt(row.total_cents)}
                      </td>
                      <td style={{ ...td, color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                        {row.override_reason ? (OVERRIDE_LABELS[row.override_reason] ?? row.override_reason) : "—"}
                      </td>
                      <td style={{ ...td, color: "var(--fg-muted)" }}>{fmtDate(row.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Override Breakdown ─────────────────────────────────────────────── */}
      <Card id="overrides" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Minimum Fee Override Breakdown" count={overrideTotalCount} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Reason breakdown for estimates where the minimum service fee was overridden.
        </p>
        {overrideRows.length === 0 ? (
          <EmptyState title="No overrides recorded" description="Minimum fee overrides will appear here when applied to estimates." />
        ) : (
          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
            {overrideRows.map((row) => {
              const count = parseInt(row.count, 10);
              const pct = overrideTotalCount > 0 ? Math.round((count / overrideTotalCount) * 100) : 0;
              return (
                <div key={row.reason} style={{
                  flex: "1 1 140px",
                  padding: "var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-surface-raised, #f8fafc)",
                  border: "1px solid var(--border)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
                    {OVERRIDE_LABELS[row.reason] ?? row.reason}
                  </div>
                  <div style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>{count}</div>
                  <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{pct}%</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── Discount / Credit Usage ────────────────────────────────────────── */}
      <Card id="discounts" style={{ marginTop: "var(--space-6)" }}>
        <SectionHeader title="Adjustments by Type" count={discountRows.length} />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          All adjustment line items across estimates, grouped by type. Surcharges generate revenue; credits reduce it.
        </p>
        {discountRows.length === 0 ? (
          <EmptyState title="No adjustment line items" description="Adjustment line items will appear here when added to estimates." />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Type</th>
                  <th style={{ ...th, textAlign: "right" }}>Count</th>
                  <th style={{ ...th, textAlign: "right" }}>Total Value</th>
                  <th style={th}>Direction</th>
                </tr>
              </thead>
              <tbody>
                {discountRows.map((row) => {
                  const isCredit = ["bundle_credit", "member_credit", "promo"].includes(row.adjustment_type);
                  const isSurcharge = ["travel_surcharge", "risk_adjustment", "return_trip_charge", "coordination_fee"].includes(row.adjustment_type);
                  return (
                    <tr key={row.adjustment_type} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>{DISCOUNT_LABELS[row.adjustment_type] ?? row.adjustment_type}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row.count}</td>
                      <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(row.total_cents)}</td>
                      <td style={td}>
                        <span style={{
                          fontSize: "var(--text-xs)", padding: "2px 8px",
                          borderRadius: 4, fontWeight: 500,
                          background: isCredit ? "#fee2e2" : isSurcharge ? "#dcfce7" : "#f1f5f9",
                          color: isCredit ? "#dc2626" : isSurcharge ? "#16a34a" : "#475569",
                        }}>
                          {isCredit ? "Credit" : isSurcharge ? "Surcharge" : "Neutral"}
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

      {/* ── Price Book Usage ───────────────────────────────────────────────── */}
      <Card id="pricebook" style={{ marginTop: "var(--space-6)", marginBottom: "var(--space-8)" }}>
        <SectionHeader title="Price Book Adoption" />
        <p style={{ margin: "0 0 var(--space-4)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          Percentage of labor and materials line items sourced from the price book.
          Higher adoption means more consistent pricing across estimates.
        </p>
        {totalLineItems === 0 ? (
          <EmptyState title="No estimate line items found" />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-6)" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{
                fontSize: "var(--text-3xl, 2rem)", fontWeight: 700,
                color: priceBookRate >= 80 ? "#16a34a" : priceBookRate >= 50 ? "#d97706" : "#dc2626",
              }}>
                {priceBookRate}%
              </div>
              <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                {withPriceBook} of {totalLineItems} lines
              </div>
            </div>
            <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${priceBookRate}%`,
                background: priceBookRate >= 80 ? "#16a34a" : priceBookRate >= 50 ? "#d97706" : "#dc2626",
                borderRadius: 4,
                transition: "width 0.3s",
              }} />
            </div>
            <Link
              href={"/app/price-book" as Route}
              style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)", textDecoration: "none", whiteSpace: "nowrap" }}
            >
              Price book →
            </Link>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
