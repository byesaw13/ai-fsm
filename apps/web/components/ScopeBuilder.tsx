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
import { computeScopeModifier, checkProfitabilityRules } from "@ai-fsm/domain";

interface ScopeBuilderProps {
  category: string;
  basePriceCents: number;
  onChange: (result: ScopeBuilderResult) => void;
}

export interface ScopeBuilderResult {
  components: ScopeComponentValues;
  complexity: ComplexityValues;
  multiplier: number;
  adderCents: number;
  adjustedPriceCents: number;
  violations: { label: string; actual: number; required: number; rule_type: string }[];
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

export function ScopeBuilder({ category, basePriceCents, onChange }: ScopeBuilderProps) {
  const [template, setTemplate] = useState<ScopeTemplate | null>(null);
  const [rules, setRules] = useState<ProfitabilityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [components, setComponents] = useState<ScopeComponentValues>({});
  const [complexity, setComplexity] = useState<ComplexityValues>({});
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/v1/scope-templates?category=${encodeURIComponent(category)}`)
      .then((r) => r.json())
      .then((data: { template: ScopeTemplate | null; profitability_rules: ProfitabilityRule[] }) => {
        if (cancelled) return;
        setTemplate(data.template);
        setRules(data.profitability_rules ?? []);
        // Initialize component values
        if (data.template) {
          const init: ScopeComponentValues = {};
          for (const c of data.template.components) {
            init[c.key] = c.input_type === "boolean" ? false : null;
          }
          setComponents(init);
          const initC: ComplexityValues = {};
          for (const f of data.template.complexity_factors) {
            initC[f.key] = false;
          }
          setComplexity(initC);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, [category]);

  const { multiplier, adderCents, adjustedPriceCents, violations } = useMemo(() => {
    if (!template) return { multiplier: 1.0, adderCents: 0, adjustedPriceCents: basePriceCents, violations: [] };

    const mod = computeScopeModifier(template.complexity_factors, complexity);
    const adjusted = Math.round(basePriceCents * mod.multiplier) + mod.adderCents;

    const sqft = typeof components.wall_sqft === "number" ? components.wall_sqft :
                 typeof components.sqft === "number" ? components.sqft : undefined;

    const v = checkProfitabilityRules(rules, category, {
      totalCents: adjusted,
      sqft,
    });

    return {
      multiplier: mod.multiplier,
      adderCents: mod.adderCents,
      adjustedPriceCents: adjusted,
      violations: v.map((viol) => ({
        label: viol.rule.description ?? viol.rule.rule_type,
        actual: viol.actual,
        required: viol.required,
        rule_type: viol.rule.rule_type,
      })),
    };
  }, [template, complexity, components, basePriceCents, rules, category]);

  // Notify parent on changes
  useEffect(() => {
    onChange({ components, complexity, multiplier, adderCents, adjustedPriceCents, violations });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [components, complexity, multiplier, adderCents, adjustedPriceCents]);

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
              {formatModifier(multiplier, adderCents, basePriceCents)}
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

          {/* Modifier Summary */}
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
                Base price
              </span>
              <span
                style={{
                  marginLeft: "var(--space-2)",
                  fontSize: "var(--text-sm)",
                  color: hasModifiers ? "var(--fg-muted)" : "var(--fg)",
                  textDecoration: hasModifiers ? "line-through" : "none",
                }}
              >
                {formatDollars(basePriceCents)}
              </span>
              {hasModifiers && (
                <>
                  <span style={{ margin: "0 var(--space-1)", color: "var(--fg-muted)" }}>→</span>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--accent)" }}>
                    {formatDollars(adjustedPriceCents)}
                  </span>
                  <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                    ({formatModifier(multiplier, adderCents, basePriceCents)})
                  </span>
                </>
              )}
            </div>
          </div>

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
        </div>
      )}
    </div>
  );
}
