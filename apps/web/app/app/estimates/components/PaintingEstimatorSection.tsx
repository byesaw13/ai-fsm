"use client";

import React from "react";
import { Card, Input, SectionHeader } from "@/components/ui";
import { formatCents } from "@/lib/estimates/pricing";
import { PREP_LEVEL_MULTIPLIERS } from "@ai-fsm/domain";

export interface PaintingPreviewResult {
  labor_flat_rate_cents: number;
  material_cents?: number;
  material_handling_cents: number;
  total_cents: number;
  deposit_cents: number;
  balance_cents: number;
  internal_labor_cost_cents: number;
  gross_margin_pct: number;
  gross_margin_cents: number;
  effective_sq_ft_rate_cents?: number;
}

interface PaintingEstimatorSectionProps {
  idPrefix?: string;
  disabled?: boolean;
  sqFt: string;
  setSqFt: (v: string) => void;
  laborHours: string;
  setLaborHours: (v: string) => void;
  materialCostDollars: string;
  setMaterialCostDollars: (v: string) => void;
  prepLevel: number;
  setPrepLevel: (v: number) => void;
  includesTrim: boolean;
  setIncludesTrim: (v: boolean) => void;
  includesCeiling: boolean;
  setIncludesCeiling: (v: boolean) => void;
  paintingResult: PaintingPreviewResult | null;
  prepLevelLabels?: Record<number, string>;
  scopeParserSlot?: React.ReactNode;
}

export function PaintingEstimatorSection({
  idPrefix = "",
  disabled,
  sqFt, setSqFt,
  laborHours, setLaborHours,
  materialCostDollars, setMaterialCostDollars,
  prepLevel, setPrepLevel,
  includesTrim, setIncludesTrim,
  includesCeiling, setIncludesCeiling,
  paintingResult,
  prepLevelLabels,
  scopeParserSlot,
}: PaintingEstimatorSectionProps) {
  const p = idPrefix ? `${idPrefix}-` : "";

  return (
    <div>
      <SectionHeader title="Painting Estimator" as="h3" />

      {scopeParserSlot}

      <div className="p7-form-grid p7-form-grid-2">
        <Input
          id={`${p}sq-ft`}
          label="Square Footage"
          type="number"
          min="1"
          step="1"
          value={sqFt}
          onChange={(e) => setSqFt(e.target.value)}
          disabled={disabled}
          placeholder="e.g. 1200"
        />

        <Input
          id={`${p}labor-hours`}
          label="Estimated Labor Hours"
          type="number"
          min="0.5"
          step="0.5"
          value={laborHours}
          onChange={(e) => setLaborHours(e.target.value)}
          disabled={disabled}
          placeholder="Optional — for your reference"
          hint="Engine estimates margin from square footage"
        />

        <Input
          id={`${p}material-cost`}
          label="Material Cost ($)"
          type="number"
          min="0"
          step="0.01"
          value={materialCostDollars}
          onChange={(e) => setMaterialCostDollars(e.target.value)}
          disabled={disabled}
          placeholder="e.g. 350.00"
        />

        <div className="p7-field">
          <label className="p7-label" htmlFor={`${p}prep-level`}>Prep Level</label>
          <select
            id={`${p}prep-level`}
            className="p7-select"
            value={prepLevel}
            onChange={(e) => setPrepLevel(Number(e.target.value))}
            disabled={disabled}
          >
            {Object.entries(PREP_LEVEL_MULTIPLIERS).map(([level, mult]) => (
              <option key={level} value={level}>
                {prepLevelLabels?.[Number(level)] ?? `Level ${level} (${mult}x)`}
              </option>
            ))}
          </select>
          <span className="p7-field-hint">
            Multiplier: {PREP_LEVEL_MULTIPLIERS[prepLevel]?.toFixed(2)}x base rate
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includesTrim}
            onChange={(e) => setIncludesTrim(e.target.checked)}
            disabled={disabled}
          />
          <span>Include trim (+$0.20/sq ft)</span>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={includesCeiling}
            onChange={(e) => setIncludesCeiling(e.target.checked)}
            disabled={disabled}
          />
          <span>Include ceiling (+30% surface)</span>
        </label>
      </div>

      {paintingResult ? (
        <div style={{ marginTop: "var(--space-4)" }}>
          <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
            <SectionHeader title="Estimate Preview" as="h4" />
            <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
              <span style={{ color: "var(--fg-muted)" }}>Labor</span>
              <span>{formatCents(paintingResult.labor_flat_rate_cents)}</span>

              {(paintingResult.material_cents ?? 0) > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Materials</span>
                  <span>{formatCents(paintingResult.material_cents!)}</span>
                </>
              )}

              {paintingResult.material_handling_cents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Handling fee (15%)</span>
                  <span>{formatCents(paintingResult.material_handling_cents)}</span>
                </>
              )}

              <strong>Total</strong>
              <strong>{formatCents(paintingResult.total_cents)}</strong>

              {paintingResult.deposit_cents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Deposit due</span>
                  <span>{formatCents(paintingResult.deposit_cents)}</span>
                  <span style={{ color: "var(--fg-muted)" }}>Balance due</span>
                  <span>{formatCents(paintingResult.balance_cents)}</span>
                </>
              )}
            </div>

            <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
              <SectionHeader title="Internal Margin" as="h4" />
              <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
                <span style={{ color: "var(--fg-muted)" }}>Estimated labor cost</span>
                <span>{formatCents(paintingResult.internal_labor_cost_cents)}</span>

                <span style={{ color: "var(--fg-muted)" }}>Gross margin</span>
                <span style={{
                  color: paintingResult.gross_margin_pct >= 30 ? "var(--color-success)" : paintingResult.gross_margin_pct >= 15 ? "var(--color-warning)" : "var(--color-danger)",
                  fontWeight: 600,
                }}>
                  {paintingResult.gross_margin_pct}% ({formatCents(paintingResult.gross_margin_cents)})
                </span>

                {paintingResult.effective_sq_ft_rate_cents !== undefined && (
                  <>
                    <span style={{ color: "var(--fg-muted)" }}>Effective rate</span>
                    <span>${(paintingResult.effective_sq_ft_rate_cents / 100).toFixed(2)}/sq ft</span>
                  </>
                )}
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
          Enter the square footage above to see the estimate preview.
        </p>
      )}
    </div>
  );
}
