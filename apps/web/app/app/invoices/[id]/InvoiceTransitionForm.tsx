"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { InvoiceStatus } from "@ai-fsm/domain";

interface Props {
  invoiceId: string;
  allowedTransitions: InvoiceStatus[];
  statusLabels: Record<InvoiceStatus, string>;
}

export function InvoiceTransitionForm({
  invoiceId,
  allowedTransitions,
  statusLabels,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleTransition(targetStatus: InvoiceStatus) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Transition failed");
      } else {
        setSuccess(`Status updated to ${statusLabels[targetStatus]}`);
        router.refresh();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="transition-buttons" data-testid="invoice-transition-buttons">
      {error && <p className="error-inline" data-testid="invoice-transition-error">{error}</p>}
      {success && <p className="success-inline" data-testid="invoice-transition-success">{success}</p>}
      {allowedTransitions.map((status) => (
        <button
          key={status}
          onClick={() => handleTransition(status)}
          disabled={loading}
          className="btn btn-secondary"
          data-testid={`invoice-transition-btn-${status}`}
        >
          {loading ? "Updating…" : `→ ${statusLabels[status]}`}
        </button>
      ))}
    </div>
  );
}
