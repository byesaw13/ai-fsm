"use client";

import { useEffect, useState } from "react";

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

export function PaymentHistory({ invoiceId }: Props) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function fetchPayments() {
      try {
        const res = await fetch(`/api/v1/invoices/${invoiceId}/payments`);
        if (!res.ok) {
          setError("Failed to load payments");
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setPayments(json.data ?? []);
        }
      } catch {
        if (!cancelled) setError("Failed to load payments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPayments();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (loading) {
    return <p className="muted" data-testid="payment-history-loading">Loading payments...</p>;
  }

  if (error) {
    return <p className="error-inline" data-testid="payment-history-error">{error}</p>;
  }

  if (payments.length === 0) {
    return (
      <p className="muted" data-testid="payment-history-empty">
        No payments recorded yet.
      </p>
    );
  }

  return (
    <table className="line-items-table" data-testid="payment-history-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>Method</th>
          <th>Amount</th>
          <th>Notes</th>
          <th>Recorded By</th>
        </tr>
      </thead>
      <tbody>
        {payments.map((payment) => {
          // Strip idempotency key prefix from display
          const displayNotes = payment.notes?.replace(/^\[idem:[^\]]+\]/, "") || "—";
          return (
            <tr key={payment.id} data-testid="payment-history-row">
              <td>{new Date(payment.received_at).toLocaleDateString()}</td>
              <td>{METHOD_LABELS[payment.method] ?? payment.method}</td>
              <td>{formatDollars(payment.amount_cents)}</td>
              <td>{displayNotes}</td>
              <td>{payment.created_by_name ?? "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
