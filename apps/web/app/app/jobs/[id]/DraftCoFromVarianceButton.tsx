"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CoDraftPayload } from "@/lib/jobs/job-ledger-co-draft";

type Props = {
  payload: CoDraftPayload;
  disabled?: boolean;
};

export function DraftCoFromVarianceButton({ payload, disabled }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (saving || disabled) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/change-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        id?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? `Failed (${res.status})`);
        setSaving(false);
        return;
      }
      // API may return { data: { id } } or { id }
      const coId = json.data?.id ?? json.id;
      router.push(`/app/estimates/${payload.estimate_id}#change-orders`);
      router.refresh();
      if (!coId) {
        // Still navigated to estimate CO section
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create change order");
      setSaving(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        data-testid="draft-co-from-variance"
        onClick={onClick}
        disabled={saving || disabled}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderRadius: "var(--radius)",
          border: "1px solid var(--accent)",
          background: "var(--accent)",
          color: "var(--accent-fg, #fff)",
          fontWeight: 700,
          fontSize: "var(--text-sm)",
          cursor: saving || disabled ? "not-allowed" : "pointer",
          opacity: saving || disabled ? 0.65 : 1,
        }}
      >
        {saving ? "Creating draft…" : "Draft CO from variance"}
      </button>
      {error ? (
        <p
          role="alert"
          style={{ margin: "6px 0 0", color: "var(--color-error, #b91c1c)", fontSize: "var(--text-xs)" }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
