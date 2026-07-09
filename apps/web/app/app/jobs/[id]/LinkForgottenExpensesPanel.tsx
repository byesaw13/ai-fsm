"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@ai-fsm/money";
import {
  materialExpenseDescription,
  type LinkableMaterialExpense,
} from "@/lib/invoices/material-handling";

interface Props {
  jobId: string;
}

export function LinkForgottenExpensesPanel({ jobId }: Props) {
  const router = useRouter();
  const [expenses, setExpenses] = useState<LinkableMaterialExpense[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/linkable-expenses`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpenses([]);
        return;
      }
      setExpenses((json.data?.expenses ?? []) as LinkableMaterialExpense[]);
    } catch {
      setError("Could not load unlinked receipts");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function linkSelected() {
    if (selected.size === 0) return;
    setPending(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/link-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_ids: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to link receipts");
        return;
      }
      const count = (json.data?.linked ?? []).length;
      setSuccess(`${count} receipt${count === 1 ? "" : "s"} linked to this job.`);
      setSelected(new Set());
      router.refresh();
      await load();
    } catch {
      setError("Network error while linking receipts");
    } finally {
      setPending(false);
    }
  }

  if (loading || expenses.length === 0) return null;

  return (
    <CardSection title="Forgotten receipts" testId="job-link-forgotten-expenses">
      <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        Unlinked material expenses for this client — attach before invoicing.
      </p>

      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
        {expenses.map((expense) => (
          <li key={expense.id}>
            <label style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={selected.has(expense.id)}
                onChange={() => toggle(expense.id)}
                disabled={pending}
              />
              <span>
                <strong>{expense.vendor_name}</strong>
                <span style={{ color: "var(--fg-muted)" }}>
                  {" "}
                  · {expense.expense_date.slice(0, 10)} · {formatCents(expense.amount_cents)}
                </span>
                <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
                  {materialExpenseDescription(expense)}
                </div>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "var(--space-3)" }}>
        <button
          type="button"
          onClick={() => void linkSelected()}
          disabled={pending || selected.size === 0}
          className="p7-btn p7-btn-secondary p7-btn-sm"
        >
          {pending ? "Linking…" : `Link to job (${selected.size})`}
        </button>
      </div>
    </CardSection>
  );
}

function CardSection({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      style={{
        marginTop: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--bg-card)",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: "var(--space-2)" }}>{title}</div>
      {children}
    </div>
  );
}

function Alert({ tone, children }: { tone: "danger" | "success"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      style={{
        padding: "var(--space-2)",
        marginBottom: "var(--space-2)",
        fontSize: "var(--text-sm)",
        color: tone === "danger" ? "var(--color-danger)" : "var(--color-green-700)",
        background: tone === "danger" ? "var(--color-red-50)" : "var(--bg-subtle)",
        borderRadius: "var(--radius-sm)",
      }}
    >
      {children}
    </div>
  );
}