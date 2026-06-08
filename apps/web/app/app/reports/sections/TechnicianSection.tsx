import { Card, SectionHeader } from "@/components/ui";
import type { TechPerformanceRow } from "../queries";

/** Per-technician visit completion stats for the month. */
export function TechnicianSection({ rows, monthLabel }: { rows: TechPerformanceRow[]; monthLabel: string }) {
  if (rows.length === 0) return null;

  return (
    <Card style={{ marginTop: "var(--space-4)" }}>
      <SectionHeader title="Tech Performance" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Visit completion stats for technicians in {monthLabel}.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Technician</th>
            <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Completed</th>
            <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Total</th>
            <th style={{ textAlign: "right", padding: "var(--space-2) var(--space-3)", color: "var(--fg-muted)", fontWeight: "var(--font-semibold)" }}>Completion Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = parseFloat(row.completion_rate);
            const rateColor = rate >= 80 ? "var(--status-success)" : rate >= 50 ? "var(--status-warning)" : "var(--status-error)";
            return (
              <tr key={row.user_id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "var(--space-2) var(--space-3)", fontWeight: 600 }}>{row.user_name}</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.visits_completed}</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right" }}>{row.total_visits}</td>
                <td style={{ padding: "var(--space-2) var(--space-3)", textAlign: "right", fontWeight: 700, color: rateColor }}>
                  {row.completion_rate}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
