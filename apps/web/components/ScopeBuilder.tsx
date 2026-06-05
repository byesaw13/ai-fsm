"use client";

import { useState, useEffect, useMemo } from "react";
import type {
  ScopeTemplate,
  ScopeComponent,
  ComplexityFactor,
  ProfitabilityRule,
  ScopeComponentValues,
  ComplexityValues,
} from "@ai-fsm/domain";
import {
  computeScopeModifier,
  checkProfitabilityRules,
  computeMaterials,
  groupMaterialsBySection,
} from "@ai-fsm/domain";
import type { ServiceMaterial, ComputedMaterial, ProductionRate, ProductionRateModifier, LaborEstimate } from "@ai-fsm/domain";
import { computeLaborDays, formatLaborEstimate } from "@ai-fsm/domain";
import { validateMaterialsForTrade } from "@/lib/estimates/guardrails";

interface ScopeBuilderProps {
  category: string;
  serviceCode?: string;
  unitType?: string | null;
  basePriceCents: number;
  priceMinCents?: number;
  addOnPriceCents?: number | null;
  onChange: (result: ScopeBuilderResult) => void;
  initialScopeValues?: ScopeComponentValues;
  initialComplexityFactors?: string[];
}

export interface ScopeBuilderResult {
  components: ScopeComponentValues;
  complexity: ComplexityValues;
  multiplier: number;
  adderCents: number;
  adjustedPriceCents: number;
  violations: { label: string; actual: number; required: number; rule_type: string }[];
  materials: ComputedMaterial[];
  materialTotalCents: number;
  laborEstimate: LaborEstimate | null;
  isProductionBased: boolean;
  productionDailyRateCents: number | null;
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatModifier(multiplier: number, adderCents: number, baseCents: number): string {
  const parts: string[] = [];
  if (multiplier !== 1.0) parts.push(`×${multiplier.toFixed(2)}`);
  if (adderCents > 0) parts.push(`+${formatDollars(adderCents)}`);
  if (parts.length === 0) return "No modifiers applied";
  const adjusted = Math.round(baseCents * multiplier) + adderCents;
  return `${parts.join(" ")} → ${formatDollars(adjusted)}`;
}

const UNIT_COUNT_KEYS = [
  "fixture_count",
  "device_count",
  "piece_count",
  "mount_count",
  "repair_count",
  "door_count",
  "window_count",
  "unit_count",
  "item_count",
  "quantity",
  "count",
];

const NON_UNIT_COUNT_KEYS = new Set(["coat_count"]);

function findUnitCount(values: ScopeComponentValues): number {
  for (const key of UNIT_COUNT_KEYS) {
    const val = Number(values[key]);
    if (Number.isFinite(val) && val > 0) return Math.max(1, Math.floor(val));
  }

  for (const [key, value] of Object.entries(values)) {
    if (!key.endsWith("_count") || NON_UNIT_COUNT_KEYS.has(key)) continue;
    const val = Number(value);
    if (Number.isFinite(val) && val > 0) return Math.max(1, Math.floor(val));
  }

  return 1;
}

function priceWithUnitCount(
  basePriceCents: number,
  addOnPriceCents: number | null | undefined,
  unitType: string | null | undefined,
  values: ScopeComponentValues,
): number {
  const count = findUnitCount(values);
  if (count <= 1) return basePriceCents;

  if (addOnPriceCents != null) return basePriceCents + (count - 1) * addOnPriceCents;
  if (unitType === "per_unit" || unitType === "per_room") return basePriceCents * count;

  return basePriceCents;
}

function ScopeComponentInput({
  component,
  value,
  onChange,
}: {
  component: ScopeComponent;
  value: string | number | boolean | null;
  onChange: (val: string | number | boolean) => void;
}) {
  if (component.input_type === "boolean") {
    return (
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          cursor: "pointer",
          fontSize: "var(--text-sm)",
        }}
      >
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{component.label}</span>
        {component.unit && (
          <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
            ({component.unit})
          </span>
        )}
      </label>
    );
  }

  if (component.input_type === "select" && component.options) {
    return (
      <div className="p7-field" style={{ marginBottom: 0 }}>
        <label className="p7-label" style={{ fontSize: "var(--text-sm)" }}>
          {component.label}
          {component.required && <span style={{ color: "var(--color-danger)", marginLeft: 2 }}>*</span>}
        </label>
        <select
          className="p7-select"
          value={value as string ?? ""}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontSize: "var(--text-sm)" }}
        >
          <option value="">— select —</option>
          {component.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="p7-field" style={{ marginBottom: 0 }}>
      <label className="p7-label" style={{ fontSize: "var(--text-sm)" }}>
        {component.label}
        {component.unit && (
          <span style={{ color: "var(--fg-muted)", fontWeight: 400, marginLeft: "var(--space-1)" }}>
            ({component.unit})
          </span>
        )}
        {component.required && <span style={{ color: "var(--color-danger)", marginLeft: 2 }}>*</span>}
      </label>
      <input
        type="number"
        className="p7-input"
        value={value as number ?? ""}
        min="0"
        step="any"
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        style={{ fontSize: "var(--text-sm)" }}
      />
    </div>
  );
}

