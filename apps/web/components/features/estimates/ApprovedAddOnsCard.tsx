import { formatCents } from "@/lib/money";
import type { ApprovedAddOn } from "@/lib/estimates/add-on-choice";

/** Add-ons the customer ticked when approving (TASK-225). The final bill adds them. */
export function ApprovedAddOnsCard({ addOns }: { addOns: ApprovedAddOn[] | null }) {
  if (!addOns || addOns.length === 0) return null;
  const total = addOns.reduce((sum, a) => sum + a.price_cents, 0);
  return (
    <div className="card" style={{ marginBottom: "var(--space-4)", borderLeft: "3px solid var(--accent)" }} data-testid="approved-add-ons">
      <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)" }}>Customer added at approval</h3>
      <ul style={{ margin: 0, paddingLeft: "var(--space-4)" }}>
        {addOns.map((a) => (
          <li key={a.id}>
            {a.label} <strong>+{formatCents(a.price_cents)}</strong>
          </li>
        ))}
      </ul>
      <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {formatCents(total)} on top of the quote total. The deposit already includes it, and the final bill adds a line for each.
      </p>
    </div>
  );
}
