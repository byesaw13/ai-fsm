"use client";

import { Button } from "@/components/ui";
import type { TmEstimateDraft } from "@/lib/estimates/tm-briefing";

interface TmDraftReviewPanelProps {
  draft: TmEstimateDraft;
  onApply: () => void;
  onEdit: () => void;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatRange(min: number, max: number, unit: string): string {
  if (min === max) return `${min} ${unit}`;
  return `${min}–${max} ${unit}`;
}

const CONFIDENCE: Record<
  TmEstimateDraft["extraction"]["confidence"],
  { color: string; label: string }
> = {
  high: { color: "#16a34a", label: "High confidence" },
  medium: { color: "#d97706", label: "Medium — review recommended" },
  low: { color: "#dc2626", label: "Low — manual review required" },
};

export function TmDraftReviewPanel({ draft, onApply, onEdit }: TmDraftReviewPanelProps) {
  const conf = CONFIDENCE[draft.extraction.confidence];
  const e = draft.extraction;
  const location =
    [e.location_city, e.location_state].filter(Boolean).join(", ") || "Location not specified";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      <div
        style={{
          borderLeft: `4px solid ${conf.color}`,
          padding: "var(--space-3) var(--space-4)",
          background: "var(--bg-muted, #f4f4f5)",
          borderRadius: "var(--radius-sm, 4px)",
        }}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          <strong>Time &amp; Materials draft</strong>
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: "#fff",
              background: conf.color,
              padding: "2px 8px",
              borderRadius: 99,
            }}
          >
            {conf.label}
          </span>
          {draft.is_ma && (
            <span
              style={{
                fontSize: "var(--text-xs)",
                fontWeight: 600,
                color: "var(--fg-muted)",
                border: "1px solid var(--border)",
                padding: "2px 8px",
                borderRadius: 99,
              }}
            >
              MA rate (+15%)
            </span>
          )}
        </div>
        <p style={{ margin: "8px 0 0", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {e.scope_summary || e.proposal_summary}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-sm)" }}>
          <strong>{location}</strong>
          {e.working_days != null ? ` · ~${e.working_days} working day(s)` : null}
          {` · $${(draft.labor_rate_cents / 100).toFixed(0)}/hr`}
        </p>
      </div>

      {e.recommended_mode === "fixed_bid" && (
        <div
          style={{
            padding: "var(--space-3)",
            border: "1px solid #d97706",
            borderRadius: "var(--radius-sm, 4px)",
            background: "#fffbeb",
            fontSize: "var(--text-sm)",
          }}
        >
          <strong>Note:</strong> The briefing leaned fixed-bid ({e.mode_rationale}). This path still
          produces a T&amp;M estimate so you can set expectations without locking a fixed price.
        </div>
      )}

      {e.pasted_rate_cents != null && e.pasted_rate_cents !== draft.labor_rate_cents && (
        <div
          style={{
            padding: "var(--space-3)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm, 4px)",
            fontSize: "var(--text-sm)",
            color: "var(--fg-muted)",
          }}
        >
          Pasted rate ${e.pasted_rate_cents / 100}/hr was ignored. Using Dovetails rate $
          {(draft.labor_rate_cents / 100).toFixed(0)}/hr
          {draft.is_ma ? " (MA)" : ""}.
        </div>
      )}

      <div>
        <p
          style={{
            margin: "0 0 var(--space-2)",
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--fg-muted)",
          }}
        >
          Hours &amp; range
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-2)",
            fontSize: "var(--text-sm)",
          }}
        >
          <div style={{ padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: 4 }}>
            <div style={{ color: "var(--fg-muted)" }}>On-site labor</div>
            <strong>{formatRange(e.labor_hours_min, e.labor_hours_max, "hrs")}</strong>
            <div>
              {formatCents(draft.labor_total_cents_min)}–{formatCents(draft.labor_total_cents_max)}
            </div>
          </div>
          <div style={{ padding: "var(--space-3)", border: "1px solid var(--border)", borderRadius: 4 }}>
            <div style={{ color: "var(--fg-muted)" }}>Travel</div>
            <strong>{formatRange(e.travel_hours_min, e.travel_hours_max, "hrs")}</strong>
            <div>
              {formatCents(draft.travel_total_cents_min)}–{formatCents(draft.travel_total_cents_max)}
            </div>
          </div>
        </div>
        <p style={{ margin: "var(--space-3) 0 0", fontSize: "var(--text-base)", fontWeight: 700 }}>
          Expectation: {formatCents(draft.total_estimate_cents_min)}–
          {formatCents(draft.total_estimate_cents_max)}
          {draft.materials_estimate_cents > 0
            ? ` (incl. ~${formatCents(draft.materials_estimate_cents)} materials)`
            : " + materials at cost"}
        </p>
        <p style={{ margin: "4px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          Line items use mid-range hours so the draft total sits in the middle of the band. Invoice
          remains actual hours.
        </p>
      </div>

      {e.scope_items.length > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 var(--space-2)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--fg-muted)",
            }}
          >
            Scope
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "var(--text-sm)" }}>
            {e.scope_items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p
          style={{
            margin: "0 0 var(--space-2)",
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--fg-muted)",
          }}
        >
          Line items (mid-range)
        </p>
        <div style={{ border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
          {draft.line_items.map((li) => (
            <div
              key={li.description}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                borderBottom: "1px solid var(--border)",
                fontSize: "var(--text-sm)",
              }}
            >
              <span style={{ flex: 1 }}>{li.description}</span>
              <span style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                {li.quantity} × ${(li.unit_price_cents / 100).toFixed(2)} ={" "}
                {formatCents(Math.round(li.quantity * li.unit_price_cents))}
              </span>
            </div>
          ))}
        </div>
      </div>

      {e.risks.length > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 var(--space-2)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--fg-muted)",
            }}
          >
            Risks
          </p>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "var(--text-sm)" }}>
            {e.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {draft.shopping_list && draft.shopping_list.sections.length > 0 && (
        <div>
          <p
            style={{
              margin: "0 0 var(--space-2)",
              fontSize: "var(--text-xs)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--fg-muted)",
            }}
          >
            Shopping list
          </p>
          {draft.shopping_list.sections.map((sec) => (
            <div key={sec.section} style={{ marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <strong>{sec.section}</strong>
              <ul style={{ margin: "4px 0 0", paddingLeft: "1.2rem" }}>
                {sec.specified_items.map((item) => (
                  <li key={item.name}>
                    {item.units_to_order} {item.unit_label} — {item.name}
                    {item.notes ? ` (${item.notes})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {e.confidence_notes && (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          {e.confidence_notes}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
        <Button type="button" variant="secondary" onClick={onEdit}>
          Edit briefing
        </Button>
        <Button type="button" onClick={onApply}>
          Apply to estimate →
        </Button>
      </div>
    </div>
  );
}
