"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea, useToast } from "@/components/ui";

interface Props {
  visitId: string;
  initialNotes: string;
}

export function VisitNotesForm({ visitId, initialNotes }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tech_notes: notes }),
      });
      if (!res.ok) {
        const data = await res.json();
        const message = data.error?.message ?? "Save failed";
        setError(message);
        toast.error(message);
      } else {
        setSaved(true);
        toast.success("Visit notes saved.");
        router.refresh();
      }
    } catch {
      const message = "Unexpected error";
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} data-testid="visit-notes-form">
      <Textarea
        id="visit-notes-input"
        label="Tech Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={5}
        placeholder="Add notes about this visit..."
        disabled={saving}
        data-testid="visit-notes-input"
      />
      {error && <p className="p7-field-error">{error}</p>}
      {saved && (
        <p className="success-inline" data-testid="notes-saved-msg">
          Notes saved.
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-3)" }}>
        <Button
          type="submit"
          disabled={saving}
          loading={saving}
          data-testid="save-notes-btn"
        >
          {saving ? "Saving..." : "Save Notes"}
        </Button>
      </div>
    </form>
  );
}
