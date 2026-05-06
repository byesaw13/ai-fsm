"use client";

import { useState } from "react";

interface PricingStructure {
  id: string;
  tier: string;
  annual_price_cents: number;
  monthly_price_cents: number;
  is_published: boolean;
  published_at: string | null;
  notes: string | null;
}

interface EditState {
  annual: string;
  monthly: string;
  notes: string;
  publish: boolean;
}

const TIERS = ["essential", "plus", "premier"] as const;
const TIER_LABELS: Record<string, string> = {
  essential: "Essential",
  plus: "Plus",
  premier: "Premier",
};

export function PricingManager({ initial }: { initial: PricingStructure[] }) {
  const [structures, setStructures] = useState<PricingStructure[]>(initial);
  const [editing, setEditing] = useState<Record<string, EditState>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const publishedByTier: Record<string, PricingStructure | undefined> = {};
  for (const s of structures) {
    if (s.is_published) publishedByTier[s.tier] = s;
  }

  function startEdit(tier: string) {
    const pub = publishedByTier[tier];
    setEditing((prev) => ({
      ...prev,
      [tier]: {
        annual: pub ? (pub.annual_price_cents / 100).toFixed(2) : "",
        monthly: pub ? (pub.monthly_price_cents / 100).toFixed(2) : "",
        notes: pub?.notes ?? "",
        publish: true,
      },
    }));
  }

  function cancelEdit(tier: string) {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[tier];
      return next;
    });
  }

  async function save(tier: string) {
    const state = editing[tier];
    if (!state) return;
    setSaving(tier);
    setError(null);

    const annual_price_cents = Math.round(parseFloat(state.annual) * 100);
    const monthly_price_cents = Math.round(parseFloat(state.monthly || "0") * 100);

    if (isNaN(annual_price_cents) || annual_price_cents < 0) {
      setError("Annual price is required.");
      setSaving(null);
      return;
    }

    try {
      const res = await fetch("/api/v1/membership-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          annual_price_cents,
          monthly_price_cents: isNaN(monthly_price_cents) ? 0 : monthly_price_cents,
          is_published: state.publish,
          notes: state.notes || null,
        }),
      });

      if (!res.ok) {
        const json = await res.json();
        setError(json.error?.message ?? "Failed to save pricing.");
        return;
      }

      const json = await res.json();
      const created: PricingStructure = json.data;

      setStructures((prev) => {
        const updated = prev.map((s) =>
          s.tier === tier && state.publish ? { ...s, is_published: false } : s
        );
        return [...updated, created];
      });
      cancelEdit(tier);
    } catch {
      setError("Network error — could not save pricing.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
      {error && (
        <div style={{ color: "var(--color-red-600)", fontSize: "var(--text-sm)" }}>{error}</div>
      )}

      {TIERS.map((tier) => {
        const pub = publishedByTier[tier];
        const isEditing = !!editing[tier];
        const state = editing[tier];

        return (
          <div
            key={tier}
            style={{
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-3)" }}>
              <div>
                <span style={{ fontWeight: "var(--font-semibold)", fontSize: "var(--text-base)" }}>
                  {TIER_LABELS[tier]}
                </span>
                {pub ? (
                  <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    Published: <strong>${(pub.annual_price_cents / 100).toFixed(2)}/yr</strong>
                    {pub.monthly_price_cents > 0 && (
                      <> &middot; ${(pub.monthly_price_cents / 100).toFixed(2)}/mo</>
                    )}
                  </span>
                ) : (
                  <span style={{ marginLeft: "var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                    No published price
                  </span>
                )}
              </div>
              {!isEditing && (
                <button
                  type="button"
                  className="p7-btn p7-btn-secondary p7-btn-sm"
                  onClick={() => startEdit(tier)}
                >
                  {pub ? "Update Price" : "Set Price"}
                </button>
              )}
            </div>

            {isEditing && state && (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                  <div className="p7-field">
                    <label className="p7-label p7-label-required">Annual Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="p7-input"
                      value={state.annual}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [tier]: { ...prev[tier], annual: e.target.value } }))}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="p7-field">
                    <label className="p7-label">Monthly Price ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="p7-input"
                      value={state.monthly}
                      onChange={(e) => setEditing((prev) => ({ ...prev, [tier]: { ...prev[tier], monthly: e.target.value } }))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <div className="p7-field">
                  <label className="p7-label">Notes</label>
                  <input
                    type="text"
                    className="p7-input"
                    value={state.notes}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [tier]: { ...prev[tier], notes: e.target.value } }))}
                    placeholder="Optional internal note"
                  />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={state.publish}
                    onChange={(e) => setEditing((prev) => ({ ...prev, [tier]: { ...prev[tier], publish: e.target.checked } }))}
                  />
                  Publish immediately (makes this the active price for new plans)
                </label>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button
                    type="button"
                    className="p7-btn p7-btn-primary p7-btn-sm"
                    disabled={saving === tier}
                    onClick={() => save(tier)}
                  >
                    {saving === tier ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    className="p7-btn p7-btn-ghost p7-btn-sm"
                    onClick={() => cancelEdit(tier)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
