import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";
import { formatCents } from "../format";
import type { EstimateMarginRow } from "../queries";

/**
 * Recent sent/approved estimates with internal cost tracking. Not month-scoped
 * — shows whenever any cost-tracked estimates exist.
 */
export function EstimateMarginsSection({ rows }: { rows: EstimateMarginRow[] }) {
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader title="Estimate Margins" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Recent sent/approved estimates with internal cost tracking (all dates). Margin = (labor revenue − internal labor cost) / labor revenue.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)", minWidth: 600 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Estimate</th>
              <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Total</th>
              <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Internal Cost</th>
              <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Margin</th>
              <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Scope</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const laborRevenue = row.total_cents - (row.internal_material_cost_cents ?? 0) - Math.round((row.internal_material_cost_cents ?? 0) * 0.15);
              const internalCost = row.internal_labor_cost_cents ?? 0;
              const marginCents = laborRevenue - internalCost;
              const marginPct = laborRevenue > 0 ? Math.round((marginCents / laborRevenue) * 100 * 10) / 10 : 0;
              const marginColor = marginPct >= 30 ? "var(--status-success)" : marginPct >= 15 ? "var(--status-warning)" : "var(--status-error)";
              return (
                <tr key={row.estimate_id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "var(--space-2) var(--space-3)" }}>
                    <Link
                      href={`/app/estimates/${row.estimate_id}` as Route}
                      style={{ color: "var(--accent)", textDecoration: "none", fontWeight: 600 }}
                    >
                      {row.client_name ?? "Unknown"}
                    </Link>
                    {row.job_title && (
                      <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{row.job_title}</div>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(row.total_cents)}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{formatCents(internalCost + (row.internal_material_cost_cents ?? 0))}</td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, color: marginColor }}>
                    {marginPct}%
                  </td>
                  <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", color: "var(--fg-muted)" }}>
                    {row.sq_ft !== null ? `${Number(row.sq_ft).toLocaleString()} sq ft` : "—"}
                    {row.prep_level !== null ? ` · L${row.prep_level}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
