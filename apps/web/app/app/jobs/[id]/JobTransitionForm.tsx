"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@ai-fsm/domain";
import { Button, ConfirmDialog } from "@/components/ui";

const DANGER_TRANSITIONS: JobStatus[] = ["cancelled"];

interface Props {
  jobId: string;
  allowedTransitions: JobStatus[];
  statusLabels: Record<JobStatus, string>;
}

export function JobTransitionForm({ jobId, allowedTransitions, statusLabels }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [confirmTarget, setConfirmTarget] = useState<JobStatus | null>(null);

  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => setSuccess(""), 3000);
    return () => clearTimeout(t);
  }, [success]);

  async function handleTransition(targetStatus: JobStatus) {
    if (DANGER_TRANSITIONS.includes(targetStatus)) {
      setConfirmTarget(targetStatus);
      return;
    }
    await doTransition(targetStatus);
  }

  async function doTransition(targetStatus: JobStatus) {
    setLoading(true);
    setError("");
    setSuccess("");
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
    <div className="transition-buttons" data-testid="transition-buttons">
      {error && <p className="error-inline" data-testid="transition-error">{error}</p>}
      {success && <p className="success-inline" data-testid="transition-success">{success}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {allowedTransitions.map((status) => (
          <Button
            key={status}
            onClick={() => handleTransition(status)}
            disabled={loading}
            variant={DANGER_TRANSITIONS.includes(status) ? "danger" : "secondary"}
            size="sm"
            data-testid={`transition-btn-${status}`}
          >
            {loading ? "Updating…" : `→ ${statusLabels[status]}`}
          </Button>
        ))}
      </div>

      {confirmTarget && (
        <ConfirmDialog
          open
          title={`Mark as ${statusLabels[confirmTarget]}?`}
          body={`Are you sure you want to mark this job as "${statusLabels[confirmTarget]}"? This action may be difficult to reverse.`}
          confirmLabel={`Mark ${statusLabels[confirmTarget]}`}
          onConfirm={() => {
            const target = confirmTarget;
            setConfirmTarget(null);
            if (target) void doTransition(target);
          }}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  );
}
