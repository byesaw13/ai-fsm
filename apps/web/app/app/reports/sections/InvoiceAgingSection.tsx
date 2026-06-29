import { Card, SectionHeader } from "@/components/ui";
import type { InvoiceAgingData } from "../queries";
import { formatCents } from "../format";

/** Outstanding AR bucketed by age — relocated from the Overview dashboard. */
export function InvoiceAgingSection({ aging }: { aging: InvoiceAgingData }) {
  const buckets = [
    { label: "Current", v: aging.current, color: "var(--fg-default)" },
    { label: "1–30 days", v: aging.d30, color: "var(--color-amber-600)" },
    { label: "31–60 days", v: aging.d60, color: "var(--color-amber-600)" },
    { label: "60+ days", v: aging.d90, color: "var(--color-red-600)" },
  ];
  return (
    <Card style={{ marginTop: "var(--space-6)" }}>
      <SectionHeader title="Invoice Aging" />
      <p style={{ padding: "0 var(--space-3) var(--space-2)", color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
        Unpaid balance on sent / partial / overdue invoices, by how overdue it is.
      </p>
      <div style={{ padding: "var(--space-3)", display: "flex", gap: "var(--space-6)", flexWrap: "wrap", fontSize: "var(--text-sm)" }}>
        {buckets.map((b) => (
          <div key={b.label}>
            <div style={{ color: "var(--fg-muted)" }}>{b.label}</div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)", color: b.color }}>{formatCents(b.v)}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
