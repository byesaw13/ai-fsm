"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  jobId: string;
}

export function DeleteJobButton({ jobId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (
      !window.confirm(
        "Delete this job permanently? This action cannot be undone."
      )
    ) {
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: "DELETE",
      });
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
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="btn btn-danger"
        data-testid="delete-job-btn"
      >
        {loading ? "Deleting…" : "Delete Job"}
      </button>
    </div>
  );
}
