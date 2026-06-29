"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ConfirmDialog } from "@/components/ui";

interface Props {
  estimateId: string;
}

export function DeleteEstimateButton({ estimateId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function handleDelete() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Delete failed");
      } else {
        router.push("/app/estimates");
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div data-testid="delete-estimate-panel">
      {error && <p className="error-inline" data-testid="delete-estimate-error">{error}</p>}
      <Button
        variant="danger"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
        data-testid="delete-estimate-btn"
      >
        {loading ? "Deleting…" : "Delete Estimate"}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete Estimate?"
        body="This will permanently delete this estimate. This action cannot be undone."
        confirmLabel="Delete Estimate"
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
