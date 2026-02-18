"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  estimateId: string;
}

/**
 * Convert approved estimate to draft invoice.
 * Idempotent — repeated clicks return the existing invoice.
 */
export function EstimateConvertButton({ estimateId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConvert() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Conversion failed");
        return;
      }
      const data = await res.json();
      // Navigate to the resulting invoice
      router.push(
        `/app/invoices/${data.invoice_id}` as `/app/invoices/${string}`
      );
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="convert-panel">
      {error && <p className="error-inline">{error}</p>}
      <button
        onClick={handleConvert}
        disabled={loading}
        className="btn btn-primary"
        data-testid="convert-estimate-btn"
      >
        {loading ? "Converting…" : "→ Convert to Invoice"}
      </button>
    </div>
  );
}
