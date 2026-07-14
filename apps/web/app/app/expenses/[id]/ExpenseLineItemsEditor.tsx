"use client";

import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { formatCents } from "@ai-fsm/money";

export interface ExpenseLineItemDraft {
  id?: string;
  name: string;
  quantity: number;
  unit_cost_cents: number;
  sku: string | null;
}

interface Props {
  expenseId: string;
  initialLineItems: ExpenseLineItemDraft[];
  billed: boolean;
  canEdit: boolean;
}

export function ExpenseLineItemsEditor({ expenseId, initialLineItems, billed, canEdit }: Props) {
  const [items, setItems] = useState<ExpenseLineItemDraft[]>(initialLineItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function updateItem(index: number, patch: Partial<ExpenseLineItemDraft>) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
    setSaved(false);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function addItem() {
    setItems((prev) => [...prev, { name: "", quantity: 1, unit_cost_cents: 0, sku: null }]);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/expenses/${expenseId}/line-items`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_items: items
            .filter((item) => item.name.trim().length > 0)
            .map((item) => ({
              name: item.name.trim(),
              quantity: item.quantity,
              unit_cost_cents: item.unit_cost_cents,
              sku: item.sku,
            })),
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to save line items.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (items.length === 0 && (billed || !canEdit)) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)", fontStyle: "italic" }}>
        No itemized line items for this receipt.
      </p>
    );
  }

  if (billed) {
    return (
      <div>
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          This receipt is on an invoice — line items are locked. Edit the invoice to change amounts.
        </p>
        <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {items.map((item, i) => (
            <li
              key={item.id ?? i}
              style={{ display: "flex", justifyContent: "space-between", padding: "var(--space-1) 0", fontSize: "var(--text-sm)" }}
            >
              <span>{item.name} × {item.quantity}</span>
              <span>{formatCents(item.quantity * item.unit_cost_cents)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "var(--space-2)" }}>
        {items.map((item, i) => (
          <li key={item.id ?? i} style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}>
              <Input
                id={`line-item-name-${i}`}
                label={i === 0 ? "Item" : undefined}
                value={item.name}
                onChange={(e) => updateItem(i, { name: e.target.value })}
                disabled={!canEdit || saving}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id={`line-item-qty-${i}`}
                label={i === 0 ? "Qty" : undefined}
                type="number"
                min="0.01"
                step="0.01"
                value={String(item.quantity)}
                onChange={(e) => updateItem(i, { quantity: parseFloat(e.target.value) || 0 })}
                disabled={!canEdit || saving}
              />
            </div>
            <div style={{ flex: 1 }}>
              <Input
                id={`line-item-cost-${i}`}
                label={i === 0 ? "Unit Cost ($)" : undefined}
                type="number"
                min="0"
                step="0.01"
                value={(item.unit_cost_cents / 100).toFixed(2)}
                onChange={(e) =>
                  updateItem(i, { unit_cost_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })
                }
                disabled={!canEdit || saving}
              />
            </div>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => removeItem(i)} disabled={saving}>
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>

      {canEdit && (
        <div style={{ display: "flex", gap: "var(--space-2)", marginTop: "var(--space-3)", alignItems: "center" }}>
          <Button variant="ghost" size="sm" onClick={addItem} disabled={saving}>
            + Add line
          </Button>
          <Button variant="secondary" size="sm" onClick={save} loading={saving}>
            Save line items
          </Button>
          {saved && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-success, green)" }}>Saved</span>}
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--color-error, red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
