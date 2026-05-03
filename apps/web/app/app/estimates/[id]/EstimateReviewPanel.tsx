"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface Suggestion {
  type: "warning" | "info" | "tip";
  field: string;
  message: string;
  suggestion: string;
}

interface ReviewResult {
  suggestions: Suggestion[];
  score: number;
  summary: string;
}

interface Props {
  estimateId: string;
}

const TYPE_STYLE: Record<Suggestion["type"], { label: string; color: string }> = {
  warning: { label: "Warning", color: "var(--status-error)" },
  info:    { label: "Info",    color: "var(--status-warning)" },
  tip:     { label: "Tip",     color: "var(--status-success)" },
};

export function EstimateReviewPanel({ estimateId }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const { error } = useToast();

  async function handleReview() {
    setLoading(true);
    setDismissed(false);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/review`, { method: "POST" });
      const json = await res.json() as ReviewResult & { error?: { message?: string } };
      if (!res.ok) {
        error(json.error?.message ?? "Failed to review estimate");
        return;
      }
      setResult(json);
    } catch {
      error("Network error — could not review estimate");
    } finally {
      setLoading(false);
    }
  }

  const scoreColor =
    !result ? "var(--accent)"
    : result.score >= 80 ? "var(--status-success)"
    : result.score >= 60 ? "var(--status-warning)"
    : "var(--status-error)";

  return (
    <div className="card action-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Review Estimate</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {result && !dismissed && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--fg-muted)", fontSize: "var(--text-sm)", padding: "4px 8px",
              }}
            >
              Dismiss
            </button>
          )}
          <button
            type="button"
            onClick={handleReview}
            disabled={loading}
            style={{
              display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
              padding: "8px 16px", borderRadius: 6, border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              background: "var(--accent)", color: "#fff",
              fontWeight: 600, fontSize: "var(--text-sm)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Reviewing…" : result && !dismissed ? "Re-review" : "Review"}
          </button>
        </div>
      </div>

      {!loading && !result && (
        <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Check this estimate against Dovetails pricing rules — margin, effective rate, scope completeness.
        </p>
      )}

      {result && !dismissed && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {/* Score row */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: scoreColor, color: "#fff",
              fontWeight: 700, fontSize: "var(--text-lg)",
            }}>
              {result.score}
            </div>
            <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              {result.summary}
            </p>
          </div>

          {/* Suggestions */}
          {result.suggestions.length === 0 ? (
            <p style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", margin: 0 }}>
              No issues found.
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {result.suggestions.map((s, i) => {
                const ts = TYPE_STYLE[s.type];
                return (
                  <div
                    key={i}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius)",
                      borderLeft: `3px solid ${ts.color}`,
                      background: "var(--bg-subtle)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "2px" }}>
                      <span style={{
                        fontSize: "var(--text-xs)", fontWeight: 700,
                        color: ts.color, textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>
                        {ts.label}
                      </span>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {s.field.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 500 }}>{s.message}</p>
                    <p style={{ margin: "2px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>{s.suggestion}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
