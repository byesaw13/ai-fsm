import Link from "next/link";
import type { Route } from "next";
import { formatCents } from "@ai-fsm/money";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";
import type { JobMaterialExpenseWithLines } from "@/lib/invoices/job-expenses";

interface Props {
  expenses: JobMaterialExpenseWithLines[];
}

export function JobMaterialsPanel({ expenses }: Props) {
  if (expenses.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
        No receipts linked to this job yet.
      </p>
    );
  }

  const unbilledTotalCents = expenses
    .filter((e) => !e.billed)
    .reduce((sum, e) => sum + e.amount_cents, 0);

  return (
    <div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-3)" }}>
        {expenses.map((expense) => (
          <li
            key={expense.id}
            style={{ paddingBottom: "var(--space-2)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)" }}>
              <Link
                href={`/app/expenses/${expense.id}` as Route}
                style={{ fontWeight: 600, color: "var(--accent)", textDecoration: "none" }}
              >
                {expense.vendor_name}
              </Link>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {formatCents(expense.amount_cents)}
              </span>
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: "2px" }}>
              {expense.expense_date.slice(0, 10)}
              {" · "}
              <span style={{ color: expense.billed ? "var(--color-success, #16a34a)" : "var(--fg-muted)" }}>
                {expense.billed ? "Billed" : "Not yet billed"}
              </span>
            </div>
            {expense.line_items.length > 0 ? (
              <ul style={{ margin: "6px 0 0", paddingLeft: "1rem", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                {expense.line_items.map((li) => (
                  <li key={li.id}>
                    {li.name} · {formatLineQuantityDisplay(li.quantity)} × {formatCents(li.unit_cost_cents)} ={" "}
                    {formatCents(li.line_total_cents)}
                  </li>
                ))}
              </ul>
            ) : (
              expense.notes && (
                <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {expense.notes}
                </p>
              )
            )}
          </li>
        ))}
      </ul>
      <div style={{ marginTop: "var(--space-3)", fontSize: "var(--text-sm)", fontWeight: 600, textAlign: "right" }}>
        Unbilled total: {formatCents(unbilledTotalCents)}
      </div>
    </div>
  );
}
