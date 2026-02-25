"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface InvoiceEditFormProps {
  invoiceId: string;
  initialNotes: string | null;
  initialDueDate: string | null;
}

// "2024-01-15T00:00:00.000Z" → "2024-01-15"
function isoToDateString(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function InvoiceEditForm({ invoiceId, initialNotes, initialDueDate }: InvoiceEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [dueDate, setDueDate] = useState(isoToDateString(initialDueDate));

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
