"use client";

import { useState } from "react";
import { Button } from "@/components/ui";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";
import type { ShoppingList } from "@ai-fsm/domain";

interface DraftReviewPanelProps {
  draft: DraftEstimate;
  shoppingList?: ShoppingList | null;
  onApply: () => void;
  onRedescribe: () => void;
}

const CONFIDENCE_STYLES: Record<DraftEstimate["confidence"], { border: string; badgeColor: string; label: string }> = {
  high:   { border: "var(--status-success, #16a34a)", badgeColor: "#16a34a", label: "High confidence" },
  medium: { border: "var(--status-warning, #d97706)", badgeColor: "#d97706", label: "Medium — review recommended" },
  low:    { border: "var(--status-error, #dc2626)",   badgeColor: "#dc2626", label: "Low — manual review required" },
};

const TRADE_LABELS: Record<string, string> = {
  flooring: "Flooring",
  painting: "Painting & Finishes",
  plumbing: "Plumbing",
  electrical: "Electrical",
  carpentry: "Carpentry & Furniture",
  general_repairs: "General Repairs",
  drywall: "Drywall / General Repairs",
  outdoor: "Outdoor & Seasonal",
  mounting: "Mounting & Installs",
  unknown: "Unknown",
};

const GUARDRAIL_FLAGS: Array<{ key: keyof DraftEstimate["guardrails"]; label: string; color: string }> = [
  { key: "trip_count",               label: "Multi-trip required",      color: "#d97706" },
  { key: "requires_drying_or_curing",label: "Drying / curing cycle",    color: "#d97706" },
  { key: "difficult_access",         label: "Difficult access",         color: "#d97706" },
  { key: "old_house_risk",           label: "Pre-1978 / old house risk", color: "#dc2626" },
  { key: "coordination_required",    label: "Coordination required",    color: "#d97706" },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      margin: "0 0 var(--space-2)",
      fontSize: "var(--text-xs)",
      fontWeight: 700,
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      color: "var(--fg-muted)",
    }}>
      {children}
    </p>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "var(--bg-surface, white)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-sm, 4px)",
      padding: "var(--space-3)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function formatDollars(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function DraftReviewPanel({ draft, shoppingList, onApply, onRedescribe }: DraftReviewPanelProps) {
  const [materialsExpanded, setMaterialsExpanded] = useState<Record<string, boolean>>({});
  const [shoppingExpanded, setShoppingExpanded] = useState(false);
  const [measurementsConfirmed, setMeasurementsConfirmed] = useState(false);
  const conf = CONFIDENCE_STYLES[draft.confidence];

  const activeFlags = GUARDRAIL_FLAGS.filter((f) => {
    const val = draft.guardrails[f.key];
    return f.key === "trip_count" ? val === "multi_trip" : val === true;
  });

  const primaryTrade = draft.services[0]?.trade_detected ?? "unknown";
  const tradeLabel = TRADE_LABELS[primaryTrade] ?? primaryTrade;
  const uniqueReasons = Array.from(new Set(draft.services.flatMap((s) => s.detection_reasons)));

  const estimatedMeasurements = draft.estimated_measurements ?? [];
  const specifiedMaterials = draft.specified_materials ?? [];
  const needsMeasurementConfirmation = estimatedMeasurements.length > 0 && !measurementsConfirmed;

  // Totals
  const totalServiceCents = draft.services.reduce((sum, s) => sum + (s.adjusted_price_cents ?? s.base_price_cents), 0);
  const totalMaterialCents = draft.services.reduce((sum, s) => sum + (s.material_total_cents ?? 0), 0);
  const totalSpecifiedCents = specifiedMaterials.reduce(
    (sum, m) => sum + (m.unit_cost_cents ? m.units_to_order * m.unit_cost_cents : 0), 0
  );
  const grandTotalCents = totalServiceCents + totalMaterialCents;

  return (
    <div style={{
      border: `1px solid ${conf.border}`,
      borderRadius: "var(--radius)",
      background: "var(--bg-surface, white)",
      overflow: "hidden",
    }}>
      {/* Header bar */}
      <div style={{
        padding: "var(--space-3) var(--space-4)",
        background: "var(--bg-subtle)",
        borderBottom: `1px solid ${conf.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "var(--space-3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>AI Draft Ready</span>
          <span style={{
            fontSize: "var(--text-xs)",
            fontWeight: 600,
            padding: "1px 8px",
            borderRadius: "9999px",
            border: `1px solid ${conf.badgeColor}`,
            color: conf.badgeColor,
          }}>
            {conf.label}
          </span>
        </div>
        {grandTotalCents > 0 && (
          <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg)" }}>
            Est. total: {formatDollars(grandTotalCents)}
            {totalMaterialCents > 0 && (
              <span style={{ fontWeight: 400, fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: 6 }}>
                incl. {formatDollars(totalMaterialCents)} materials
              </span>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>

        {/* ── BLOCKING: Unconfirmed measurements ─────────────────────── */}
        {estimatedMeasurements.length > 0 && (
          <div style={{
            border: measurementsConfirmed ? "1px solid #16a34a" : "1px solid #d97706",
            borderRadius: "var(--radius-sm)",
            background: measurementsConfirmed ? "#f0fdf4" : "#fffbeb",
            padding: "var(--space-3)",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-3)" }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", fontWeight: 700, color: measurementsConfirmed ? "#16a34a" : "#92400e" }}>
                  {measurementsConfirmed
                    ? "✓ Measurements confirmed"
                    : `⚠ ${estimatedMeasurements.length} measurement${estimatedMeasurements.length > 1 ? "s were" : " was"} estimated — confirm before applying`}
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
                  {estimatedMeasurements.map((m, i) => (
                    <div key={i} style={{ fontSize: "var(--text-xs)", display: "flex", gap: "var(--space-2)" }}>
                      <span style={{ fontWeight: 600, minWidth: 160 }}>{m.scope_label}:</span>
                      <span style={{ fontWeight: 700 }}>{m.value.toLocaleString()}</span>
                      <span style={{ color: "var(--fg-muted)", fontStyle: "italic" }}>{m.basis}</span>
                    </div>
                  ))}
                </div>
              </div>
              {!measurementsConfirmed && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setMeasurementsConfirmed(true)}
                >
                  Confirm
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ── SECTION: Trade + risk flags ────────────────────────────── */}
        <div>
          <SectionLabel>Detected trade</SectionLabel>
          <Card>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "var(--space-3)" }}>
              <div>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{tradeLabel}</span>
                {uniqueReasons.length > 0 && (
                  <p style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {uniqueReasons.join(" · ")}
                  </p>
                )}
              </div>
              {activeFlags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)", justifyContent: "flex-end" }}>
                  {activeFlags.map((f) => (
                    <span key={f.key} style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      padding: "1px 7px",
                      borderRadius: "9999px",
                      background: `${f.color}18`,
                      border: `1px solid ${f.color}`,
                      color: f.color,
                      whiteSpace: "nowrap",
                    }}>
                      {f.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* ── SECTION: Services + materials ──────────────────────────── */}
        <div>
          <SectionLabel>Services &amp; materials</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            {draft.services.map((svc, i) => {
              const hasMaterials = (svc.computed_materials?.length ?? 0) > 0;
              const matExpanded = materialsExpanded[svc.service_code + i] ?? false;
              const displayPrice = svc.adjusted_price_cents ?? svc.base_price_cents;

              return (
                <Card key={i} style={{ padding: 0, overflow: "hidden" }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "var(--space-3)",
                    padding: "var(--space-2) var(--space-3)",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)" }}>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontFamily: "monospace" }}>
                          {svc.service_code}
                        </span>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                          {svc.service_name}
                        </span>
                        {svc.service_code === "9099" && (
                          <span style={{ fontSize: "var(--text-xs)", color: "#d97706", fontWeight: 600 }}>
                            Custom — needs review
                          </span>
                        )}
                      </div>
                      {svc.complexity_factor_keys.length > 0 && (
                        <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          Factors: {svc.complexity_factor_keys.map(k => k.replace(/_/g, " ")).join(", ")}
                        </p>
                      )}
                      {Object.keys(svc.scope_values).length > 0 && (
                        <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          Scope: {Object.entries(svc.scope_values).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg)" }}>
                        {formatDollars(displayPrice)}
                      </div>
                      {svc.adjusted_price_cents && svc.unit_type === "per_sqft" && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          ${(svc.base_price_cents / 100).toFixed(2)}/sqft
                        </div>
                      )}
                      {hasMaterials && svc.material_total_cents != null && svc.material_total_cents > 0 && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          + {formatDollars(svc.material_total_cents)} materials
                        </div>
                      )}
                    </div>
                  </div>

                  {hasMaterials && (
                    <>
                      <button
                        type="button"
                        onClick={() => setMaterialsExpanded(prev => ({ ...prev, [svc.service_code + i]: !matExpanded }))}
                        style={{
                          width: "100%",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "var(--space-1) var(--space-3)",
                          background: "var(--bg-subtle)",
                          border: "none",
                          borderTop: "1px solid var(--border)",
                          cursor: "pointer",
                          textAlign: "left",
                          fontSize: "var(--text-xs)",
                          color: "var(--fg-muted)",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          Catalog materials ({svc.computed_materials!.length} items)
                        </span>
                        <span>{matExpanded ? "▲" : "▼"}</span>
                      </button>
                      {matExpanded && (
                        <div style={{ padding: "var(--space-2) var(--space-3)", display: "flex", flexDirection: "column", gap: "2px" }}>
                          {svc.computed_materials!.map((mat) => (
                            <div key={mat.material.id} style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "var(--space-2)",
                              padding: "2px 0",
                            }}>
                              <span style={{ fontSize: "var(--text-xs)", flex: 1 }}>
                                {mat.material.material_name}
                                {mat.material.is_optional && <span style={{ color: "var(--fg-muted)", marginLeft: 4 }}>(optional)</span>}
                              </span>
                              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", minWidth: 60, textAlign: "right" }}>
                                {mat.quantity} {mat.material.unit}
                              </span>
                              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, minWidth: 52, textAlign: "right" }}>
                                {formatDollars(mat.total_cost_cents)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>

          {totalMaterialCents > 0 && (
            <div style={{
              marginTop: "var(--space-2)",
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "baseline",
              gap: "var(--space-2)",
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
            }}>
              <span>Est. catalog materials:</span>
              <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
                {formatDollars(totalMaterialCents)}
              </span>
              <span style={{ fontStyle: "italic" }}>+ 15% handling</span>
            </div>
          )}
        </div>

        {/* ── SECTION: Specified materials (products from description) ─ */}
        {specifiedMaterials.length > 0 && (
          <div>
            <SectionLabel>Materials from description</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {specifiedMaterials.map((mat, i) => (
                <Card key={i} style={{ background: "#f0f9ff", borderColor: "#bae6fd" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>{mat.name}</span>
                      {mat.sku && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: 6 }}>#{mat.sku}</span>
                      )}
                      <div style={{ marginTop: 4, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        {mat.coverage_per_unit && (
                          <span>{mat.coverage_per_unit} sqft/{mat.unit_label} · </span>
                        )}
                        <span>{mat.quantity_needed.toLocaleString()} sqft needed × {mat.waste_factor}x waste</span>
                      </div>
                      {mat.notes && (
                        <p style={{ margin: "2px 0 0", fontSize: "var(--text-xs)", fontStyle: "italic", color: "var(--fg-muted)" }}>{mat.notes}</p>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: "var(--text-sm)", fontWeight: 700 }}>
                        {mat.units_to_order} {mat.unit_label}s
                      </div>
                      {mat.unit_cost_cents && (
                        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          {formatDollars(mat.units_to_order * mat.unit_cost_cents)} est.
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              {totalSpecifiedCents > 0 && (
                <div style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  alignItems: "baseline",
                  gap: "var(--space-2)",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-muted)",
                }}>
                  <span>Est. specified materials:</span>
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--fg)" }}>
                    {formatDollars(totalSpecifiedCents)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── SECTION: Shopping list (full internal view) ────────────── */}
        {shoppingList && shoppingList.sections.length > 0 && (
          <div>
            <SectionLabel>Shopping list (internal)</SectionLabel>
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <button
                type="button"
                onClick={() => setShoppingExpanded(p => !p)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--bg-subtle)",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-muted)",
                }}
              >
                <span style={{ fontWeight: 600 }}>
                  {shoppingList.sections.length} section{shoppingList.sections.length > 1 ? "s" : ""} ·{" "}
                  {formatDollars(shoppingList.total_catalog_cost_cents + shoppingList.total_specified_cost_cents)} est. total
                </span>
                <span>{shoppingExpanded ? "▲" : "▼"}</span>
              </button>
              {shoppingExpanded && (
                <div style={{ padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                  {shoppingList.sections.map((sec) => (
                    <div key={sec.section}>
                      <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {sec.section}
                      </p>
                      {sec.computed_items.map((m) => (
                        <div key={m.material.id} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", padding: "2px 0", gap: "var(--space-2)" }}>
                          <span style={{ flex: 1 }}>{m.material.material_name}</span>
                          <span style={{ color: "var(--fg-muted)", minWidth: 60, textAlign: "right" }}>{m.quantity} {m.material.unit}</span>
                          <span style={{ fontWeight: 600, minWidth: 52, textAlign: "right" }}>{formatDollars(m.total_cost_cents)}</span>
                        </div>
                      ))}
                      {sec.specified_items.map((m, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-xs)", padding: "2px 0", gap: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
                          <span style={{ flex: 1 }}>
                            {m.name}
                            <span style={{ color: "#0284c7", marginLeft: 4, fontStyle: "italic" }}>specified</span>
                          </span>
                          <span style={{ color: "var(--fg-muted)", minWidth: 60, textAlign: "right" }}>{m.units_to_order} {m.unit_label}</span>
                          <span style={{ fontWeight: 600, minWidth: 52, textAlign: "right" }}>
                            {m.unit_cost_cents ? formatDollars(m.units_to_order * m.unit_cost_cents) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* ── SECTION: Schedule ──────────────────────────────────────── */}
        {draft.schedule_notes && (
          <div>
            <SectionLabel>Schedule</SectionLabel>
            <Card>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {draft.schedule_notes}
              </p>
            </Card>
          </div>
        )}

        {/* ── SECTION: Customer proposal text ────────────────────────── */}
        {draft.proposal_summary && (
          <div>
            <SectionLabel>Customer proposal text</SectionLabel>
            <Card style={{ borderStyle: "dashed" }}>
              <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic" }}>
                Appears on the customer-facing proposal — edit before sending
              </p>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                {draft.proposal_summary}
              </p>
            </Card>
          </div>
        )}

        {/* ── SECTION: Estimator notes ───────────────────────────────── */}
        {draft.confidence_notes && (
          <div>
            <SectionLabel>Estimator notes</SectionLabel>
            <Card>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {draft.confidence_notes}
              </p>
            </Card>
          </div>
        )}

        {/* ── Footer actions ─────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", paddingTop: "var(--space-1)" }}>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onApply}
            disabled={needsMeasurementConfirmation}
            title={needsMeasurementConfirmation ? "Confirm estimated measurements above before applying" : undefined}
          >
            Apply to estimate
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onRedescribe}>
            Re-describe
          </Button>
          {needsMeasurementConfirmation && (
            <span style={{ fontSize: "var(--text-xs)", color: "#92400e" }}>
              Confirm measurements above to enable Apply
            </span>
          )}
        </div>

      </div>
    </div>
  );
}
