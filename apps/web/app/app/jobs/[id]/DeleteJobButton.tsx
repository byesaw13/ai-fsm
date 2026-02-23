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
        const data = await res.json();
        setError(data.error?.message ?? "Delete failed");
      } else {
        router.push("/app/jobs");
      }
    } catch {
      setError("Unexpected error");
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
        {loading ? "Deleting…" : "Delete Job"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Job?"
        body="This will permanently delete this job. This action cannot be undone."
        confirmLabel="Delete Job"
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
