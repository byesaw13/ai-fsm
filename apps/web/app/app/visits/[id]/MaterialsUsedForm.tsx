"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface Props {
  visitId: string;
  initialValue: string | null;
  canUpdate: boolean;
}

export function MaterialsUsedForm({ visitId, initialValue, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const trimmed = value.trim() || null;
    if (trimmed === (initialValue?.trim() || null)) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_used: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error?.message ?? "Failed to save");
        return;
      }
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  if (!canUpdate) {
    return value ? (
      <p style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)" }} data-testid="materials-used-text">
        {value}
      </p>
    ) : (
      <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
        None recorded.
      </p>
    );
  }

  return (
    <div data-testid="materials-used-form">
      <textarea
        className="p7-textarea"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        disabled={saving}
        placeholder={
          "List materials used on this visit, one per line.\nExample:\n  2 gal Benjamin Moore Regal Select (White)\n  1 roll blue painter's tape"
        }
        data-testid="materials-used-textarea"
      />
      {saving && (
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>
          Saving…
        </p>
      )}
    </div>
  );
}
