"use client";

import { useState } from "react";
import { Card, SectionHeader } from "@/components/ui";

export function IntakeSummary({ bookingId }: { bookingId: string }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/booking-requests/${bookingId}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to generate summary");
        return;
      }
      setSummary(data.summary);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="AI Summary" />
      {summary ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.6 }}>{summary}</p>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            style={{
              alignSelf: "flex-start",
              background: "none",
              border: "none",
              padding: 0,
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              cursor: loading ? "default" : "pointer",
              textDecoration: "underline",
            }}
          >
            {loading ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {error && (
            <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--danger)" }}>{error}</p>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="p7-btn p7-btn-secondary p7-btn-sm"
          >
            {loading ? "Generating…" : "Generate Summary"}
          </button>
        </div>
      )}
    </Card>
  );
}
