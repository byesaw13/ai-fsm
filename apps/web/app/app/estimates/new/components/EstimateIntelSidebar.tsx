"use client";

import { useState } from "react";
import type { EstimateLiveIntel } from "../hooks/useEstimateLiveIntel";

interface EstimateIntelSidebarProps {
  intel: EstimateLiveIntel;
}

function fmt$(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtPct(n: number): string {
  return `${n}%`;
}

const MARGIN_COLOR: Record<EstimateLiveIntel["marginStatus"], string> = {
  green:  "#16a34a",
  yellow: "#d97706",
  red:    "#dc2626",
};

export function EstimateIntelSidebar({ intel }: EstimateIntelSidebarProps) {
  const [materialsExpanded, setMaterialsExpanded] = useState(false);
  const [guardrailsExpanded, setGuardrailsExpanded] = useState(false);

  const {
    totalCents, depositCents, balanceDueCents,
    materialsTotalCents, materialsBySection, hasAnyMaterials,
    estimatedProfitCents, grossMarginPct, marginStatus, isMarginReliable,
    revenuePerLaborHourCents,
    confidenceScore, confidenceReasons,
    guardrailReview,
  } = intel;

  const confColor = confidenceScore >= 80 ? "#16a34a" : confidenceScore >= 60 ? "#d97706" : "#dc2626";
  const mc = MARGIN_COLOR[marginStatus];

  const realWarnings = guardrailReview.warnings.filter(
    (w) => !(w.field === "pricing" && w.message.includes("passed"))
  );
  const allIssues = [...guardrailReview.blockers.map((b) => ({ ...b, type: "blocker" as const })),
                     ...realWarnings.map((w) => ({ ...w, type: "warning" as const }))];
  const visibleIssues = guardrailsExpanded ? allIssues : allIssues.slice(0, 3);

  return (
    <div style={{
      position: "sticky",
      top: "var(--space-4)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
    }}>

      {/* ── Confidence score ──────────────────────────────────────────────── */}
      {confidenceScore < 100 && (
        <div style={{
          background: `${confColor}10`,
          border: `1px solid ${confColor}40`,
          borderRadius: "var(--radius-sm)",
          padding: "var(--space-2) var(--space-3)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: confidenceReasons.length > 0 ? 6 : 0 }}>
            <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: confColor, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Estimate Confidence
            </span>
            <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: confColor }}>
              {confidenceScore}%
            </span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: `${confColor}25`, borderRadius: 2, marginBottom: confidenceReasons.length > 0 ? 6 : 0 }}>
            <div style={{ height: "100%", width: `${confidenceScore}%`, background: confColor, borderRadius: 2 }} />
          </div>
          {confidenceReasons.map((r, i) => (
            <p key={i} style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: confColor }}>
              · {r}
            </p>
          ))}
        </div>
      )}

      {/* ── Running total ─────────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}>
        <p style={{ margin: "0 0 4px", fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)" }}>
          Total
        </p>
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-2xl, 1.5rem)", fontWeight: 800, color: "var(--fg)", lineHeight: 1 }}>
          {fmt$(totalCents)}
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          <span>Deposit (30%): <strong style={{ color: "var(--fg)" }}>{fmt$(depositCents)}</strong></span>
          <span>Balance: <strong style={{ color: "var(--fg)" }}>{fmt$(balanceDueCents)}</strong></span>
        </div>
      </div>

      {/* ── Margin & profit ───────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-3)",
      }}>
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)" }}>
          Margin &amp; Profit
        </p>
        {isMarginReliable ? (
          <>
            {/* Margin bar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Margin</span>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: mc }}>{fmtPct(grossMarginPct)}</span>
            </div>
            <div style={{ height: 6, background: "var(--bg-subtle)", borderRadius: 3, marginBottom: "var(--space-2)" }}>
              <div style={{ height: "100%", width: `${Math.min(100, grossMarginPct)}%`, background: mc, borderRadius: 3, transition: "width 0.2s" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)" }}>
              <span style={{ color: "var(--fg-muted)" }}>Est. Profit</span>
              <span style={{ fontWeight: 600, color: estimatedProfitCents >= 0 ? "var(--fg)" : "#dc2626" }}>
                {fmt$(estimatedProfitCents)}
              </span>
            </div>
            {revenuePerLaborHourCents > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", marginTop: 2 }}>
                <span style={{ color: "var(--fg-muted)" }}>Revenue/hr</span>
                <span style={{ fontWeight: 600, color: "var(--fg)" }}>
                  {fmt$(revenuePerLaborHourCents)}/hr
                </span>
              </div>
            )}
          </>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
            Enter labor hours to see margin
          </p>
        )}
      </div>

      {/* ── Materials summary ─────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
      }}>
        <button
          type="button"
          onClick={() => setMaterialsExpanded((e) => !e)}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "var(--space-2) var(--space-3)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)" }}>
            Materials
          </span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            {hasAnyMaterials ? `${fmt$(materialsTotalCents)} ${materialsExpanded ? "▲" : "▼"}` : "—"}
          </span>
        </button>
        {materialsExpanded && (
          <div style={{ padding: "0 var(--space-3) var(--space-2)", borderTop: "1px solid var(--border)" }}>
            {hasAnyMaterials ? materialsBySection.map((sec) => (
              <div key={sec.section} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", padding: "3px 0" }}>
                <span style={{ color: "var(--fg-muted)" }}>{sec.section}</span>
                <span style={{ fontWeight: 600 }}>{fmt$(sec.section_total_cents)}</span>
              </div>
            )) : (
              <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                Add scope measurements to auto-calculate
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Guardrail status ──────────────────────────────────────────────── */}
      <div style={{
        background: "var(--bg-surface)",
        border: `1px solid ${guardrailReview.blockers.length > 0 ? "#dc2626" : realWarnings.length > 0 ? "#d97706" : "#16a34a"}40`,
        borderRadius: "var(--radius-sm)",
        padding: "var(--space-2) var(--space-3)",
      }}>
        {allIssues.length === 0 ? (
          <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "#16a34a", fontWeight: 600 }}>✓ Pricing guardrails passed</p>
        ) : (
          <>
            {visibleIssues.map((issue, i) => (
              <p key={i} style={{ margin: "0 0 3px", fontSize: "var(--text-xs)", color: issue.type === "blocker" ? "#dc2626" : "#d97706", lineHeight: 1.4 }}>
                {issue.type === "blocker" ? "✗" : "⚠"} {issue.message}
              </p>
            ))}
            {allIssues.length > 3 && (
              <button
                type="button"
                onClick={() => setGuardrailsExpanded((e) => !e)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: "var(--text-xs)", color: "var(--fg-muted)", padding: "2px 0" }}
              >
                {guardrailsExpanded ? "Show less" : `+${allIssues.length - 3} more`}
              </button>
            )}
          </>
        )}
      </div>

    </div>
  );
}
