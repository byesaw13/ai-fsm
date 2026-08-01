"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card, Button, useToast } from "@/components/ui";
import { formatCents } from "@ai-fsm/money";

type Suggestion = {
  job_id: string;
  client_id: string | null;
  job_number: string;
  supply_po: string;
  label: string;
  confidence: "exact";
};

type ReviewItem = {
  id: string;
  vendor_name: string;
  amount_cents: number;
  expense_date: string;
  notes: string | null;
  extracted_po: string | null;
  suggestion: Suggestion | null;
};

type OpenJob = {
  id: string;
  title: string;
  job_number: string | null;
  client_id: string | null;
  label: string;
};

export function ReceiptReviewClient() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [openJobs, setOpenJobs] = useState<OpenJob[]>([]);
  const [suggestedCount, setSuggestedCount] = useState(0);
  const [manualJob, setManualJob] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/expenses/receipt-review");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not load review queue");
        return;
      }
      setItems(json.data.items ?? []);
      setOpenJobs(json.data.open_jobs ?? []);
      setSuggestedCount(json.data.suggested_count ?? 0);
    } catch {
      toast.error("Network error loading review queue");
    } finally {
      setLoading(false);
    }
    // toast methods are stable enough for event use; omit from deps to avoid re-fetch loops
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only load
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function assign(expenseId: string, jobId: string, clientId: string | null) {
    setBusyId(expenseId);
    try {
      const res = await fetch("/api/v1/expenses/receipt-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expense_id: expenseId,
          job_id: jobId,
          client_id: clientId,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error?.message ?? "Could not link expense");
        return;
      }
      toast.success("Linked to project");
      setItems((prev) => prev.filter((i) => i.id !== expenseId));
      setSuggestedCount((c) => Math.max(0, c - 1));
    } catch {
      toast.error("Network error linking expense");
    } finally {
      setBusyId(null);
    }
  }

  function dismiss(expenseId: string) {
    setItems((prev) => {
      const row = prev.find((i) => i.id === expenseId);
      if (row?.suggestion) setSuggestedCount((c) => Math.max(0, c - 1));
      return prev.filter((i) => i.id !== expenseId);
    });
  }

  if (loading) {
    return (
      <Card>
        <p style={{ margin: 0, color: "var(--fg-muted)" }}>Loading unlinked materials receipts…</p>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card data-testid="receipt-review-empty">
        <p style={{ margin: 0, fontWeight: 700 }}>All caught up</p>
        <p style={{ margin: "8px 0 0", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          No unlinked materials expenses in the last 180 days. Use Supply PO at the store so new
          scans match automatically.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <p
        data-testid="receipt-review-summary"
        style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
      >
        {items.length} unlinked · {suggestedCount} with Supply PO match
      </p>

      {items.map((item) => {
        const chosen = manualJob[item.id] ?? item.suggestion?.job_id ?? "";
        const chosenJob = openJobs.find((j) => j.id === chosen);
        return (
          <Card key={item.id} data-testid={`receipt-review-row-${item.id}`}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "var(--space-3)",
                justifyContent: "space-between",
                alignItems: "flex-start",
              }}
            >
              <div style={{ minWidth: 200, flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  <Link
                    href={`/app/expenses/${item.id}` as Route}
                    style={{ color: "var(--accent)", textDecoration: "none" }}
                  >
                    {item.vendor_name}
                  </Link>
                  {" · "}
                  {formatCents(item.amount_cents)}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  {item.expense_date}
                  {item.extracted_po ? (
                    <>
                      {" · "}
                      <code
                        data-testid="receipt-review-po"
                        style={{
                          fontFamily: "ui-monospace, monospace",
                          fontWeight: 700,
                          color: "var(--fg)",
                        }}
                      >
                        {item.extracted_po}
                      </code>
                    </>
                  ) : (
                    " · no PO in notes"
                  )}
                </p>
                {item.notes ? (
                  <p
                    style={{
                      margin: "8px 0 0",
                      fontSize: "var(--text-xs)",
                      color: "var(--fg-muted)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {item.notes.length > 160 ? `${item.notes.slice(0, 160)}…` : item.notes}
                  </p>
                ) : null}
              </div>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minWidth: 240,
                  flex: "1 1 240px",
                }}
              >
                {item.suggestion ? (
                  <p
                    data-testid="receipt-review-suggestion"
                    style={{
                      margin: 0,
                      fontSize: "var(--text-sm)",
                      fontWeight: 600,
                      color: "var(--color-success, #16a34a)",
                    }}
                  >
                    Suggested: {item.suggestion.label}
                  </p>
                ) : (
                  <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    No Supply PO match — pick a project
                  </p>
                )}

                <select
                  aria-label="Project"
                  value={chosen}
                  onChange={(e) =>
                    setManualJob((m) => ({ ...m, [item.id]: e.target.value }))
                  }
                  style={{
                    padding: "8px 10px",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <option value="">Select project…</option>
                  {openJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.label}
                    </option>
                  ))}
                </select>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={!chosen || busyId === item.id}
                    loading={busyId === item.id}
                    onClick={() =>
                      void assign(
                        item.id,
                        chosen,
                        // Only the chosen job's client — never fall back to a discarded suggestion.
                        chosenJob?.client_id ?? null,
                      )
                    }
                    data-testid="receipt-review-accept"
                  >
                    Accept
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyId === item.id}
                    onClick={() => dismiss(item.id)}
                    data-testid="receipt-review-dismiss"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
