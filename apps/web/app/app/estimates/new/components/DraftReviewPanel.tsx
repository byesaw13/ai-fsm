"use client";

import { Button } from "@/components/ui";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";

interface DraftReviewPanelProps {
  draft: DraftEstimate;
  onApply: () => void;
  onRedescribe: () => void;
}

const CONFIDENCE_STYLES: Record<DraftEstimate["confidence"], { bg: string; border: string; label: string; desc: string }> = {
  high: {
    bg: "var(--status-success-bg, #f0fdf4)",
    border: "var(--status-success, #16a34a)",
    label: "High confidence",
    desc: "All services matched catalog codes and measurements were provided.",
  },
  medium: {
    bg: "var(--status-warning-bg, #fffbeb)",
    border: "var(--status-warning, #d97706)",
    label: "Medium confidence",
    desc: "Some measurements were estimated or one service used the custom fallback. Review before applying.",
  },
  low: {
    bg: "var(--status-error-bg, #fef2f2)",
    border: "var(--status-error, #dc2626)",
    label: "Low confidence",
    desc: "Trade was ambiguous or multiple custom services used. Manual review required.",
  },
};

const TRADE_LABELS: Record<string, string> = {
  flooring: "Flooring",
  painting: "Painting",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry: "Carpentry",
  drywall: "Drywall / General Repairs",
  outdoor: "Outdoor / Hardscape",
  mounting: "Mounting / Hanging",
  unknown: "Unknown",
};

const GUARDRAIL_FLAGS: Array<{ key: keyof DraftEstimate["guardrails"]; label: string }> = [
  { key: "trip_count", label: "Multi-trip required" },
  { key: "requires_drying_or_curing", label: "Drying / curing cycle" },
  { key: "difficult_access", label: "Difficult access" },
  { key: "old_house_risk", label: "Pre-1978 / old house risk" },
  { key: "coordination_required", label: "Coordination required" },
];

export function DraftReviewPanel({ draft, onApply, onRedescribe }: DraftReviewPanelProps) {
  const conf = CONFIDENCE_STYLES[draft.confidence];

  const activeFlags = GUARDRAIL_FLAGS.filter((f) => {
    const val = draft.guardrails[f.key];
    return f.key === "trip_count" ? val === "multi_trip" : val === true;
  });

  const primaryTrade = draft.services[0]?.trade_detected ?? "unknown";
  const tradeLabel = TRADE_LABELS[primaryTrade] ?? primaryTrade;

  const uniqueReasons = Array.from(
    new Set(draft.services.flatMap((s) => s.detection_reasons))
  );

  return (
    <div style={{
      border: `1px solid ${conf.border}`,
      borderRadius: "var(--radius)",
      background: conf.bg,
      padding: "var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>AI Draft Ready</span>
            <span style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              padding: "1px 8px",
              borderRadius: "9999px",
              border: `1px solid ${conf.border}`,
              color: conf.border,
              background: "transparent",
            }}>
              {conf.label}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {conf.desc}
          </p>
        </div>
      </div>

      {/* Trade detection */}
      <div style={{
        background: "var(--bg-surface, white)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm, 4px)",
        padding: "var(--space-3)",
      }}>
        <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
          Trade detected: {tradeLabel}
        </p>
        {uniqueReasons.length > 0 && (
          <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
            {uniqueReasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Services */}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <p style={{ margin: 0, fontSize: "var(--text-sm)", fontWeight: 600 }}>
          Services ({draft.services.length})
        </p>
        {draft.services.map((svc, i) => (
          <div key={i} style={{
            background: "var(--bg-surface, white)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 4px)",
            padding: "var(--space-2) var(--space-3)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "var(--space-2)",
          }}>
            <div>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {svc.service_code} — {svc.service_name}
              </span>
              {svc.complexity_factor_keys.length > 0 && (
                <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  Factors: {svc.complexity_factor_keys.join(", ")}
                </p>
              )}
              {svc.service_code === "9099" && (
                <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--status-warning, #d97706)", fontWeight: 600 }}>
                  Custom scope — needs your review before sending to client
                </p>
              )}
            </div>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "nowrap" }}>
              ${(svc.base_price_cents / 100).toFixed(0)}+
            </span>
          </div>
        ))}
      </div>

      {/* Risk flags */}
      {activeFlags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
          {activeFlags.map((f) => (
            <span key={f.key} style={{
              fontSize: "var(--text-xs)",
              padding: "2px 8px",
              borderRadius: "9999px",
              background: "var(--status-warning-bg, #fffbeb)",
              border: "1px solid var(--status-warning, #d97706)",
              color: "var(--status-warning, #d97706)",
            }}>
              {f.label}
            </span>
          ))}
        </div>
      )}

      {/* Confidence notes */}
      {draft.confidence_notes && (
        <div style={{
          background: "var(--bg-surface, white)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm, 4px)",
          padding: "var(--space-3)",
        }}>
          <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Estimator notes
          </p>
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "pre-wrap" }}>
            {draft.confidence_notes}
          </p>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Button type="button" variant="primary" size="sm" onClick={onApply}>
          Apply to estimate
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onRedescribe}>
          Re-describe
        </Button>
      </div>
    </div>
  );
}
