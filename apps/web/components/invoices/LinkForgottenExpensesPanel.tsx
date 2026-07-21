"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@ai-fsm/money";
import {
  materialExpenseDescription,
  materialHandlingCents,
  materialInvoiceTotalCents,
  type LinkableMaterialExpense,
} from "@/lib/invoices/material-handling";
import { formatLineQuantityDisplay } from "@/lib/invoices/quantity";
import { extractReceiptPo, receiptMatchesPoQuery } from "@/lib/invoices/receipt-po";

type Mode = "invoice" | "job";

interface Props {
  mode: Mode;
  jobId: string;
  /** Required when mode === "invoice" */
  invoiceId?: string;
  /** Invoice only; default 15 */
  handlingPct?: number;
}

function PoTag({ notes }: { notes: string | null }) {
  const po = extractReceiptPo(notes);
  if (!po) return null;
  return (
    <span
      data-testid="receipt-po-tag"
      title={`PO / job tag: ${po}`}
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 6px",
        borderRadius: 4,
        fontSize: "var(--text-xs)",
        fontWeight: 700,
        letterSpacing: "0.02em",
        color: "var(--accent, #166534)",
        background: "var(--bg-subtle, #f0fdf4)",
        border: "1px solid var(--border)",
        verticalAlign: "middle",
      }}
    >
      PO {po}
    </span>
  );
}

function ReceiptSearch({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: 4,
        marginBottom: "var(--space-2)",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        color: "var(--fg-muted)",
      }}
    >
      <span>Filter by PO, vendor, or notes</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="e.g. SWIFT LANE, PO 12345, Home Depot"
        data-testid="receipt-po-filter"
        style={{
          width: "100%",
          padding: "8px 10px",
          borderRadius: 6,
          border: "1px solid var(--border)",
          fontSize: "var(--text-sm)",
          fontWeight: 400,
          color: "var(--fg)",
          background: "var(--bg-card, #fff)",
        }}
      />
    </label>
  );
}

