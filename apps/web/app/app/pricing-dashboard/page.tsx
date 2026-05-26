import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { query, queryOne } from "@/lib/db";
import { PageContainer, PageHeader, Card, SectionHeader } from "@/components/ui";
import { MINIMUM_SERVICE_FEE_CENTS } from "@ai-fsm/domain";

export const dynamic = "force-dynamic";

const OVERRIDE_REASON_LABELS: Record<string, string> = {
  bundled:             "Bundled job",
  membership_included: "Membership included",
  promo:               "Promotional",
  owner_approved:      "Owner approved",
};

const ADJUSTMENT_TYPE_LABELS: Record<string, string> = {
  travel_surcharge:    "Travel surcharge",
  risk_adjustment:     "Risk adjustment",
  return_trip_charge:  "Return trip charge",
  coordination_fee:    "Coordination fee",
  bundle_credit:       "Bundle credit",
  member_credit:       "Member credit",
  promo:               "Promo credit",
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(num: number, den: number): string {
  if (den === 0) return "0%";
  return `${Math.round((num / den) * 100)}%`;
}

type EstimateSummaryRow = {
  total: number;
  sent_or_beyond: number;
  below_minimum: number;
  with_override: number;
  with_travel_surcharge: number;
  with_risk_adjustment: number;
  avg_travel_surcharge_cents: number;
  avg_risk_adjustment_cents: number;
};

type OverrideBreakdownRow = {
  reason: string;
  count: number;
};

type AdjustmentBreakdownRow = {
  adjustment_type: string;
  count: number;
  total_cents: number;
  avg_cents: number;
};

type BelowMinimumRow = {
  id: string;
  total_cents: number;
  minimum_service_override_reason: string | null;
  minimum_override_note: string | null;
  pricing_review_status: string | null;
  created_at: string;
  client_name: string | null;
  job_title: string | null;
};

type PriceBookAdoptionRow = {
  total_line_items: number;
  price_book_line_items: number;
};

export default async function PricingDashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.role === "tech") redirect("/app");

  const minFeeCents = MINIMUM_SERVICE_FEE_CENTS;

  const [summary, overrideBreakdown, adjustmentBreakdown, belowMinimum, adoption] = await Promise.all([
    queryOne<EstimateSummaryRow>(
      `SELECT
         COUNT(*)::int                                                                AS total,
         COUNT(*) FILTER (WHERE status IN ('sent','approved','declined','expired'))::int AS sent_or_beyond,
         COUNT(*) FILTER (WHERE total_cents < $1)::int                               AS below_minimum,
         COUNT(*) FILTER (WHERE total_cents < $1 AND minimum_service_override_reason IS NOT NULL)::int AS with_override,
         COUNT(*) FILTER (WHERE travel_surcharge_cents > 0)::int                     AS with_travel_surcharge,
         COUNT(*) FILTER (WHERE risk_adjustment_cents > 0)::int                      AS with_risk_adjustment,
         COALESCE(AVG(travel_surcharge_cents) FILTER (WHERE travel_surcharge_cents > 0), 0)::int AS avg_travel_surcharge_cents,
         COALESCE(AVG(risk_adjustment_cents) FILTER (WHERE risk_adjustment_cents > 0), 0)::int   AS avg_risk_adjustment_cents
       FROM estimates
       WHERE account_id = $2`,
      [minFeeCents, session.accountId]
    ),

    query<OverrideBreakdownRow>(
      `SELECT minimum_service_override_reason AS reason, COUNT(*)::int AS count
       FROM estimates
       WHERE account_id = $1
         AND minimum_service_override_reason IS NOT NULL
       GROUP BY minimum_service_override_reason
       ORDER BY count DESC`,
      [session.accountId]
    ),

    query<AdjustmentBreakdownRow>(
      `SELECT eli.adjustment_type,
              COUNT(*)::int                AS count,
              SUM(ABS(eli.total_cents))::int  AS total_cents,
              AVG(ABS(eli.total_cents))::int  AS avg_cents
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE e.account_id = $1
         AND eli.adjustment_type IS NOT NULL
       GROUP BY eli.adjustment_type
       ORDER BY count DESC`,
      [session.accountId]
    ),

    query<BelowMinimumRow>(
      `SELECT e.id, e.total_cents, e.minimum_service_override_reason,
              e.minimum_override_note, e.pricing_review_status,
              e.created_at::text,
              c.name AS client_name, j.title AS job_title
       FROM estimates e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN jobs j ON j.id = e.job_id
       WHERE e.account_id = $1
         AND e.total_cents < $2
       ORDER BY e.created_at DESC
       LIMIT 25`,
      [session.accountId, minFeeCents]
    ),

    queryOne<PriceBookAdoptionRow>(
      `SELECT
         COUNT(*)::int                                                        AS total_line_items,
         COUNT(*) FILTER (WHERE eli.price_book_id IS NOT NULL)::int          AS price_book_line_items
       FROM estimate_line_items eli
       JOIN estimates e ON e.id = eli.estimate_id
       WHERE e.account_id = $1`,
      [session.accountId]
    ),
  ]);

  const s = summary ?? {
    total: 0, sent_or_beyond: 0, below_minimum: 0, with_override: 0,
    with_travel_surcharge: 0, with_risk_adjustment: 0,
    avg_travel_surcharge_cents: 0, avg_risk_adjustment_cents: 0,
  };
  const a = adoption ?? { total_line_items: 0, price_book_line_items: 0 };

  return (
    <PageContainer>
      <PageHeader
        title="Pricing Dashboard"
        subtitle="Estimate pricing health, override usage, and adjustment patterns"
        backHref="/app"
      />

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
        {[
          { label: "Total estimates", value: s.total },
          { label: "Below minimum fee", value: s.below_minimum, sub: `${pct(s.below_minimum, s.total)} of all`, warn: s.below_minimum > 0 },
          { label: "With override reason", value: s.with_override, sub: `${pct(s.with_override, s.below_minimum)} of below-min` },
          { label: "Price book adoption", value: pct(a.price_book_line_items, a.total_line_items), sub: `${a.price_book_line_items} of ${a.total_line_items} line items` },
        ].map(({ label, value, sub, warn }) => (
          <Card key={label} padding="sm">
            <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{label}</p>
            <p style={{
              margin: 0, fontSize: "var(--text-2xl)", fontWeight: 800,
              color: warn ? "var(--danger)" : "var(--fg)",
            }}>{value}</p>
            {sub && <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{sub}</p>}
          </Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)", marginBottom: "var(--space-4)" }}>
        {/* Surcharge & risk adjustment usage */}
        <Card>
          <SectionHeader title="Surcharge & Risk Adjustment Usage" />
          <dl className="p7-detail-list">
            <div className="p7-detail-row">
              <dt>Estimates with travel surcharge</dt>
              <dd>{s.with_travel_surcharge} <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>({pct(s.with_travel_surcharge, s.total)})</span></dd>
            </div>
            <div className="p7-detail-row">
              <dt>Avg surcharge when used</dt>
              <dd>{formatCents(s.avg_travel_surcharge_cents)}</dd>
            </div>
            <div className="p7-detail-row">
              <dt>Estimates with risk adjustment</dt>
              <dd>{s.with_risk_adjustment} <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>({pct(s.with_risk_adjustment, s.total)})</span></dd>
            </div>
            <div className="p7-detail-row">
              <dt>Avg risk adjustment when used</dt>
              <dd>{formatCents(s.avg_risk_adjustment_cents)}</dd>
            </div>
          </dl>
        </Card>

        {/* Override frequency */}
        <Card>
          <SectionHeader title="Minimum Override Reasons" />
          {overrideBreakdown.length === 0 ? (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No overrides recorded.</p>
          ) : (
            <dl className="p7-detail-list">
              {overrideBreakdown.map((row) => (
                <div key={row.reason} className="p7-detail-row">
                  <dt>{OVERRIDE_REASON_LABELS[row.reason] ?? row.reason}</dt>
                  <dd>{row.count}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
      </div>

      {/* Adjustment type breakdown */}
      {adjustmentBreakdown.length > 0 && (
        <Card style={{ marginBottom: "var(--space-4)" }}>
          <SectionHeader title="Line Item Adjustment Breakdown" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Type", "Count", "Total value", "Avg per use"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: 600, fontSize: "var(--text-xs)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adjustmentBreakdown.map((row) => (
                <tr key={row.adjustment_type} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{ADJUSTMENT_TYPE_LABELS[row.adjustment_type] ?? row.adjustment_type}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{row.count}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{formatCents(row.total_cents)}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>{formatCents(row.avg_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Below-minimum estimates */}
      <Card>
        <SectionHeader title={`Estimates Below Minimum Fee (${formatCents(minFeeCents)})`} count={belowMinimum.length} />
        {belowMinimum.length === 0 ? (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>No estimates below the minimum fee.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Client / Job", "Total", "Override reason", "Note", "Status"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: 600, fontSize: "var(--text-xs)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {belowMinimum.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <a href={`/app/estimates/${row.id}`} style={{ color: "var(--accent)", fontWeight: 600 }}>
                      {row.client_name ?? "—"}
                    </a>
                    {row.job_title && (
                      <span style={{ display: "block", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{row.job_title}</span>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--danger)", fontWeight: 600 }}>
                    {formatCents(row.total_cents)}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    {row.minimum_service_override_reason
                      ? OVERRIDE_REASON_LABELS[row.minimum_service_override_reason] ?? row.minimum_service_override_reason
                      : <span style={{ color: "var(--danger)", fontWeight: 600 }}>None</span>}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", maxWidth: 200 }}>
                    {row.minimum_override_note ?? "—"}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    {row.pricing_review_status ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </PageContainer>
  );
}
