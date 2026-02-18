"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  invoiceId: string;
  remainingCents: number;
}

const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "check", label: "Check" },
  { value: "card", label: "Card" },
  { value: "transfer", label: "Transfer" },
  { value: "other", label: "Other" },
] as const;

export function RecordPaymentForm({ invoiceId, remainingCents }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const amountCents = Math.round(parseFloat(amount) * 100);

    if (isNaN(amountCents) || amountCents <= 0) {
      setError("Please enter a valid payment amount");
      setLoading(false);
      return;
    }

    if (amountCents > remainingCents) {
      setError(
        `Amount exceeds remaining balance of $${(remainingCents / 100).toFixed(2)}`
      );
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount_cents: amountCents,
          method,
          notes: notes.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error?.message ?? "Failed to record payment");
      } else {
        setSuccess(
          `Payment of $${(amountCents / 100).toFixed(2)} recorded successfully`
        );
        setAmount("");
        setNotes("");
        router.refresh();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} data-testid="record-payment-form">
      {error && <p className="error-inline">{error}</p>}
      {success && <p className="success-inline">{success}</p>}

      <div className="payment-form-fields">
        <div className="form-group">
          <label htmlFor="payment-amount">Amount ($)</label>
          <input
            id="payment-amount"
            type="number"
            step="0.01"
            min="0.01"
            max={(remainingCents / 100).toFixed(2)}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Max: $${(remainingCents / 100).toFixed(2)}`}
            required
            data-testid="payment-amount-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="payment-method">Method</label>
          <select
            id="payment-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="payment-select"
            data-testid="payment-method-select"
          >
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="payment-notes">Notes (optional)</label>
          <input
            id="payment-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Check #1234"
            data-testid="payment-notes-input"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="btn btn-primary"
        data-testid="record-payment-submit"
      >
        {loading ? "Recording..." : "Record Payment"}
      </button>
    </form>
  );
}
