"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  estimateId: string;
  initialNotes: string | null;
}

export function EstimateInternalNotesForm({ estimateId, initialNotes }: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes ?? "");
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
      const res = await fetch(`/api/v1/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal_notes: notes }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to save notes");
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
    <form onSubmit={handleSave} data-testid="internal-notes-form">
      <div className="form-field">
        <label htmlFor="internal-notes">Internal Notes</label>
        <textarea
          id="internal-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Private notes (not visible to client)"
          data-testid="internal-notes-input"
        />
      </div>
      {error && <p className="error-inline">{error}</p>}
      {saved && <p className="success-inline" data-testid="notes-saved-msg">Saved.</p>}
      <button
        type="submit"
        className="btn btn-secondary"
        disabled={saving}
        data-testid="save-notes-btn"
      >
        {saving ? "Saving…" : "Save Notes"}
      </button>
    </form>
  );
}
