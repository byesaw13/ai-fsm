import { Card, SectionHeader } from "@/components/ui";
import { ACTIVITY_CATEGORY_LABELS, type ActivityCategory } from "@ai-fsm/domain";
import type { TimeByCategoryRow } from "../queries";

const CATEGORY_COLORS: Record<string, string> = {
  revenue: "var(--color-success)",
  sales: "var(--accent)",
  office: "var(--color-warning)",
  growth: "#7c3aed",
  personal: "var(--fg-muted)",
};

function fmtHours(minutes: number): string {
  const h = minutes / 60;
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}

/**
 * "Where your time went" — month-scoped category breakdown from the activity
 * ledger, with the revenue-vs-everything-else ratio that drives pricing
 * decisions. Renders nothing until any time has been tracked.
 */
export function TimeSection({ rows, monthLabel }: { rows: TimeByCategoryRow[]; monthLabel: string }) {
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  if (total === 0) return null;

  const businessTotal = rows.filter((r) => r.category !== "personal").reduce((s, r) => s + r.minutes, 0);
  const revenueMinutes = rows.find((r) => r.category === "revenue")?.minutes ?? 0;
  const revenuePct = businessTotal > 0 ? Math.round((revenueMinutes / businessTotal) * 100) : 0;

  return (
    <Card style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader title="Where Your Time Went" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Tracked activity for {monthLabel}. Revenue-producing share of business time:{" "}
        <strong style={{ color: revenuePct >= 50 ? "var(--color-success)" : "var(--color-warning)" }}>{revenuePct}%</strong>
      </p>
      <div style={{ padding: "0 var(--space-3) var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {rows.map((r) => {
          const pct = Math.round((r.minutes / total) * 100);
          const label = ACTIVITY_CATEGORY_LABELS[r.category as ActivityCategory] ?? r.category;
          const color = CATEGORY_COLORS[r.category] ?? "var(--border-strong)";
          return (
            <div key={r.category} style={{ display: "grid", gridTemplateColumns: "90px 1fr 70px", alignItems: "center", gap: "var(--space-3)", fontSize: "var(--text-sm)" }}>
              <span style={{ fontWeight: 600 }}>{label}</span>
              <div style={{ height: 10, borderRadius: 6, background: "var(--bg)", overflow: "hidden", border: "1px solid var(--border-subtle)" }}>
                <div style={{ width: `${pct}%`, height: "100%", background: color }} />
              </div>
              <span style={{ textAlign: "right", color: "var(--fg-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {fmtHours(r.minutes)} · {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
