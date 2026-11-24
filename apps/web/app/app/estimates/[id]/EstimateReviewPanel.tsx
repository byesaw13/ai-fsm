"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { useQuoteVersion } from "@/components/QuoteVersion";

export interface Suggestion {
  type: "warning" | "info" | "tip";
  field: string;
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  suggestions: Suggestion[];
  score: number;
  summary: string;
}

interface StoredReviewProps {
  result: ReviewResult;
  source: "ai" | "rules";
  reviewed_at: string;
  /** False once the estimate changed after this review ran. */
  current: boolean;
}

interface Props {
  estimateId: string;
  /** The stored review, if any. Opening the page never runs a new one (TASK-195). */
  initial?: StoredReviewProps | null;
}

const TYPE_STYLE: Record<Suggestion["type"], { label: string; color: string; bg: string }> = {
  warning: { label: "Advisory Warning", color: "#d97706", bg: "color-mix(in srgb, #d97706 8%, transparent)" },
  info:    { label: "Pricing Signal",  color: "#0284c7", bg: "color-mix(in srgb, #0284c7 8%, transparent)" },
  tip:     { label: "Profit Tip",      color: "#16a34a", bg: "color-mix(in srgb, #16a34a 8%, transparent)" },
};

export function EstimateReviewPanel({ estimateId, initial = null }: Props) {
  const [loading, setLoading] = useState(false);
  const [stored, setStored] = useState<StoredReviewProps | null>(initial);
  const [dismissed, setDismissed] = useState(false);
  const { updatedAt, setUpdatedAt } = useQuoteVersion();
  const { error } = useToast();
  // The quote version this review was made for. A save in this tab moves the version on.
  const [reviewedVersion, setReviewedVersion] = useState<string | null>(initial?.current ? updatedAt : null);

  // router.refresh() keeps client state; follow the server's stored review and its current flag.
  useEffect(() => {
    if (!initial) return;
    setStored(initial);
    setReviewedVersion(initial.current ? updatedAt : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the server's review changes
  }, [initial?.reviewed_at, initial?.current]);

  const result = stored?.result ?? null;
  const current = !!stored?.current && reviewedVersion !== null && reviewedVersion === updatedAt;

  async function fetchReview() {
    setLoading(true);
    setDismissed(false);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/review`, { method: "POST" });
      const json = (await res.json()) as {
        review?: { result: ReviewResult; source: "ai" | "rules"; reviewed_at: string };
        stored?: boolean;
        previous_updated_at?: string;
        updated_at?: string | null;
        error?: { message?: string };
      };
      if (!res.ok || !json.review) {
        error(json.error?.message ?? "Failed to review estimate");
        return;
      }
      setStored({ ...json.review, current: json.stored === true });
      // Storing the review touches the row. Keep this tab's version current only if it was.
      if (json.updated_at && updatedAt && json.previous_updated_at === updatedAt) {
        setUpdatedAt(json.updated_at);
        setReviewedVersion(json.updated_at);
      } else {
        setReviewedVersion(null);
      }
    } catch {
      error("Network error — could not review estimate");
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = !result
    ? "var(--accent)"
    : result.score >= 80
    ? "var(--status-success)"
    : result.score >= 60
    ? "var(--status-warning)"
    : "var(--status-error)";

  return (
    <div className="card action-card" data-testid="estimate-review-panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <span>Advisory Review &amp; Profitability Tips</span>
          </h2>
          <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Non-blocking pricing checks &amp; suggestions to protect margins and meet minimums.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          {result && !dismissed && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--fg-muted)",
                fontSize: "var(--text-sm)",
                padding: "4px 8px",
              }}
            >
              Hide
            </button>
          )}
          <button
            type="button"
            onClick={fetchReview}
            data-testid="review-run"
            disabled={loading}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              cursor: loading ? "not-allowed" : "pointer",
              background: "var(--bg-subtle)",
              color: "var(--fg)",
              fontWeight: 600,
              fontSize: "var(--text-xs)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Checking…" : !stored ? "Check estimate" : "Re-check"}
          </button>
        </div>
      </div>

      {!loading && !result && (
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }} data-testid="review-not-run">
          Not checked yet. Check estimate reviews the hours, costs and price against your hourly baseline.
        </p>
      )}

      {stored && !current && !loading && (
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)", color: "var(--color-warning)" }} data-testid="review-stale">
          The estimate changed after this check. Re-check to update it.
        </p>
      )}

      {loading && !result && (
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Evaluating profitability, minimums, and pricing guardrails…
        </p>
      )}

      {result && !dismissed && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {/* Health Score Header */}
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-3)" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: scoreColor,
                color: "#fff",
                fontWeight: 700,
                fontSize: "var(--text-base)",
              }}
            >
              {result.score}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>{result.summary}</p>
              <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                {result.suggestions.length === 0
                  ? "Estimate pricing aligns with Dovetails profitability rules."
                  : `${result.suggestions.length} advisory item${result.suggestions.length > 1 ? "s" : ""} to consider.`}
              </p>
            </div>
          </div>

          {/* Actionable Suggestions List */}
          {result.suggestions.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {result.suggestions.map((s, i) => {
                const ts = TYPE_STYLE[s.type] ?? TYPE_STYLE.info;
                return (
                  <div
                    key={i}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      borderRadius: "var(--radius)",
                      border: `1px solid ${ts.color}`,
                      background: ts.bg,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                      <span
                        style={{
                          fontSize: "var(--text-xs)",
                          fontWeight: 700,
                          color: ts.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {ts.label}
                      </span>
                      <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {s.field.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--fg)" }}>
                      {s.message}
                    </p>
                    {s.suggestion && (
                      <div style={{ marginTop: 4, display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <span style={{ color: "var(--accent)", fontSize: "var(--text-sm)" }}>💡</span>
                        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-secondary)", fontWeight: 500 }}>
                          <strong>How to improve:</strong> {s.suggestion}
                        </p>
                      </div>
                    )}
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
