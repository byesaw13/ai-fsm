"use client";

import { useState } from "react";
import { useToast } from "@/components/ui";
import { buildEstimateUrl } from "./visit-execution-helpers";

interface Props {
  propertyId: string;
  visitId: string;
  jobId: string | null;
  clientId: string | null;
  propertyAddress: string | null;
  canCreateEstimate: boolean;
}

export function VisitRecommendationPanel({
  propertyId,
  visitId,
  jobId,
  clientId,
  propertyAddress,
  canCreateEstimate,
}: Props) {
  const toast = useToast();
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const estimateUrl = buildEstimateUrl({ clientId, jobId, propertyId, visitId });

  async function submitNote() {
    const trimmed = noteText.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/properties/${propertyId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmed,
          visit_id: visitId,
          source: "technician",
          pinned: false,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setNoteText("");
      setNoteSaved(true);
      toast.success("Note saved to property record.");
    } catch {
      toast.error("Could not save note — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {/* Add property note */}
      <div>
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          Add a note to this property
        </div>
        {noteSaved ? (
          <div style={{ fontSize: "var(--text-sm)", color: "#16a34a", padding: "var(--space-2) 0" }}>
            ✓ Note saved to property record.{" "}
            <button
              onClick={() => { setNoteSaved(false); setNoteText(""); }}
              style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}
            >
              Add another
            </button>
          </div>
        ) : (
          <>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Describe what you observed, recommend, or want to flag for the next visit…"
              rows={3}
              style={{
                width: "100%",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                fontSize: "var(--text-sm)",
                resize: "vertical",
                fontFamily: "inherit",
                background: "var(--bg-surface)",
                color: "var(--fg-primary)",
                boxSizing: "border-box",
              }}
            />
            <div style={{ marginTop: "var(--space-2)" }}>
              <button
                onClick={submitNote}
                disabled={saving || !noteText.trim()}
                style={{
                  padding: "6px 14px",
                  background: noteText.trim() ? "var(--color-primary, #0284c7)" : "var(--bg-muted)",
                  color: noteText.trim() ? "#fff" : "var(--fg-muted)",
                  border: "none",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: saving || !noteText.trim() ? "not-allowed" : "pointer",
                }}
              >
                {saving ? "Saving…" : "Save Note to Property"}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Navigation actions */}
      <div>
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-2)" }}>
          Next steps
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {canCreateEstimate && estimateUrl && (
            <a
              href={estimateUrl}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                fontSize: "var(--text-sm)",
                textDecoration: "none",
                color: "var(--fg-primary)",
                background: "var(--bg-surface)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Recommend estimate</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "auto" }}>Create estimate →</span>
            </a>
          )}

          {jobId && (
            <a
              href={`/app/jobs/${jobId}/visits/new`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border)",
                fontSize: "var(--text-sm)",
                textDecoration: "none",
                color: "var(--fg-primary)",
                background: "var(--bg-surface)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Schedule follow-up visit</span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "auto" }}>New visit →</span>
            </a>
          )}

          <a
            href={`/app/properties/${propertyId}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              fontSize: "var(--text-sm)",
              textDecoration: "none",
              color: "var(--fg-primary)",
              background: "var(--bg-surface)",
            }}
          >
            <span style={{ fontWeight: 600 }}>Flag property issue</span>
            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "auto" }}>
              {propertyAddress ?? "Property"} →
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
