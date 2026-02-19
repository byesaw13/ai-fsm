"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { VisitStatus } from "@ai-fsm/domain";

interface Props {
  visitId: string;
  allowedTransitions: VisitStatus[];
  statusLabels: Record<VisitStatus, string>;
}

export function VisitTransitionForm({ visitId, allowedTransitions, statusLabels }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleTransition(targetStatus: VisitStatus) {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
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
    <div className="transition-buttons" data-testid="visit-transition-buttons">
      {error && <p className="error-inline" data-testid="visit-transition-error">{error}</p>}
      {success && <p className="success-inline" data-testid="visit-transition-success">{success}</p>}
      {allowedTransitions.map((status) => (
        <button
          key={status}
          onClick={() => handleTransition(status)}
          disabled={loading}
          className="btn btn-secondary"
          data-testid={`visit-transition-btn-${status}`}
        >
          {loading ? "Updating…" : `→ ${statusLabels[status]}`}
        </button>
      ))}
    </div>
  );
}
