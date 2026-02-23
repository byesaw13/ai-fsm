"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { VisitStatus } from "@ai-fsm/domain";
import { Button, useToast } from "@/components/ui";

interface Props {
  visitId: string;
  allowedTransitions: VisitStatus[];
  statusLabels: Record<VisitStatus, string>;
}

export function VisitTransitionForm({
  visitId,
  allowedTransitions,
  statusLabels,
}: Props) {
  const router = useRouter();
  const toast = useToast();
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
        const message = data.error?.message ?? "Transition failed";
        setError(message);
        toast.error(message);
      } else {
        const message = `Status updated to ${statusLabels[targetStatus]}`;
        setSuccess(message);
        toast.success(message);
        router.refresh();
      }
    } catch {
      const message = "Unexpected error";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="visit-transition-buttons">
      {error && (
        <p className="p7-field-error" data-testid="visit-transition-error">
          {error}
        </p>
      )}
      {success && (
        <p className="success-inline" data-testid="visit-transition-success">
          {success}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {allowedTransitions.map((status) => (
          <Button
            key={status}
            onClick={() => handleTransition(status)}
            disabled={loading}
            variant={status === "cancelled" ? "danger" : "secondary"}
            size="sm"
            data-testid={`visit-transition-btn-${status}`}
          >
            {loading ? "Updating…" : `→ ${statusLabels[status]}`}
          </Button>
        ))}
      </div>
    </div>
  );
}
