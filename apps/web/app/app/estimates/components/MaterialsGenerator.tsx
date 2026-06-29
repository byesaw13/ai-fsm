"use client";

import { useEffect, useState } from "react";
import type { AssessmentRoom } from "@ai-fsm/domain";
import { preserveScope } from "@/lib/estimates/assessment-context";
import { MaterialsMetadata } from "./MaterialsMetadata";

const JOB_TYPES = [
  { value: "deck_build", label: "Deck Build (new)" },
  { value: "deck_repair", label: "Deck Repair / Refinish" },
  { value: "interior_paint", label: "Interior Painting" },
  { value: "exterior_paint", label: "Exterior Painting" },
  { value: "drywall", label: "Drywall / Patching" },
  { value: "flooring", label: "Flooring Install" },
  { value: "tile", label: "Tile Work" },
  { value: "framing", label: "Framing / Structural" },
  { value: "trim_molding", label: "Trim & Molding" },
  { value: "fence_build", label: "Fence Build" },
  { value: "bathroom_reno", label: "Bathroom Renovation" },
  { value: "carpentry_custom", label: "Custom Carpentry / Build" },
  { value: "general_repair", label: "General Repair" },
  { value: "other", label: "Other" },
];

const CATEGORY_LABELS: Record<string, string> = {
  paint: "Paint",
  lumber: "Lumber",
  hardware: "Hardware",
  concrete: "Concrete",
  fasteners: "Fasteners",
  sheet_goods: "Sheet Goods",
  trim: "Trim",
  flooring: "Flooring",
  other: "Other",
};

export interface MaterialItem {
  name: string;
  brand: string | null;
  category: string;
  base_quantity: number;
  waste_factor_pct: number;
  quantity: number;
  unit: string;
  unit_cost_cents: number;
  total_cost_cents: number;
  confidence: "calculated" | "estimated";
  notes: string;
  price_book_id: string | null;
}

// One canonical room shape across assessment-derived flows (TASK-018).
export type RoomMeasurement = AssessmentRoom;

interface Props {
  initialScope?: string;
  initialJobType?: string;
  rooms?: RoomMeasurement[];
  /** Source assessment, so generation can pull the canonical summary server-side. */
  visitId?: string | null;
  assessmentId?: string | null;
  onAddToEstimate: (items: MaterialItem[]) => void;
  onClose: () => void;
}

