"use client";

import { useState, useEffect } from "react";
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
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleTransition(targetStatus: EstimateStatus) {
    setLoading(true);
    setError("");
    setSuccess("");
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
        setSuccess(`Status updated to ${statusLabels[targetStatus]}`);
        router.refresh();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  const actionLabel = (status: EstimateStatus): string => {
    switch (status) {
      case "approved":
        return "Mark as Approved";
      case "declined":
        return "Mark as Declined";
      case "expired":
        return "Mark as Expired";
      default:
        return `→ ${statusLabels[status]}`;
    }
  };

  return (
    <div className="transition-buttons" data-testid="transition-buttons" style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {error && <p className="error-inline" data-testid="estimate-transition-error">{error}</p>}
      {success && <p className="success-inline" data-testid="estimate-transition-success">{success}</p>}
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        Manual status for offline approvals. Approving creates the materials deposit invoice and project handoff.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {allowedTransitions.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => handleTransition(status)}
            disabled={loading}
            className={status === "approved" ? "btn btn-primary" : "btn btn-secondary"}
            data-testid={`transition-btn-${status}`}
            style={
              status === "approved"
                ? {
                    padding: "8px 16px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--accent)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "var(--text-sm)",
                    cursor: loading ? "not-allowed" : "pointer",
                    opacity: loading ? 0.7 : 1,
                  }
                : undefined
            }
          >
            {loading ? "Updating…" : actionLabel(status)}
          </button>
        ))}
      </div>
    </div>
  );
}
