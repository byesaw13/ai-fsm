"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@ai-fsm/money";
import {
  materialExpenseDescription,
  materialHandlingCents,
  materialInvoiceTotalCents,
  type LinkableMaterialExpense,
} from "@/lib/invoices/material-handling";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";

interface Props {
  invoiceId: string;
  jobId: string;
  handlingPct?: number;
}

export function LinkForgottenExpensesPanel({ invoiceId, jobId, handlingPct = 15 }: Props) {
  const handlingRate = handlingPct / 100;
  const router = useRouter();
  const [expenses, setExpenses] = useState<LinkableMaterialExpense[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/linkable-expenses`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpenses([]);
        setError(json.error?.message ?? "Could not load forgotten receipts");
        return;
      }
      const rows = (json.data?.expenses ?? []) as LinkableMaterialExpense[];
      setExpenses(rows);
      if (rows.length > 0) setExpanded(true);
    } catch {
      setError("Network error loading receipts");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

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
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/link-expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_ids: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to link receipts");
        return;
      }
      setSelected(new Set());
      router.refresh();
      await load();
    } catch {
      setError("Network error while linking receipts");
    } finally {
      setPending(false);
    }
  }

  if (loading) return null;
  if (expenses.length === 0 && !error) return null;

  return (
    <div
      style={{
        marginBottom: "var(--space-3)",
        padding: "var(--space-3)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-subtle, var(--bg-card))",
      }}
      data-testid="link-forgotten-expenses-panel"
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          width: "100%",
          justifyContent: "space-between",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
          color: "var(--fg)",
        }}
      >
        <span>
          Forgotten receipts
          {expenses.length > 0 && (
            <span style={{ marginLeft: 8, color: "var(--fg-muted)", fontWeight: 400 }}>
              ({expenses.length} unlinked for this client)
            </span>
          )}
        </span>
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
      </button>

      {expanded && (
        <div style={{ marginTop: "var(--space-3)" }}>
          <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Material runs logged without a project appear here. Select receipts to attach to{" "}
            <code style={{ fontSize: "11px" }}>{jobId.slice(0, 8)}…</code> and add billable lines.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                padding: "var(--space-2)",
                marginBottom: "var(--space-2)",
                fontSize: "var(--text-sm)",
                color: "var(--color-danger)",
                background: "var(--color-red-50)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {error}
            </div>
          )}

          {expenses.length === 0 ? (
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              No unlinked material receipts match this client.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "var(--space-2)" }}>
              {expenses.map((expense) => {
                const skuLines = expense.line_items ?? [];
                const materialCost =
                  skuLines.length > 0
                    ? skuLines.reduce((s, li) => s + li.line_total_cents, 0)
                    : expense.amount_cents;
                const billCents = materialInvoiceTotalCents(materialCost, handlingRate);
                const label = materialExpenseDescription(expense);
                return (
                  <li key={expense.id}>
                    <label
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        alignItems: "flex-start",
                        fontSize: "var(--text-sm)",
                        cursor: pending ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(expense.id)}
                        onChange={() => toggle(expense.id)}
                        disabled={pending}
                        style={{ marginTop: 3 }}
                      />
                      <span style={{ flex: 1 }}>
                        <strong>{expense.vendor_name}</strong>
                        <span style={{ color: "var(--fg-muted)" }}>
                          {" "}
                          · {expense.expense_date.slice(0, 10)} · materials {formatCents(materialCost)}
                          {materialHandlingCents(materialCost, handlingRate) > 0 &&
                            ` + handling ${formatCents(materialHandlingCents(materialCost, handlingRate))}`}{" "}
                          = {formatCents(billCents)}
                        </span>
                        {skuLines.length > 0 ? (
                          <ul
                            style={{
                              margin: "4px 0 0",
                              paddingLeft: "1rem",
                              color: "var(--fg-muted)",
                              fontSize: "var(--text-xs)",
                            }}
                          >
                            {skuLines.map((li) => (
                              <li key={li.id}>
                                {li.name} · {formatLineQuantityDisplay(li.quantity)} ×{" "}
                                {formatCents(li.unit_cost_cents)} ={" "}
                                {formatCents(li.line_total_cents)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          label !== `Materials — ${expense.vendor_name}` && (
                            <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>{label}</div>
                          )
                        )}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          {expenses.length > 0 && (
            <div style={{ marginTop: "var(--space-3)", display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => void linkSelected()}
                disabled={pending || selected.size === 0}
                className="p7-btn p7-btn-primary p7-btn-sm"
                data-testid="link-forgotten-expenses-btn"
              >
                {pending ? "Linking…" : `Link & add to invoice (${selected.size})`}
              </button>
              <button
                type="button"
                onClick={() => void load()}
                disabled={pending}
                className="p7-btn p7-btn-ghost p7-btn-sm"
              >
                Refresh
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}