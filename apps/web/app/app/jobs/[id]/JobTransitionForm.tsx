"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { JobStatus } from "@ai-fsm/domain";
import { Button, ConfirmDialog } from "@/components/ui";

const DANGER_TRANSITIONS: JobStatus[] = ["cancelled"];

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  completed: "Complete & Invoice",
  invoiced: "Mark as Invoiced",
  cancelled: "Cancel Job",
  scheduled: "Mark as Scheduled",
  in_progress: "Mark In Progress",
};

interface Props {
  jobId: string;
  allowedTransitions: JobStatus[];
  statusLabels: Record<JobStatus, string>;
  /** When completing, open create-invoice if no draft was produced. */
  clientId?: string | null;
  approvedEstimateId?: string | null;
  /** When true, Complete won't create a second invoice — label as Complete project. */
  hasExistingFinalInvoice?: boolean;
}

export function JobTransitionForm({
  jobId,
  allowedTransitions,
  statusLabels,
  clientId,
  approvedEstimateId,
  hasExistingFinalInvoice = false,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [warning, setWarning] = useState("");
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
    setWarning("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = (await res.json()) as {
        error?: { message?: string };
        warning?: string;
        final_invoice_id?: string | null;
      };
      if (!res.ok) {
        setError(data.error?.message ?? "Transition failed");
        return;
      }

      if (data.warning) setWarning(data.warning);

      // Complete & Invoice: land on the draft (or existing) invoice ready to deliver.
      if (targetStatus === "completed") {
        if (data.final_invoice_id) {
          router.push(`/app/invoices/${data.final_invoice_id}?deliver=1`);
          return;
        }
        // No invoice yet (no billable actuals) — open create form for the project.
        const cq = clientId ? `&client_id=${clientId}` : "";
        const eq = approvedEstimateId
          ? `&approved_estimate_id=${approvedEstimateId}`
          : "";
        router.push(`/app/invoices/new?job_id=${jobId}${cq}${eq}`);
        return;
      }

      setSuccess(`Status updated to ${statusLabels[targetStatus]}`);
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="transition-buttons" data-testid="transition-buttons">
      {error && <p className="error-inline" data-testid="transition-error">{error}</p>}
      {warning && <p className="warning-inline" data-testid="transition-warning">{warning}</p>}
      {success && <p className="success-inline" data-testid="transition-success">{success}</p>}
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        {allowedTransitions.map((status) => (
          <Button
            key={status}
            onClick={() => handleTransition(status)}
            disabled={loading}
            variant={
              DANGER_TRANSITIONS.includes(status)
                ? "danger"
                : status === "completed"
                  ? "primary"
                  : "secondary"
            }
            size="sm"
            data-testid={`transition-btn-${status}`}
          >
            {loading
              ? "Updating…"
              : status === "completed" && hasExistingFinalInvoice
                ? "Complete project"
                : (ACTION_LABELS[status] ?? `→ ${statusLabels[status]}`)}
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
