"use client";

import { Button } from "@/components/ui";
import { formatCents } from "@/lib/estimates/pricing";
import { lineTotal, type LineItemRow } from "@/lib/estimates/form-helpers";

interface LineItemsTableProps {
  items: LineItemRow[];
  disabled?: boolean;
  testIdPrefix?: string;
  onUpdate: (idx: number, field: keyof LineItemRow, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  onDuplicate?: (idx: number) => void;
}

export function LineItemsTable({
  items,
  disabled,
  testIdPrefix = "",
  onUpdate,
  onAdd,
  onRemove,
  onDuplicate,
}: LineItemsTableProps) {
  const p = testIdPrefix ? `${testIdPrefix}-` : "";

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onAdd}
          disabled={disabled}
          data-testid={`${p}add-line-item-btn`}
        >
          + Add Item
        </Button>
      </div>
      {items.length === 0 ? (
        <p style={{ color: "var(--fg-muted)", padding: "var(--space-3) 0" }}>
          No line items. Add at least one.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="line-items-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Description</th>
                <th style={{ width: 80 }}>Qty</th>
                <th style={{ width: 120 }}>Unit Price ($)</th>
                <th style={{ width: 100 }}>Total</th>
                <th style={{ width: onDuplicate ? 90 : 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((row, i) => (
                <tr key={i}>
                  <td>
                    <input
                      className="p7-input"
                      type="text"
                      value={row.description}
                      onChange={(e) => onUpdate(i, "description", e.target.value)}
                      placeholder="Description"
                      required
                      disabled={disabled}
                      data-testid={`${p}line-item-desc-${i}`}
                    />
                  </td>
                  <td>
                    <input
                      className="p7-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={row.quantity}
                      onChange={(e) => onUpdate(i, "quantity", e.target.value)}
                      disabled={disabled}
                      data-testid={`${p}line-item-qty-${i}`}
                    />
                  </td>
                  <td>
                    <input
                      className="p7-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unit_price}
                      onChange={(e) => onUpdate(i, "unit_price", e.target.value)}
                      disabled={disabled}
                      data-testid={`${p}line-item-price-${i}`}
                    />
                  </td>
                  <td style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", paddingLeft: "var(--space-2)" }}>
                    {formatCents(lineTotal(row))}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: "var(--space-1)" }}>
                      {onDuplicate && (
                        <button
                          type="button"
                          className="p7-btn p7-btn-ghost p7-btn-sm"
                          title="Duplicate row"
                          onClick={() => onDuplicate(i)}
                          disabled={disabled}
                          data-testid={`${p}duplicate-line-item-${i}`}
                          aria-label={`Duplicate line item ${i + 1}`}
                        >
                          ⧉
                        </button>
                      )}
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="p7-btn p7-btn-ghost p7-btn-sm"
                          title="Remove row"
                          onClick={() => onRemove(i)}
                          disabled={disabled}
                          data-testid={`${p}remove-line-item-${i}`}
                          aria-label={`Remove line item ${i + 1}`}
                          style={{ color: "var(--color-danger)" }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
