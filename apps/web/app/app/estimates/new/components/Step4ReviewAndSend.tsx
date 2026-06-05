"use client";

import { useState } from "react";
import { Card, SectionHeader } from "@/components/ui";
import type { Client, Job, Property } from "../hooks/useEstimateForm";
import type { LineItemRow } from "@/lib/estimates/form-helpers";
import type { PaintingEstimateResult } from "../hooks/useEstimatePricing";
import type { EstimateLiveIntel } from "../hooks/useEstimateLiveIntel";

interface Step4Props {
  pending: boolean;
  serviceType: "painting" | "generic";
  mode: "itemized" | "flat_rate" | "multi_option";
  selectedClient: Client | undefined;
  selectedJob: Job | undefined;
  selectedProperty: Property | undefined;
  lineItems: LineItemRow[];
  expiresAt: string;
  notes: string;
  paintingResult: PaintingEstimateResult | null;
  sendImmediately: boolean;
  setSendImmediately: (v: boolean) => void;
  reviewTotal: () => string;
  intel: EstimateLiveIntel;
}

function fmt$(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const MARGIN_COLOR: Record<EstimateLiveIntel["marginStatus"], string> = {
  green:  "#16a34a",
  yellow: "#d97706",
  red:    "#dc2626",
};

export function Step4ReviewAndSend({
  pending, serviceType, mode,
  selectedClient, selectedJob, selectedProperty,
  lineItems, expiresAt, notes,
  paintingResult, sendImmediately, setSendImmediately,
  reviewTotal,
  intel,
}: Step4Props) {
  const [view, setView] = useState<"customer" | "internal">("customer");

  const {
    totalCents, depositCents, balanceDueCents,
    estimatedLaborCostCents, materialsTotalCents, estimatedProfitCents,
    grossMarginPct, marginStatus, isMarginReliable, revenuePerLaborHourCents,
    materialsBySection, hasAnyMaterials,
    guardrailReview,
  } = intel;

  const mc = MARGIN_COLOR[marginStatus];
  const hasBlockers = guardrailReview.blockers.length > 0;
  const realWarnings = guardrailReview.warnings.filter(
    (w) => !(w.field === "pricing" && w.message.includes("passed"))
  );

  const typeLabel =
    serviceType === "painting"
      ? "Painting"
      : mode === "flat_rate"
      ? "Flat rate"
      : mode === "multi_option"
      ? "Good / Better / Best"
      : `Itemized (${lineItems.filter((r) => r.description.trim()).length} item${lineItems.filter((r) => r.description.trim()).length !== 1 ? "s" : ""})`;

  return (
    <div className="p7-form-stack">

      {/* ── Card A: Summary ─────────────────────────────────────────────── */}
      <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
        <SectionHeader title="Estimate Summary" as="h3" />

        {/* Who */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--space-1) var(--space-4)", fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          <span style={{ color: "var(--fg-muted)" }}>Client</span>
          <span style={{ fontWeight: 600 }}>{selectedClient?.name ?? "—"}</span>
          {selectedJob && (<>
            <span style={{ color: "var(--fg-muted)" }}>Job</span>
            <span>{selectedJob.title}</span>
          </>)}
          {selectedProperty && (<>
            <span style={{ color: "var(--fg-muted)" }}>Property</span>
            <span>{selectedProperty.address}</span>
          </>)}
          <span style={{ color: "var(--fg-muted)" }}>Type</span>
          <span style={{ textTransform: "capitalize" }}>{typeLabel}</span>
          {expiresAt && (<>
            <span style={{ color: "var(--fg-muted)" }}>Expires</span>
            <span>{new Date(expiresAt).toLocaleDateString()}</span>
          </>)}
        </div>

        {/* ── Card B: Customer / Internal toggle ──────────────────────── */}
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
          {/* Tab switcher */}
          <div style={{ display: "flex", gap: 4, marginBottom: "var(--space-3)" }}>
            {(["customer", "internal"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                style={{
                  flex: 1,
                  padding: "6px 12px",
                  borderRadius: "var(--radius-sm)",
                  border: `1px solid ${view === v ? "var(--accent)" : "var(--border)"}`,
                  background: view === v ? "var(--accent)" : "var(--bg-surface)",
                  color: view === v ? "#fff" : "var(--fg)",
                  fontSize: "var(--text-xs)",
                  fontWeight: view === v ? 700 : 400,
                  cursor: "pointer",
                }}
              >
                {v === "customer" ? "Customer View" : "Internal View"}
              </button>
            ))}
          </div>

          {view === "customer" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-1) var(--space-4)", fontSize: "var(--text-sm)" }}>
              <span>Project Total</span>
              <span style={{ fontWeight: 800, fontSize: "var(--text-lg)", textAlign: "right" }}>{fmt$(totalCents)}</span>
              {depositCents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Deposit due</span>
                  <span style={{ textAlign: "right" }}>{fmt$(depositCents)}</span>
                  <span style={{ color: "var(--fg-muted)" }}>Balance due</span>
                  <span style={{ textAlign: "right" }}>{fmt$(balanceDueCents)}</span>
                </>
              )}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "var(--space-1) var(--space-4)", fontSize: "var(--text-sm)" }}>
              <span style={{ color: "var(--fg-muted)" }}>Est. labor cost</span>
              <span style={{ textAlign: "right" }}>{fmt$(estimatedLaborCostCents)}</span>
              <span style={{ color: "var(--fg-muted)" }}>Material cost</span>
              <span style={{ textAlign: "right" }}>{fmt$(materialsTotalCents)}</span>
              <span>Total revenue</span>
              <span style={{ fontWeight: 700, textAlign: "right" }}>{fmt$(totalCents)}</span>
              <hr style={{ gridColumn: "1/-1", border: "none", borderTop: "1px dashed var(--border)", margin: "4px 0" }} />
              <span style={{ fontWeight: 600 }}>Est. Profit</span>
              <span style={{ fontWeight: 800, textAlign: "right", color: estimatedProfitCents >= 0 ? "var(--fg)" : "#dc2626" }}>
                {fmt$(estimatedProfitCents)}
              </span>
              {isMarginReliable ? (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Margin</span>
                  <span style={{ textAlign: "right", color: mc, fontWeight: 700 }}>{grossMarginPct}%</span>
                  {revenuePerLaborHourCents > 0 && (
                    <>
                      <span style={{ color: "var(--fg-muted)" }}>Revenue/hr</span>
                      <span style={{ textAlign: "right" }}>{fmt$(revenuePerLaborHourCents)}/hr</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Margin</span>
                  <span style={{ textAlign: "right", fontStyle: "italic", color: "var(--fg-muted)" }}>Enter labor hours</span>
                </>
              )}
            </div>
          )}
        </div>

        {notes.trim() && (
          <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-3)", borderTop: "1px solid var(--border)" }}>
            <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Client notes
            </p>
            <p style={{ margin: 0, fontSize: "var(--text-sm)" }}>{notes}</p>
          </div>
        )}
      </Card>

      {/* ── Card C: Shopping list preview ───────────────────────────────── */}
      <Card padding="sm">
        <SectionHeader
          title={`Materials${hasAnyMaterials ? ` — est. ${fmt$(materialsTotalCents)}` : ""}`}
          as="h3"
        />
        {hasAnyMaterials ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {materialsBySection.map((sec) => (
              <div key={sec.section} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--fg-muted)" }}>{sec.section}</span>
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    {sec.items.length} item{sec.items.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontWeight: 600 }}>{fmt$(sec.section_total_cents)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
            No materials captured — enter scope measurements in Step 2 to auto-calculate.
          </p>
        )}
      </Card>

      {/* ── Card D: Full guardrail list ─────────────────────────────────── */}
      {(hasBlockers || realWarnings.length > 0) && (
        <Card padding="sm" style={{ borderColor: hasBlockers ? "#dc2626" : "#d97706" }}>
          <SectionHeader title="Pricing Review" as="h3" />
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            {guardrailReview.blockers.map((b, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "#dc2626" }}>
                <span>✗</span><span>{b.message}</span>
              </div>
            ))}
            {realWarnings.map((w, i) => (
              <div key={i} style={{ display: "flex", gap: "var(--space-2)", fontSize: "var(--text-sm)", color: "#d97706" }}>
                <span>⚠</span><span>{w.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {!hasBlockers && realWarnings.length === 0 && (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "#16a34a" }}>✓ Pricing guardrails passed</p>
      )}

      {/* Painting incomplete error */}
      {serviceType === "painting" && !paintingResult && (
        <Card className="p7-card-danger" padding="sm">
          <p style={{ margin: 0 }}>
            Painting estimate is incomplete — go back to Step 2 and enter the square footage.
          </p>
        </Card>
      )}

      {/* Guardrail blocker message */}
      {hasBlockers && (
        <Card padding="sm" style={{ background: "#fef2f2", borderColor: "#dc2626" }}>
          <p style={{ margin: 0, fontWeight: 600, color: "#dc2626", fontSize: "var(--text-sm)" }}>
            Pricing blocked — resolve the issues above before submitting.
          </p>
        </Card>
      )}

      {/* ── Send options ─────────────────────────────────────────────────── */}
      <div>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={sendImmediately}
            onChange={(e) => setSendImmediately(e.target.checked)}
            disabled={pending}
            data-testid="send-immediately-checkbox"
          />
          <span>Send to client immediately after creating</span>
        </label>
      </div>
    </div>
  );
}
