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

export function NeedMaterialForm({ draftKey, visitId, initialValue, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [line, setLine, clearDraft] = useFieldDraft(draftKey, "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const nextLine = line.trim();
    if (!nextLine) return;
    const next = [initialValue?.trim(), nextLine].filter(Boolean).join("\n");
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_needed: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error?.message ?? "Could not save the material. Your draft is kept; retry.");
        return;
      }
      clearDraft();
      setLine("");
      clearDraft();
      toast.success("Added to this visit");
      router.refresh();
    } catch {
      setError("Could not save. Your draft is kept; retry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="need-material">
      {error && <p role="alert" className="p7-field-error">{error}</p>}
      {initialValue?.trim() ? (
        <p style={{ whiteSpace: "pre-wrap", fontSize: "var(--font-size-sm)", marginTop: 0 }} data-testid="materials-needed-text">
          {initialValue}
        </p>
      ) : (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: 0 }}>
          Nothing needed beyond what is already on the job.
        </p>
      )}
      {canUpdate && (
        <form onSubmit={add} style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <input
            value={line}
            onChange={(e) => setLine(e.target.value)}
            placeholder="Need another 12-foot 1×4"
            disabled={saving}
            aria-label="Material to get"
            data-testid="need-material-input"
            style={{ flex: 1 }}
          />
          <Button type="submit" size="sm" disabled={saving || !line.trim()}>
            Need material
          </Button>
        </form>
      )}
    </div>
  );
}
