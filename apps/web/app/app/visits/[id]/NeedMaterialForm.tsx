"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";

interface Props {
  visitId: string;
  initialValue: string | null;
  canUpdate: boolean;
}

export function NeedMaterialForm({ visitId, initialValue, canUpdate }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [line, setLine] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const nextLine = line.trim();
    if (!nextLine) return;
    const next = [initialValue?.trim(), nextLine].filter(Boolean).join("\n");
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ materials_needed: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Could not save the material");
        return;
      }
      setLine("");
      toast.success("Added to this visit");
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="need-material">
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
