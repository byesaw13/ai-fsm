"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Textarea, useToast } from "@/components/ui";
import { PhotoGrid } from "./PhotoGrid";

interface PhotoMeta {
  id: string;
  original_name: string;
  created_at: string;
}

interface Props {
  visitId: string;
  initialNotes: string | null;
  initialPhotos: PhotoMeta[];
  canUpdate: boolean;
  canDelete: boolean;
}

export function VisitResolutionPanel({
  visitId,
  initialNotes,
  initialPhotos,
  canUpdate,
  canDelete,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tech_notes: notes || null }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error?.message ?? "Save failed");
      }
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginBottom: "var(--space-3)" }}>
        Describe what was done and add after photos.
      </p>
      <form onSubmit={handleSave} style={{ marginBottom: "var(--space-4)" }}>
        <Textarea
          id="resolution-notes"
          label="Resolution / Remedy"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="Describe what was done to resolve the issue…"
          disabled={saving || !canUpdate}
        />
        {saved && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-success)", margin: "var(--space-1) 0" }}>
            Saved.
          </p>
        )}
        {canUpdate && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
            <button
              type="submit"
              disabled={saving}
              className="p7-btn p7-btn-primary p7-btn-sm"
            >
              {saving ? "Saving…" : "Save Resolution"}
            </button>
          </div>
        )}
      </form>
      <div>
        <p style={{ fontSize: "var(--text-sm)", fontWeight: 500, marginBottom: "var(--space-2)" }}>After Photos</p>
        <PhotoGrid
          visitId={visitId}
          category="after"
          initialPhotos={initialPhotos}
          canUpload={canUpdate}
          canDelete={canDelete}
        />
      </div>
    </div>
  );
}
