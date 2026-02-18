"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@ai-fsm/domain";

interface Props {
  jobId: string;
  allowedTransitions: JobStatus[];
  statusLabels: Record<JobStatus, string>;
}

export function JobTransitionForm({ jobId, allowedTransitions, statusLabels }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTransition(targetStatus: JobStatus) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/transition`, {
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
