"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EstimateStatus } from "@ai-fsm/domain";

interface Props {
  estimateId: string;
  allowedTransitions: EstimateStatus[];
  statusLabels: Record<EstimateStatus, string>;
}

export function EstimateTransitionForm({
  estimateId,
  allowedTransitions,
  statusLabels,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTransition(targetStatus: EstimateStatus) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/transition`, {
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
    <div className="transition-buttons" data-testid="transition-buttons">
      {error && <p className="error-inline">{error}</p>}
      {allowedTransitions.map((status) => (
        <button
          key={status}
          onClick={() => handleTransition(status)}
          disabled={loading}
          className="btn btn-secondary"
          data-testid={`transition-btn-${status}`}
        >
          → {statusLabels[status]}
        </button>
      ))}
    </div>
  );
}
