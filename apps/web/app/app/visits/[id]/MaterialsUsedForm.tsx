"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

import { useFieldDraft } from "@/components/features/field/useFieldDraft";

interface Props {
  draftKey?: string;
  visitId: string;
  initialValue: string | null;
  canUpdate: boolean;
}

export function MaterialsUsedForm({ draftKey, visitId, initialValue, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue, clearDraft, conflictingDraft] = useFieldDraft(draftKey, initialValue ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleBlur() {
    const trimmed = value.trim() || null;
    if (trimmed === (initialValue?.trim() || null)) return;

    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_used: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Could not save. Retry below.");
        return;
      }
      clearDraft();
      toast.success("Materials saved");
      router.refresh();
    } catch {
      setError("Could not save. Your draft is kept; retry below.");
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
      {conflictingDraft !== undefined ? <div role="status">
        <p>Saved materials changed. Your earlier draft is kept here:</p>
        <p style={{ whiteSpace: "pre-wrap" }}>{conflictingDraft}</p>
        <Button type="button" variant="secondary" onClick={() => setValue(conflictingDraft)}>Restore my draft</Button>
      </div> : null}
      <textarea
        className="p7-textarea"
        aria-label="Materials used"
        rows={4}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        placeholder={
          "List materials used on this visit, one per line.\nExample:\n  2 gal Benjamin Moore Regal Select (White)\n  1 roll blue painter's tape"
        }
        data-testid="materials-used-textarea"
      />
      {error && <p role="alert" className="p7-field-error">{error}</p>}
      <Button type="button" disabled={saving} onClick={() => void handleBlur()}>Save materials</Button>
      {saving && (
        <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)", marginTop: 4 }}>
          Saving…
        </p>
      )}
    </div>
  );
}
