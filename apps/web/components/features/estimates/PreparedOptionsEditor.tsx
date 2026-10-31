"use client";

import type { PreparedAlternative } from "@ai-fsm/domain";
import { Button } from "@/components/ui";

interface Props {
  options: PreparedAlternative[];
  editable: boolean;
  onChange: (next: PreparedAlternative[]) => void;
}

const label: React.CSSProperties = { fontSize: "var(--text-xs)", color: "var(--fg-muted)" };

function dollarsValue(cents: number | null | undefined): string {
  return cents == null ? "" : (cents / 100).toFixed(2);
}

function parseDollars(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

/**
 * Options the customer can ask to add (TASK-224). They show in their own
 * "Optional add-ons" block on the customer quote and never change its total.
 * New options get their real id from the server on Save.
 */
export function PreparedOptionsEditor({ options, editable, onChange }: Props) {
  function patch(id: string, p: Partial<PreparedAlternative>) {
    onChange(options.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }

  if (!editable && options.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)", marginTop: "var(--space-3)" }} data-testid="prepared-options">
      <h3 style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)" }}>Options</h3>
      <p style={{ ...label, margin: "0 0 var(--space-2)" }}>
        The customer sees these as optional add-ons with their price, apart from the quote total.
      </p>
      <div style={{ display: "grid", gap: "var(--space-3)" }}>
        {options.map((a) => (
          <div key={a.id} style={{ display: "grid", gap: "var(--space-2)", paddingLeft: "var(--space-2)", borderLeft: "3px solid var(--accent)" }}>
            <label>
              <span style={label}>What it is</span>
              <input className="p7-input" value={a.label} maxLength={200} disabled={!editable} placeholder="e.g. Paint the foyer stairwell walls"
                onChange={(e) => patch(a.id, { label: e.target.value })} />
            </label>
            <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ flex: "0 1 140px" }}>
                <span style={label}>Price $</span>
                <input className="p7-input" type="number" min="0" step="1" inputMode="decimal" value={dollarsValue(a.price_cents)} placeholder="No price yet" disabled={!editable}
                  onChange={(e) => patch(a.id, { price_cents: parseDollars(e.target.value) })} />
              </label>
              <label style={{ flex: "1 1 240px" }}>
                <span style={label}>Why choose it (shown to the customer)</span>
                <input className="p7-input" value={a.note ?? ""} maxLength={500} disabled={!editable}
                  onChange={(e) => patch(a.id, { note: e.target.value || null })} />
              </label>
              {editable && (
                <Button variant="secondary" onClick={() => onChange(options.filter((o) => o.id !== a.id))} aria-label={`Remove option ${a.label || "without a name"}`}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {editable && (
        <div style={{ marginTop: "var(--space-2)" }}>
          <Button variant="secondary" onClick={() => onChange([...options, { id: `new-${Date.now()}`, label: "", task_ids: [], note: null, price_cents: null }])}>
            Add option
          </Button>
          <span style={{ ...label, marginLeft: "var(--space-2)" }}>An option without a name is dropped on Save.</span>
        </div>
      )}
    </div>
  );
}
