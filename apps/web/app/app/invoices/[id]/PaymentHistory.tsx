"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui";

interface PaymentRow {
  id: string;
  invoice_id: string;
  amount_cents: number;
  method: string;
  received_at: string;
  notes: string | null;
  created_by: string;
  created_at: string;
  created_by_name: string | null;
}

interface Props {
  invoiceId: string;
  invoiceStatus: string;
  role: string;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  check: "Check",
  card: "Card",
  transfer: "Transfer",
  other: "Other",
};

// Payments can be deleted by owner when invoice is not in a terminal state
const TERMINAL_STATUSES = new Set(["paid", "void"]);

export function PaymentHistory({ invoiceId, invoiceStatus, role }: Props) {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmPaymentId, setConfirmPaymentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const canDelete = role === "owner" && !TERMINAL_STATUSES.has(invoiceStatus);

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/payments`);
      if (!res.ok) {
        setError("Failed to load payments. Refresh the page to try again.");
        return;
      }
      const json = await res.json();
      setPayments(json.data ?? []);
    } catch {
      setError("Failed to load payments. Refresh the page to try again.");
    } finally {
      setLoading(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  async function handleDeleteConfirm() {
    if (!confirmPaymentId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/payments/${confirmPaymentId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to delete payment");
        return;
      }
      setConfirmPaymentId(null);
      await fetchPayments();
      router.refresh();
    } catch {
      setError("Failed to delete payment");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <p className="muted" data-testid="payment-history-loading" aria-busy="true" aria-live="polite">
        Loading payments…
      </p>
    );
  }

  if (error) {
    return <p className="error-inline" data-testid="payment-history-error" role="alert">{error}</p>;
  }

  if (payments.length === 0) {
    return (
      <p className="muted" data-testid="payment-history-empty">
        No payments recorded yet.
      </p>
    );
  }

  return (
    <>
      <table className="line-items-table" data-testid="payment-history-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Method</th>
            <th>Amount</th>
            <th>Notes</th>
            <th>Recorded By</th>
            {canDelete && <th style={{ width: 80 }}></th>}
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => {
            const displayNotes = payment.notes?.replace(/^\[idem:[^\]]+\]/, "") || "—";
            return (
              <tr key={payment.id} data-testid="payment-history-row">
                <td>{new Date(payment.received_at).toLocaleDateString()}</td>
                <td>{METHOD_LABELS[payment.method] ?? payment.method}</td>
                <td>{formatDollars(payment.amount_cents)}</td>
                <td>{displayNotes}</td>
                <td>{payment.created_by_name ?? "—"}</td>
                {canDelete && (
                  <td>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirmPaymentId(payment.id)}
                      data-testid={`delete-payment-${payment.id}`}
                      aria-label="Delete payment"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <ConfirmDialog
        open={confirmPaymentId !== null}
        title="Delete Payment"
        body="This will remove the payment and recalculate the invoice balance. This cannot be undone."
        confirmLabel="Delete Payment"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setConfirmPaymentId(null)}
        loading={deleting}
        data-testid="delete-payment-dialog"
      />
    </>
  );
}
