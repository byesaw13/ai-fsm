"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  visitId: string;
  initialNotes: string;
}

export function VisitNotesForm({ visitId, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

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
        setError(data.error?.message ?? "Save failed");
      } else {
        setSaved(true);
        router.refresh();
      }
    } catch {
      setError("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} data-testid="visit-notes-form">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={4}
        placeholder="Add notes about this visit..."
        className="notes-textarea"
        data-testid="visit-notes-input"
      />
      {error && <p className="error-inline">{error}</p>}
      {saved && <p className="success-inline">Notes saved.</p>}
      <button
        type="submit"
        disabled={saving}
        className="btn btn-primary"
        data-testid="save-notes-btn"
      >
        {saving ? "Saving..." : "Save Notes"}
      </button>
    </form>
  );
}
