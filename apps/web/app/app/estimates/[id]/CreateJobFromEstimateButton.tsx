"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  estimateId: string;
}

/**
 * Create a job from an approved estimate that has no linked job.
 * Idempotent on the server — a second click returns the existing job.
 */
export function CreateJobFromEstimateButton({ estimateId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/create-job`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Could not create job");
        return;
      }
      router.push(`/app/jobs/${data.job_id}` as `/app/jobs/${string}`);
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
      <button
        onClick={handleCreate}
        disabled={loading}
        data-testid="create-job-from-estimate-btn"
        style={{
          padding: "var(--space-2) var(--space-4)",
          background: "#059669",
          color: "#fff",
          border: "none",
          borderRadius: "var(--radius)",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
          whiteSpace: "nowrap",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Creating…" : "Create Linked Job →"}
      </button>
      {error && (
        <span style={{ color: "#dc2626", fontSize: "var(--text-sm)" }} data-testid="create-job-error">
          {error}
        </span>
      )}
    </span>
  );
}
