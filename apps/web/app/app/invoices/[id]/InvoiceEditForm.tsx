"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { formatCents } from "@ai-fsm/money";

interface InvoiceEditFormProps {
  invoiceId: string;
  initialNotes: string | null;
  initialDueDate: string | null;
  /** TASK-157: room-by-room "Work completed" text shown to the client. */
  initialWorkSummary?: string | null;
  /** Draft built from the job's done tasks, offered by "Build from completed tasks". */
  suggestedWorkSummary?: string;
  initialShowItemized?: boolean;
  /** Billable receipts total for the job (null = invoice has no job). */
  itemizedTotalCents?: number | null;
  itemizedReceiptCount?: number;
  /** Sum of this invoice's materials lines, to reconcile against receipts. */
  materialsBilledCents?: number;
}

// "2024-01-15T00:00:00.000Z" → "2024-01-15"
function isoToDateString(iso: string | Date | null): string {
  if (!iso) return "";
  const str = iso instanceof Date ? iso.toISOString() : iso;
  return str.slice(0, 10);
}

export function InvoiceEditForm({
  invoiceId,
  initialNotes,
  initialDueDate,
  initialWorkSummary = null,
  suggestedWorkSummary = "",
  initialShowItemized = false,
  itemizedTotalCents = null,
  itemizedReceiptCount = 0,
  materialsBilledCents = 0,
}: InvoiceEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [dueDate, setDueDate] = useState(isoToDateString(initialDueDate));
  const [workSummary, setWorkSummary] = useState(initialWorkSummary ?? "");
  const [showItemized, setShowItemized] = useState(initialShowItemized);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          due_date: dueDate ? new Date(dueDate).toISOString() : null,
          work_summary: workSummary.trim() || null,
          show_itemized_receipts: showItemized,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to update invoice");
        return;
      }
      toast.success("Invoice updated");
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card action-card" data-testid="invoice-edit-form">
      <h2>Edit Invoice</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="invoice-due-date">Due Date</label>
          <input
            id="invoice-due-date"
            type="date"
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="form-field">
          <label htmlFor="invoice-notes">Notes</label>
          <textarea
            id="invoice-notes"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Client-visible notes"
            disabled={pending}
          />
        </div>
        <div className="form-field">
          <label htmlFor="invoice-work-summary">Work completed (shown to client, by area)</label>
          <textarea
            id="invoice-work-summary"
            rows={Math.min(18, Math.max(4, workSummary.split("\n").length + 1))}
            value={workSummary}
            onChange={e => setWorkSummary(e.target.value)}
            placeholder={"Kitchen\n• Repaired and repainted ceiling\n\nMain bath\n• Installed new vanity"}
            disabled={pending}
            data-testid="invoice-work-summary"
          />
          {suggestedWorkSummary && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ marginTop: "var(--space-2)" }}
              onClick={() => {
                if (workSummary.trim() && !window.confirm("Replace the current text with the completed tasks?")) return;
                setWorkSummary(suggestedWorkSummary);
              }}
              disabled={pending}
              data-testid="build-work-summary-btn"
            >
              Build from completed tasks
            </button>
          )}
        </div>
        {itemizedTotalCents !== null && (
          <div className="form-field">
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
              <input
                type="checkbox"
                checked={showItemized}
                onChange={e => setShowItemized(e.target.checked)}
                disabled={pending}
                data-testid="invoice-show-itemized"
              />
              Show client an itemized receipts link
            </label>
            <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
              Billable receipts: {formatCents(itemizedTotalCents)} ({itemizedReceiptCount}) · Materials on this invoice:{" "}
              {formatCents(materialsBilledCents)}
              {itemizedTotalCents !== materialsBilledCents && " — these differ; check the receipts' Bill checkboxes or the materials lines."}
            </p>
          </div>
        )}
        {error && <p className="error-inline" role="alert">{error}</p>}
        <div className="form-actions">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={pending}
            data-testid="save-invoice-edit-btn"
          >
            {pending ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
