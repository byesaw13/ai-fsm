"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelVisitButton({ visitId }: { visitId: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleCancel() {
    if (!confirm("Cancel this visit?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error?.message ?? "Failed to cancel visit");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleCancel}
      disabled={loading}
      style={{
        fontSize: "var(--text-xs)",
        padding: "2px 8px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border)",
        background: "transparent",
        color: "var(--color-text-muted)",
        cursor: loading ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
      }}
    >
      {loading ? "…" : "Cancel"}
    </button>
  );
}
