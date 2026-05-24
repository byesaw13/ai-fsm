"use client";

import { Button, Card } from "@/components/ui";
import { formatCents } from "@/lib/estimates/pricing";
import { lineTotal, type LineItemRow, type OptionTier } from "@/lib/estimates/form-helpers";

interface EstimateTierEditorProps {
  tiers: OptionTier[];
  taxRateNum: number;
  disabled?: boolean;
  onUpdateTier: (tierIndex: number, updates: Partial<OptionTier>) => void;
  onUpdateTierLineItem: (tierIndex: number, lineIndex: number, field: keyof LineItemRow, value: string) => void;
  onAddTierLineItem: (tierIndex: number) => void;
  onRemoveTierLineItem: (tierIndex: number, lineIndex: number) => void;
  tierSubtotalCents: (tier: OptionTier) => number;
}

export function EstimateTierEditor({
  tiers,
  taxRateNum,
  disabled,
  onUpdateTier,
  onUpdateTierLineItem,
  onAddTierLineItem,
  onRemoveTierLineItem,
  tierSubtotalCents,
}: EstimateTierEditorProps) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
      {tiers.map((tier, ti) => {
        const tierSub = tierSubtotalCents(tier);
        const tierTax = Math.round((tierSub * taxRateNum) / 100);
        const tierTotal = tierSub + tierTax;
        return (
          <Card key={ti} padding="sm" style={{
            border: tier.is_recommended ? "2px solid var(--accent)" : "1px solid var(--border)",
            position: "relative",
          }}>
            {tier.is_recommended && (
              <div style={{
                position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                background: "var(--accent)", color: "#fff", padding: "2px 12px", borderRadius: 99,
                fontSize: "var(--text-xs)", fontWeight: 600, whiteSpace: "nowrap",
              }}>
                Recommended
              </div>
            )}
            <div style={{ marginBottom: "var(--space-2)" }}>
              <input
                className="p7-input"
                type="text"
                value={tier.label}
                onChange={(e) => onUpdateTier(ti, { label: e.target.value })}
                placeholder="Option label"
                disabled={disabled}
                style={{ fontWeight: 700, fontSize: "var(--text-lg)", marginBottom: "var(--space-1)" }}
              />
              <input
                className="p7-input"
                type="text"
                value={tier.description}
                onChange={(e) => onUpdateTier(ti, { description: e.target.value })}
                placeholder="Brief description"
                disabled={disabled}
                style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", cursor: "pointer", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
              <input
                type="checkbox"
                checked={tier.is_recommended}
                onChange={(e) => onUpdateTier(ti, { is_recommended: e.target.checked })}
                disabled={disabled}
              />
              <span>Mark as recommended</span>
            </label>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-2)" }}>
              {tier.line_items.map((row, li) => (
                <div key={li} style={{ marginBottom: "var(--space-2)" }}>
                  <input
                    className="p7-input"
                    type="text"
                    value={row.description}
                    onChange={(e) => onUpdateTierLineItem(ti, li, "description", e.target.value)}
                    placeholder="Description"
                    disabled={disabled}
                    style={{ marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}
                  />
                  <div style={{ display: "flex", gap: "var(--space-2)" }}>
                    <input
                      className="p7-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => onUpdateTierLineItem(ti, li, "quantity", e.target.value)}
                      disabled={disabled}
                      style={{ width: 60, fontSize: "var(--text-sm)" }}
                    />
                    <input
                      className="p7-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unit_price}
                      onChange={(e) => onUpdateTierLineItem(ti, li, "unit_price", e.target.value)}
                      disabled={disabled}
                      style={{ width: 90, fontSize: "var(--text-sm)" }}
                    />
                    <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "var(--space-5)" }}>
                      {formatCents(lineTotal(row))}
                    </span>
                    {tier.line_items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveTierLineItem(ti, li)}
                        disabled={disabled}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: "var(--text-sm)", padding: 0, lineHeight: 1 }}
                        aria-label="Remove line item"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAddTierLineItem(ti)}
                disabled={disabled}
                style={{ width: "100%", marginTop: "var(--space-1)" }}
              >
                + Add item
              </Button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-3)", textAlign: "right" }}>
              {tierTax > 0 && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  Tax: {formatCents(tierTax)}
                </div>
              )}
              <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                {formatCents(tierTotal)}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
