"use client";

import { useState } from "react";
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

  async function handleTransition(targetStatus: InvoiceStatus) {
    setLoading(true);
    setError("");
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
      {error && <p className="error-inline">{error}</p>}
      {allowedTransitions.map((status) => (
        <button
          key={status}
          onClick={() => handleTransition(status)}
          disabled={loading}
          className="btn btn-secondary"
          data-testid={`invoice-transition-btn-${status}`}
        >
          → {statusLabels[status]}
        </button>
      ))}
    </div>
  );
}
