"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";

interface Props {
  jobId: string;
}

export function DeleteJobButton({ jobId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg =
          data?.error?.message ??
          (res.status === 409
            ? "Only draft projects can be deleted."
            : res.status === 403
              ? "You do not have permission to delete this project."
              : "Failed to delete project. Try again or contact support.");
        setError(msg);
      } else {
        router.push("/app/jobs");
        router.refresh();
      }
    } catch {
      setError("Network error — check connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="delete-job-panel">
      {error && <p className="error-inline" data-testid="delete-job-error">{error}</p>}
      <Button
        variant="danger"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        data-testid="delete-job-btn"
      >
        {loading ? "Deleting…" : "Delete Project"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Project?"
        body="This will permanently delete this job. This action cannot be undone."
        confirmLabel="Delete Project"
        onConfirm={() => {
          setConfirmOpen(false);
          handleDelete();
        }}
        onCancel={() => setConfirmOpen(false)}
        loading={loading}
      />
    </div>
  );
}
