import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";
import { MINIMUM_SERVICE_FEE_CENTS } from "@ai-fsm/domain";
import { formatCents, pctOf, OVERRIDE_REASON_LABELS } from "../format";
import type { PricingSummaryRow, LowValueRow, OverrideReasonRow, BelowMinimumEstimateRow } from "../queries";

interface Props {
  pricingSummary: PricingSummaryRow;
  lowValue: LowValueRow;
  overrideReasonRows: OverrideReasonRow[];
  belowMinimumEstimates: BelowMinimumEstimateRow[];
}

/** Estimate pricing guardrails — salvaged from the retired Pricing Dashboard. */
export function PricingHealthSection({ pricingSummary, lowValue, overrideReasonRows, belowMinimumEstimates }: Props) {
  return (
    <Card style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader title="Pricing Health" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Estimate pricing guardrails (all dates). Minimum service fee: {formatCents(MINIMUM_SERVICE_FEE_CENTS)}.
      </p>
      <div style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Total estimates</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{pricingSummary.total}</div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Below minimum</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", color: pricingSummary.below_minimum > 0 ? "var(--status-warning)" : "inherit" }}>
            {pricingSummary.below_minimum} <span style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--fg-muted)" }}>({pctOf(pricingSummary.below_minimum, pricingSummary.total)})</span>
          </div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Below-min w/ override</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{pricingSummary.with_override} <span style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--fg-muted)" }}>of {pricingSummary.below_minimum}</span></div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Low-value job ratio</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", color: lowValue.below_minimum > 0 ? "var(--status-warning)" : "inherit" }}>
            {pctOf(lowValue.below_minimum, lowValue.total_estimated_jobs)} <span style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--fg-muted)" }}>({lowValue.below_minimum}/{lowValue.total_estimated_jobs} jobs)</span>
          </div>
        </div>
        <div>
          <div style={{ color: "var(--fg-muted)" }}>Price book adoption</div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{pctOf(pricingSummary.price_book_line_items, pricingSummary.total_line_items)}</div>
        </div>
      </div>

      {overrideReasonRows.length > 0 && (
        <div style={{ padding: "0 var(--space-3) var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-muted)", marginBottom: "var(--space-2)" }}>
            Minimum override reasons
          </div>
          <dl className="p7-detail-list">
            {overrideReasonRows.map((row) => (
              <div key={row.reason} className="p7-detail-row">
                <dt>{OVERRIDE_REASON_LABELS[row.reason] ?? row.reason}</dt>
                <dd>{row.count}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {belowMinimumEstimates.length > 0 && (
        <div style={{ padding: "0 var(--space-3) var(--space-3)", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Client / Job", "Total", "Override reason"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)", fontSize: "var(--text-xs)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {belowMinimumEstimates.map((row) => (
                <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <Link href={`/app/estimates/${row.id}` as Route} style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}>
                      {row.client_name ?? "—"}
                    </Link>
                    {row.job_title && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{row.job_title}</div>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", color: "var(--status-warning)", fontWeight: 600 }}>{formatCents(row.total_cents)}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    {row.minimum_service_override_reason
                      ? OVERRIDE_REASON_LABELS[row.minimum_service_override_reason] ?? row.minimum_service_override_reason
                      : <span style={{ color: "var(--status-error)", fontWeight: 600 }}>None</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