export function LinkForgottenExpensesPanel({
  mode,
  jobId,
  invoiceId,
  handlingPct = 15,
}: Props) {
  const isInvoice = mode === "invoice";
  const handlingRate = handlingPct / 100;
  const router = useRouter();
  const [expenses, setExpenses] = useState<LinkableMaterialExpense[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [expanded, setExpanded] = useState(!isInvoice);
  const [poFilter, setPoFilter] = useState("");

  const listUrl = isInvoice
    ? `/api/v1/invoices/${invoiceId}/linkable-expenses`
    : `/api/v1/jobs/${jobId}/linkable-expenses`;
  const linkUrl = isInvoice
    ? `/api/v1/invoices/${invoiceId}/link-expenses`
    : `/api/v1/jobs/${jobId}/link-expenses`;

  const filteredExpenses = useMemo(
    () => expenses.filter((e) => receiptMatchesPoQuery(e, poFilter)),
    [expenses, poFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(listUrl);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExpenses([]);
        if (isInvoice) {
          setError(json.error?.message ?? "Could not load forgotten receipts");
        }
        return;
      }
      const rows = (json.data?.expenses ?? []) as LinkableMaterialExpense[];
      setExpenses(rows);
      if (isInvoice && rows.length > 0) {
        setExpanded(true);
        // Pre-select receipts already on this job (ready to bill); leave orphans unchecked.
        setSelected(new Set(rows.filter((e) => e.already_on_job).map((e) => e.id)));
      }
    } catch {
      setError(
        isInvoice ? "Network error loading receipts" : "Could not load unlinked receipts",
      );
    } finally {
      setLoading(false);
    }
  }, [listUrl, isInvoice]);

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
    if (!isInvoice) setSuccess("");
    try {
      const res = await fetch(linkUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expense_ids: [...selected] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to link receipts");
        return;
      }
      if (!isInvoice) {
        const count = (json.data?.linked ?? []).length;
        setSuccess(`${count} receipt${count === 1 ? "" : "s"} linked to this job.`);
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
  if (isInvoice) {
    if (expenses.length === 0 && !error) return null;
  } else if (expenses.length === 0 && !success) {
    return null;
  }

  if (isInvoice) {
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
            Material receipts
            {expenses.length > 0 && (
              <span style={{ marginLeft: 8, color: "var(--fg-muted)", fontWeight: 400 }}>
                (
                {expenses.filter((e) => e.already_on_job).length} on job
                {expenses.some((e) => !e.already_on_job)
                  ? `, ${expenses.filter((e) => !e.already_on_job).length} unlinked`
                  : ""}
                )
              </span>
            )}
          </span>
          <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        </button>

        {expanded && (
          <div style={{ marginTop: "var(--space-3)" }}>
            <p
              style={{
                margin: "0 0 var(--space-2)",
                fontSize: "var(--text-xs)",
                color: "var(--fg-muted)",
              }}
            >
              Select past material receipts to add as invoice line items. Job receipts are
              pre-selected; unlinked client receipts can be attached at the same time. Filter by
              PO / Home Depot job tag when notes include one. Or use{" "}
              <strong>Pull materials from job receipts</strong> below for one-click.
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
                No unbilled material receipts for this job or client.
              </p>
            ) : (
              <>
                <ReceiptSearch
                  value={poFilter}
                  onChange={setPoFilter}
                  disabled={pending}
                />
                {filteredExpenses.length === 0 ? (
                  <p
                    style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
                    data-testid="receipt-po-filter-empty"
                  >
                    No receipts match “{poFilter.trim()}”.
                  </p>
                ) : (
                  <ul
                    style={{
                      listStyle: "none",
                      margin: 0,
                      padding: 0,
                      display: "grid",
                      gap: "var(--space-2)",
                    }}
                  >
                    {filteredExpenses.map((expense) => {
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
                              <PoTag notes={expense.notes} />
                              <span style={{ color: "var(--fg-muted)" }}>
                                {" "}
                                · {expense.expense_date.slice(0, 10)} ·{" "}
                                {expense.already_on_job ? "on job" : "unlinked"} · materials{" "}
                                {formatCents(materialCost)}
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
                                  <div
                                    style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}
                                  >
                                    {label}
                                  </div>
                                )
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {expenses.length > 0 && (
              <div
                style={{
                  marginTop: "var(--space-3)",
                  display: "flex",
                  gap: "var(--space-2)",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => void linkSelected()}
                  disabled={pending || selected.size === 0}
                  className="p7-btn p7-btn-primary p7-btn-sm"
                  data-testid="link-forgotten-expenses-btn"
                >
                  {pending
                    ? "Adding…"
                    : `Add selected as line items (${selected.size})`}
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

  // Job mode — collapsed by default under Materials; only renders when there
  // are unlinked client receipts. Keeps the project page clean.
  return (
    <details
      data-testid="job-link-forgotten-expenses"
      style={{
        marginTop: "var(--space-3)",
        paddingTop: "var(--space-2)",
        borderTop: "1px solid var(--border-subtle, var(--border))",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          fontWeight: 600,
          fontSize: "var(--text-sm)",
          color: "var(--fg-muted)",
          listStyle: "none",
        }}
      >
        Link unassigned receipts
        <span style={{ marginLeft: 8, fontWeight: 400 }}>
          ({expenses.length})
        </span>
      </summary>

      <div style={{ marginTop: "var(--space-2)" }}>
        <p
          style={{
            margin: "0 0 var(--space-2)",
            fontSize: "var(--text-xs)",
            color: "var(--fg-muted)",
          }}
        >
          Material receipts for this client that aren’t on a project yet. Attach
          here before invoicing. Search by PO or Home Depot job tag when present.
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
        {success && (
          <div
            role="status"
            style={{
              padding: "var(--space-2)",
              marginBottom: "var(--space-2)",
              fontSize: "var(--text-sm)",
              color: "var(--color-green-700)",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
            }}
          >
            {success}
          </div>
        )}

        {expenses.length > 0 && (
          <ReceiptSearch value={poFilter} onChange={setPoFilter} disabled={pending} />
        )}

        {filteredExpenses.length === 0 && expenses.length > 0 ? (
          <p
            style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
            data-testid="receipt-po-filter-empty"
          >
            No receipts match “{poFilter.trim()}”.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "grid",
              gap: "var(--space-2)",
            }}
          >
            {filteredExpenses.map((expense) => (
              <li key={expense.id}>
                <label
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    fontSize: "var(--text-sm)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(expense.id)}
                    onChange={() => toggle(expense.id)}
                    disabled={pending}
                  />
                  <span>
                    <strong>{expense.vendor_name}</strong>
                    <PoTag notes={expense.notes} />
                    <span style={{ color: "var(--fg-muted)" }}>
                      {" "}
                      · {expense.expense_date.slice(0, 10)} · {formatCents(expense.amount_cents)}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

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
      </div>
    </details>
  );
}