function ComplexityFactorRow({
  factor,
  applied,
  onChange,
}: {
  factor: ComplexityFactor;
  applied: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        gap: "var(--space-3)",
        cursor: "pointer",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius)",
        background: applied ? "var(--bg-subtle)" : "transparent",
        border: `1px solid ${applied ? "var(--accent)" : "var(--border)"}`,
        transition: "background 0.15s",
      }}
    >
      <input
        type="checkbox"
        checked={applied}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: 2, flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)" }}>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: applied ? 600 : 400 }}>
            {factor.label}
          </span>
          <span
            style={{
              fontSize: "var(--text-xs)",
              fontWeight: 600,
              color: applied ? "var(--accent)" : "var(--fg-muted)",
              flexShrink: 0,
            }}
          >
            {factor.factor_type === "multiplier"
              ? `×${factor.default_value.toFixed(2)}`
              : `+${formatDollars(factor.default_value)}`}
          </span>
        </div>
        {factor.description && (
          <p
            style={{
              margin: "2px 0 0",
              fontSize: "var(--text-xs)",
              color: "var(--fg-muted)",
              lineHeight: 1.4,
            }}
          >
            {factor.description}
          </p>
        )}
      </div>
    </label>
  );
}

export function ScopeBuilder({ category, serviceCode, unitType, basePriceCents, priceMinCents, addOnPriceCents, onChange, initialScopeValues, initialComplexityFactors }: ScopeBuilderProps) {
  const [template, setTemplate] = useState<ScopeTemplate | null>(null);
  const [rules, setRules] = useState<ProfitabilityRule[]>([]);
  const [materialRules, setMaterialRules] = useState<ServiceMaterial[]>([]);
  const [productionRates, setProductionRates] = useState<ProductionRate[]>([]);
  const [productionModifiers, setProductionModifiers] = useState<ProductionRateModifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ScopeComponentValues>({});
  const [complexity, setComplexity] = useState<ComplexityValues>({});
  const [expanded, setExpanded] = useState(true);
  const [materialsExpanded, setMaterialsExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/scope-templates?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((data: { template: ScopeTemplate | null; profitability_rules: ProfitabilityRule[]; materials: ServiceMaterial[]; production_rates?: ProductionRate[]; production_rate_modifiers?: ProductionRateModifier[] }) => {
        if (cancelled) return;
        setTemplate(data.template);
        setRules(data.profitability_rules ?? []);
        setMaterialRules(data.materials ?? []);
        setProductionRates(data.production_rates ?? []);
        setProductionModifiers(data.production_rate_modifiers ?? []);
        if (data.template) {
          const init: ScopeComponentValues = {};
          for (const c of data.template.components) {
            init[c.key] = c.input_type === "boolean" ? false : null;
          }
          if (initialScopeValues) {
            for (const [key, val] of Object.entries(initialScopeValues)) {
              if (key in init) init[key] = val;
            }
          }
          setComponents(init);
          const initC: ComplexityValues = {};
          for (const f of data.template.complexity_factors) {
            initC[f.key] = false;
          }
          if (initialComplexityFactors) {
            for (const key of initialComplexityFactors) {
              if (key in initC) initC[key] = true;
            }
          }
          setComplexity(initC);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [category]);

  const { multiplier, adderCents, adjustedPriceCents, effectiveBasePriceCents, violations, computedMaterials, materialTotalCents, laborEstimate, isProductionBased, productionDailyRateCents } = useMemo(() => {
    const empty = { multiplier: 1.0, adderCents: 0, adjustedPriceCents: basePriceCents, effectiveBasePriceCents: basePriceCents, violations: [], computedMaterials: [], materialTotalCents: 0, laborEstimate: null, isProductionBased: false, productionDailyRateCents: null };
    if (!template) return empty;

    const mod = computeScopeModifier(template.complexity_factors, complexity);

    // For per_sqft services, scale base price by the primary area component value
    let effectiveBase = priceWithUnitCount(basePriceCents, addOnPriceCents, unitType, components);
    if (unitType === "per_sqft") {
      const sqftVal = typeof components.wall_sqft === "number" ? components.wall_sqft
                    : typeof components.sqft === "number" ? components.sqft : 0;
      if (sqftVal > 0) effectiveBase = basePriceCents * sqftVal;
    }

    const sqft = typeof components.wall_sqft === "number" ? components.wall_sqft :
                 typeof components.sqft === "number" ? components.sqft : undefined;

    const rawMats = computeMaterials(materialRules, components, complexity);
    const { allowed: mats } = validateMaterialsForTrade(rawMats, category);
    const matTotal = mats.reduce((sum, m) => sum + m.total_cost_cents, 0);

    const activeComplexityKeys = Object.entries(complexity).filter(([, v]) => v).map(([k]) => k);
    const rate = serviceCode ? productionRates.find((r) => r.service_code === serviceCode) ?? null : null;
    const labor = rate
      ? computeLaborDays(rate, productionModifiers, components as Record<string, string | number | boolean | null>, activeComplexityKeys)
      : null;

    // Production-based pricing: for per_sqft services with a production rate,
    // derive price from labor_days × daily_rate instead of sqft × rate × multipliers.
    // daily_rate = per_sqft_rate × sqft_per_day (derived — no extra config needed).
    // Complexity impacts are already captured in production_rate_modifiers (applied inside
    // computeLaborDays), so we skip the scope-factor multiplier to avoid double-counting.
    if (unitType === "per_sqft" && labor && rate && rate.rate_unit === "sqft_per_day") {
      const dailyRateCents = basePriceCents * rate.base_rate; // e.g. 325 ¢/sqft × 200 sqft/day = 65,000 ¢/day
      const rawProductionCents = Math.round(labor.labor_days * dailyRateCents);
      const productionCents = Math.max(priceMinCents ?? 0, rawProductionCents);
      // Express as a multiplier relative to effectiveBase for backward-compatible display
      const productionMultiplier = effectiveBase > 0 ? productionCents / effectiveBase : 1.0;

      const v = checkProfitabilityRules(rules, category, { totalCents: productionCents, sqft });
      return {
        multiplier: productionMultiplier,
        adderCents: 0,
        adjustedPriceCents: productionCents,
        effectiveBasePriceCents: effectiveBase,
        violations: v.map((viol) => ({ label: viol.rule.description ?? viol.rule.rule_type, actual: viol.actual, required: viol.required, rule_type: viol.rule.rule_type })),
        computedMaterials: mats,
        materialTotalCents: matTotal,
        laborEstimate: labor,
        isProductionBased: true,
        productionDailyRateCents: dailyRateCents,
      };
    }

    // Standard path: flat-rate × scope-factor multipliers
    const adjusted = Math.round(effectiveBase * mod.multiplier) + mod.adderCents;
    const v = checkProfitabilityRules(rules, category, { totalCents: adjusted, sqft });

    return {
      multiplier: mod.multiplier,
      adderCents: mod.adderCents,
      adjustedPriceCents: adjusted,
      effectiveBasePriceCents: effectiveBase,
      violations: v.map((viol) => ({
        label: viol.rule.description ?? viol.rule.rule_type,
        actual: viol.actual,
        required: viol.required,
        rule_type: viol.rule.rule_type,
      })),
      computedMaterials: mats,
      materialTotalCents: matTotal,
      laborEstimate: labor,
      isProductionBased: false,
      productionDailyRateCents: null,
    };
  }, [template, complexity, components, basePriceCents, priceMinCents, addOnPriceCents, unitType, rules, category, materialRules, productionRates, productionModifiers, serviceCode]);

  // Notify parent on changes
  useEffect(() => {
    onChange({ components, complexity, multiplier, adderCents, adjustedPriceCents, violations, materials: computedMaterials, materialTotalCents, laborEstimate, isProductionBased, productionDailyRateCents });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, complexity, multiplier, adderCents, adjustedPriceCents, computedMaterials, materialTotalCents]);

  if (loading) {
    return (
      <div style={{ padding: "var(--space-3)", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
        Loading scope template…
      </div>
    );
  }

  if (!template) return null;

  const hasModifiers = multiplier !== 1.0 || adderCents > 0;

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        marginTop: "var(--space-2)",
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "var(--space-2) var(--space-3)",
          background: "var(--bg-subtle)",
          border: "none",
          borderBottom: expanded ? "1px solid var(--border)" : "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "var(--space-3)",
        }}
      >
        <div>
          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
            {template.label} — Scope Details
          </span>
          {!expanded && hasModifiers && (
            <span
              style={{
                marginLeft: "var(--space-2)",
                fontSize: "var(--text-xs)",
                color: "var(--accent)",
                fontWeight: 600,
              }}
            >
              {isProductionBased && laborEstimate
                ? `Production: ${formatLaborEstimate(laborEstimate)} → ${formatDollars(adjustedPriceCents)}`
                : formatModifier(multiplier, adderCents, effectiveBasePriceCents)}
            </span>
          )}
        </div>
        <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          {expanded ? "▲" : "▼"}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: "var(--space-3)" }}>
          {/* Scope Measurements */}
          {template.components.length > 0 && (
            <div style={{ marginBottom: "var(--space-4)" }}>
              <p
                style={{
                  margin: "0 0 var(--space-2)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--fg-muted)",
                }}
              >
                Measurements
              </p>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                {template.components.map((comp) => (
                  <ScopeComponentInput
                    key={comp.key}
                    component={comp}
                    value={components[comp.key] ?? null}
                    onChange={(val) =>
                      setComponents((prev) => ({ ...prev, [comp.key]: val }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Complexity Factors */}
          {template.complexity_factors.length > 0 && (
            <div style={{ marginBottom: "var(--space-3)" }}>
              <p
                style={{
                  margin: "0 0 var(--space-2)",
                  fontSize: "var(--text-xs)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--fg-muted)",
                }}
              >
                Complexity Factors
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {template.complexity_factors.map((factor) => (
                  <ComplexityFactorRow
                    key={factor.key}
                    factor={factor}
                    applied={complexity[factor.key] ?? false}
                    onChange={(val) =>
                      setComplexity((prev) => ({ ...prev, [factor.key]: val }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pricing Summary */}
          {isProductionBased && laborEstimate && productionDailyRateCents !== null ? (
            /* Production-based pricing breakdown */
            <div
              style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                background: "var(--bg-subtle)",
                borderRadius: "var(--radius)",
                border: "1px solid var(--accent)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                <span style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--accent)" }}>
                  Production-based pricing
                </span>
                <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--accent)" }}>
                  {formatDollars(adjustedPriceCents)}
                </span>
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", lineHeight: 1.6 }}>
                <span>{laborEstimate.quantity.toFixed(0)} {laborEstimate.rate_unit.replace("_per_day", "").replace("_", " ")} ÷ {laborEstimate.adjusted_rate.toFixed(0)} {laborEstimate.rate_unit.replace("_", "/")} = {laborEstimate.labor_days} day{laborEstimate.labor_days !== 1 ? "s" : ""}</span>
                <span style={{ margin: "0 var(--space-1)" }}>×</span>
                <span>{formatDollars(productionDailyRateCents)}/day</span>
                {laborEstimate.applied_modifiers.length > 0 && (
                  <span style={{ marginLeft: "var(--space-2)", color: "var(--color-warning, #92400e)" }}>
                    ({laborEstimate.applied_modifiers.map(m => `${m.key.replace(/_/g, " ")} ${Math.round(m.modifier_pct * 100)}%`).join(", ")})
                  </span>
                )}
                {priceMinCents !== undefined && adjustedPriceCents === priceMinCents && (
                  <span style={{ marginLeft: "var(--space-2)", fontStyle: "italic" }}>
                    — minimum applied
                  </span>
                )}
              </div>
            </div>
          ) : (
            /* Standard flat-rate modifier summary */
            <div
              style={{
                marginTop: "var(--space-3)",
                padding: "var(--space-2) var(--space-3)",
                background: hasModifiers ? "var(--bg-subtle)" : "transparent",
                borderRadius: "var(--radius)",
                border: `1px solid ${hasModifiers ? "var(--accent)" : "var(--border)"}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--space-3)",
              }}
            >
              <div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  {unitType === "per_sqft" ? `Base price ($${(basePriceCents / 100).toFixed(2)}/sqft)` : "Base price"}
                </span>
                <span
                  style={{
                    marginLeft: "var(--space-2)",
                    fontSize: "var(--text-sm)",
                    color: (hasModifiers || effectiveBasePriceCents !== basePriceCents) ? "var(--fg-muted)" : "var(--fg)",
                    textDecoration: (hasModifiers || effectiveBasePriceCents !== basePriceCents) ? "line-through" : "none",
                  }}
                >
                  {formatDollars(basePriceCents)}
                </span>
                {(effectiveBasePriceCents !== basePriceCents || hasModifiers) && (
                  <>
                    <span style={{ margin: "0 var(--space-1)", color: "var(--fg-muted)" }}>→</span>
                    <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)" }}>
                      {formatDollars(adjustedPriceCents)}
                    </span>
                    {hasModifiers && (
                      <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                        ({formatModifier(multiplier, adderCents, effectiveBasePriceCents)})
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Labor estimate for non-production services (display only) */}
          {!isProductionBased && laborEstimate && (
            <div style={{
              marginTop: "var(--space-2)",
              padding: "var(--space-2) var(--space-3)",
              background: "var(--bg-subtle)",
              borderRadius: "var(--radius)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
            }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg-muted)", flexShrink: 0 }}>
                Labor estimate:
              </span>
              <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                {formatLaborEstimate(laborEstimate)}
              </span>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                ({laborEstimate.quantity} {laborEstimate.rate_unit.includes("sqft") ? "sqft" : "units"} ÷ {laborEstimate.adjusted_rate.toFixed(0)} {laborEstimate.rate_unit.replace("_", " ")})
              </span>
            </div>
          )}

          {/* Profitability Violations */}
          {violations.length > 0 && (
            <div
              style={{
                marginTop: "var(--space-2)",
                padding: "var(--space-2) var(--space-3)",
                background: "#fef3c7",
                borderRadius: "var(--radius)",
                border: "1px solid #fde68a",
              }}
            >
              <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-xs)", fontWeight: 600, color: "#92400e" }}>
                Profitability guardrails
              </p>
              {violations.map((v, i) => (
                <p key={i} style={{ margin: 0, fontSize: "var(--text-xs)", color: "#92400e" }}>
                  ⚠ {v.label}: {v.rule_type === "min_gross_margin_pct"
                    ? `${v.actual}% margin (minimum ${v.required}%)`
                    : v.rule_type === "min_sqft_rate_cents"
                    ? `$${(v.actual / 100).toFixed(2)}/sqft (minimum $${(v.required / 100).toFixed(2)}/sqft)`
                    : `${formatDollars(v.actual)} (minimum ${formatDollars(v.required)})`}
                </p>
              ))}
            </div>
          )}

          {/* Materials Estimate */}
          {materialRules.length > 0 && (
            <div
              style={{
                marginTop: "var(--space-3)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setMaterialsExpanded((v) => !v)}
                style={{
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--bg-subtle)",
                  border: "none",
                  borderBottom: materialsExpanded ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  textAlign: "left",
                  gap: "var(--space-2)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, flexShrink: 0 }}>
                    Materials List
                  </span>
                  {computedMaterials.length > 0 ? (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      {computedMaterials.length} item{computedMaterials.length !== 1 ? "s" : ""} · est. {formatDollars(materialTotalCents)}
                    </span>
                  ) : (
                    <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      Enter measurements to auto-compute
                    </span>
                  )}
                </div>
                <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", flexShrink: 0 }}>
                  {materialsExpanded ? "▲" : "▼"}
                </span>
              </button>

              {materialsExpanded && (
                <div style={{ padding: "var(--space-3)" }}>
                  {computedMaterials.length === 0 ? (
                    <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", textAlign: "center", padding: "var(--space-2) 0" }}>
                      No materials computed — enter measurements above to auto-calculate quantities.
                    </p>
                  ) : (
                    <>
                      {groupMaterialsBySection(computedMaterials).map((section) => (
                        <div key={section.section} style={{ marginBottom: "var(--space-3)" }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginBottom: "var(--space-1)",
                            }}
                          >
                            <p
                              style={{
                                margin: 0,
                                fontSize: "var(--text-xs)",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                                color: "var(--fg-muted)",
                              }}
                            >
                              {section.section}
                            </p>
                            <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                              {formatDollars(section.section_total_cents)}
                            </span>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            {section.items.map((item) => (
                              <div
                                key={item.material.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "var(--space-2)",
                                  padding: "var(--space-1) var(--space-2)",
                                  background: "var(--bg-subtle)",
                                  borderRadius: "var(--radius)",
                                }}
                              >
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: "var(--text-sm)" }}>
                                    {item.material.material_name}
                                  </span>
                                  {item.material.is_optional && (
                                    <span
                                      style={{
                                        marginLeft: "var(--space-1)",
                                        fontSize: "var(--text-xs)",
                                        color: "var(--fg-muted)",
                                        fontStyle: "italic",
                                      }}
                                    >
                                      optional
                                    </span>
                                  )}
                                </div>
                                <span
                                  style={{
                                    fontSize: "var(--text-xs)",
                                    color: "var(--fg-muted)",
                                    flexShrink: 0,
                                    minWidth: 64,
                                    textAlign: "right",
                                  }}
                                >
                                  {item.quantity} {item.material.unit}
                                </span>
                                <span
                                  style={{
                                    fontSize: "var(--text-sm)",
                                    fontWeight: 500,
                                    flexShrink: 0,
                                    minWidth: 60,
                                    textAlign: "right",
                                  }}
                                >
                                  {formatDollars(item.total_cost_cents)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}

                      <div
                        style={{
                          paddingTop: "var(--space-2)",
                          borderTop: "1px solid var(--border)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "baseline",
                        }}
                      >
                        <div>
                          <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                            Materials subtotal
                          </span>
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginLeft: "var(--space-1)" }}>
                            + 15% handling billed to client
                          </span>
                        </div>
                        <span style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--accent)" }}>
                          {formatDollars(materialTotalCents)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
