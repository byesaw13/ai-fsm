"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  estimateId: string;
}

export function DeleteEstimateButton({ estimateId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this estimate permanently? This action cannot be undone."
      )
    ) {
      return;
    }
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
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="btn btn-danger"
        data-testid="delete-estimate-btn"
      >
        {loading ? "Deleting…" : "Delete Estimate"}
      </button>
    </div>
  );
}