function formatCentsDisplay(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function MaterialsGenerator({
  initialScope = "",
  initialJobType = "",
  rooms = [],
  visitId = null,
  assessmentId = null,
  onAddToEstimate,
  onClose,
}: Props) {
  const [scope, setScope] = useState(initialScope);
  // Tracks whether the user has hand-edited the scope field. Once they have,
  // we stop overwriting their text when a fresh initialScope arrives.
  const [scopeDirty, setScopeDirty] = useState(false);
  const [jobType, setJobType] = useState(initialJobType);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    items: MaterialItem[];
    summary_notes: string;
    total_cost_cents: number;
    assumptions?: string[];
    missing_measurements?: string[];
    excluded_customer_supplied_items?: string[];
  } | null>(null);
  const [editedItems, setEditedItems] = useState<MaterialItem[]>([]);
  const [savingPrices, setSavingPrices] = useState(false);
  const [saveToBook, setSaveToBook] = useState(true);

  // Resync scope when a fresh initialScope arrives (e.g. the assessment is
  // edited while the generator is open) — but only while the user has not
  // manually edited the field, so we never wipe their typing (preserveScope).
  useEffect(() => {
    setScope((current) => preserveScope(current, initialScope, scopeDirty));
  }, [initialScope, scopeDirty]);

  async function generate() {
    if (!scope.trim() || !jobType) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/v1/estimates/ai-materials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          job_type: jobType,
          rooms,
          ...(visitId ? { visit_id: visitId } : {}),
          ...(assessmentId ? { assessment_id: assessmentId } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Generation failed");
        return;
      }
      setResult(data.data);
      setEditedItems(data.data.items);
    } catch {
      setError("Network error — try again");
    } finally {
      setGenerating(false);
    }
  }

  function updateItem(idx: number, field: keyof MaterialItem, value: string | number) {
    setEditedItems((prev) =>
      prev.map((item, i) => {
        if (i !== idx) return item;
        const updated = { ...item, [field]: value };
        if (field === "quantity" || field === "unit_cost_cents") {
          updated.total_cost_cents = Math.round(
            Number(updated.quantity) * Number(updated.unit_cost_cents)
          );
        }
        return updated;
      })
    );
  }

  function removeItem(idx: number) {
    setEditedItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAddToEstimate() {
    if (saveToBook) {
      setSavingPrices(true);
      try {
        const newItems = editedItems.filter((i) => !i.price_book_id);
        if (newItems.length > 0) {
          await fetch("/api/v1/materials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: newItems.map((i) => ({
                name: i.name,
                brand: i.brand,
                category: i.category,
                unit: i.unit,
                unit_cost_cents: i.unit_cost_cents,
              })),
            }),
          });
        }
      } catch { /* saving prices is best-effort */ }
      setSavingPrices(false);
    }
    onAddToEstimate(editedItems);
  }

  const editedTotal = editedItems.reduce((s, i) => s + i.total_cost_cents, 0);

  // Group items by category for display
  const grouped = editedItems.reduce<Record<string, { item: MaterialItem; idx: number }[]>>(
    (acc, item, idx) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push({ item, idx });
      return acc;
    },
    {}
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", maxWidth: 760 }}>
      {/* Scope input */}
      {!result && (
        <>
          <div>
            <label htmlFor="mat-job-type" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
              Job Type
            </label>
            <select
              id="mat-job-type"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              style={{ width: "100%", maxWidth: 280 }}
            >
              <option value="">Select job type…</option>
              {JOB_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="mat-scope" style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-1)" }}>
              Describe the job
            </label>
            <textarea
              id="mat-scope"
              rows={4}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setScopeDirty(true);
              }}
              placeholder="e.g. Build a 10x10 freestanding ground-level deck with pressure treated lumber, diagonal decking pattern, 3 steps, no railing..."
              style={{ width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
            />
          </div>

          {rooms.length > 0 && (
            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", background: "var(--bg-subtle)", padding: "var(--space-2) var(--space-3)", borderRadius: "var(--radius)" }}>
              Using {rooms.length} room measurement{rooms.length > 1 ? "s" : ""} from assessment
            </div>
          )}

          {error && <div className="p7-card-danger" role="alert">{error}</div>}

          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button
              type="button"
              onClick={generate}
              disabled={generating || !scope.trim() || !jobType}
              className="p7-btn p7-btn-primary p7-btn-sm"
            >
              {generating ? "Generating…" : "Generate Materials List"}
            </button>
            <button type="button" onClick={onClose} className="p7-btn p7-btn-ghost p7-btn-sm">
              Cancel
            </button>
          </div>
        </>
      )}

      {/* Results */}
      {result && (
        <>
          {result.summary_notes && (
            <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", background: "var(--bg-subtle)", padding: "var(--space-3)", borderRadius: "var(--radius)", border: "1px solid var(--accent)" }}>
              {result.summary_notes}
            </div>
          )}

          <MaterialsMetadata metadata={result} />

          {Object.entries(grouped).map(([cat, group]) => (
            <div key={cat}>
              <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--fg-muted)", marginBottom: "var(--space-1)" }}>
                {CATEGORY_LABELS[cat] ?? cat}
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-xs)" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={{ textAlign: "left", padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)", fontWeight: 500 }}>Item</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)", fontWeight: 500, width: 70 }}>Qty</th>
                    <th style={{ textAlign: "left", padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)", fontWeight: 500, width: 60 }}>Unit</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)", fontWeight: 500, width: 90 }}>Unit $</th>
                    <th style={{ textAlign: "right", padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)", fontWeight: 500, width: 90 }}>Total</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {group.map(({ item, idx }) => (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-subtle, #f0f0f0)" }}>
                      <td style={{ padding: "var(--space-1) var(--space-2)" }}>
                        <div style={{ fontWeight: 500 }}>
                          {item.name}
                          {item.price_book_id && (
                            <span style={{ marginLeft: "var(--space-1)", fontSize: "0.65rem", background: "var(--color-success-subtle, #dcfce7)", color: "var(--color-success, #16a34a)", borderRadius: "4px", padding: "1px 4px" }}>
                              your price
                            </span>
                          )}
                          {item.confidence === "estimated" && (
                            <span style={{ marginLeft: "var(--space-1)", fontSize: "0.65rem", background: "var(--color-warning-subtle, #fef3c7)", color: "var(--color-warning, #d97706)", borderRadius: "4px", padding: "1px 4px" }}>
                              estimate
                            </span>
                          )}
                        </div>
                        <div style={{ color: "var(--fg-muted)", fontSize: "0.65rem", marginTop: 1 }}>{item.notes}</div>
                      </td>
                      <td style={{ padding: "var(--space-1) var(--space-2)", textAlign: "right" }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, "quantity", parseFloat(e.target.value) || 0)}
                          style={{ width: 55, textAlign: "right", fontSize: "var(--text-xs)" }}
                        />
                      </td>
                      <td style={{ padding: "var(--space-1) var(--space-2)", color: "var(--fg-muted)" }}>{item.unit}</td>
                      <td style={{ padding: "var(--space-1) var(--space-2)", textAlign: "right" }}>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={(item.unit_cost_cents / 100).toFixed(2)}
                          onChange={(e) => updateItem(idx, "unit_cost_cents", Math.round(parseFloat(e.target.value) * 100) || 0)}
                          style={{ width: 68, textAlign: "right", fontSize: "var(--text-xs)" }}
                        />
                      </td>
                      <td style={{ padding: "var(--space-1) var(--space-2)", textAlign: "right", fontWeight: 500 }}>
                        {formatCentsDisplay(item.total_cost_cents)}
                      </td>
                      <td style={{ padding: "var(--space-1) var(--space-2)", textAlign: "center" }}>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-xs)", padding: 0 }}
                          aria-label="Remove"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div style={{ display: "flex", justifyContent: "flex-end", fontWeight: 700, fontSize: "var(--text-sm)", paddingTop: "var(--space-2)", borderTop: "2px solid var(--border)" }}>
            Estimated materials total: {formatCentsDisplay(editedTotal)}
          </div>

          {error && <div className="p7-card-danger" role="alert">{error}</div>}

          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={saveToBook}
                onChange={(e) => setSaveToBook(e.target.checked)}
              />
              Save new prices to my materials price book (speeds up future estimates)
            </label>

            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleAddToEstimate}
                disabled={savingPrices || editedItems.length === 0}
                className="p7-btn p7-btn-primary p7-btn-sm"
              >
                {savingPrices ? "Saving…" : "Add to Estimate →"}
              </button>
              <button
                type="button"
                onClick={() => { setResult(null); setEditedItems([]); }}
                className="p7-btn p7-btn-ghost p7-btn-sm"
              >
                Start Over
              </button>
              <button type="button" onClick={onClose} className="p7-btn p7-btn-ghost p7-btn-sm">
                Close
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
