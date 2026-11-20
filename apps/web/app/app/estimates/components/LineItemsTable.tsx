"use client";

import { Button } from "@/components/ui";
import { formatCents } from "@/lib/estimates/pricing";
import { LINE_ITEM_TYPE_CHOICES, lineTotal, parseCents, type LineItemRow } from "@/lib/estimates/form-helpers";
import { markupLabel } from "@/lib/estimates/cost-split";
import {
  HOURS_MISSING_LABEL,
  PERSON_HOURS_HINT,
  PERSON_HOURS_LABEL,
  hoursAreMissing,
} from "@/lib/estimates/stored-hours";

function lineShowsHours(row: LineItemRow): boolean {
  if (!row.line_item_type || row.line_item_type === "labor") return true;
  return Boolean((row.hours_low ?? "").trim() || (row.hours_high ?? "").trim());
}

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
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-2)",
        }}
      >
        {/* New tab so the in-progress estimate form is not lost */}
        <a
          href="/app/price-book"
          target="_blank"
          rel="noopener noreferrer"
          data-testid={`${p}price-book-link`}
          style={{ color: "var(--accent)", fontWeight: 600, fontSize: "var(--text-sm)", textDecoration: "none" }}
        >
          Price Book ↗
        </a>
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
        <div className="line-items-editor" style={{ overflowX: "auto" }}>
          {items.some(lineShowsHours) && (
            <p className="muted" style={{ fontSize: "var(--text-xs)", margin: "0 0 var(--space-2)" }}>
              {PERSON_HOURS_LABEL}. {PERSON_HOURS_HINT}
            </p>
          )}
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
                  <td data-label="Description">
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
                    <select
                      className="p7-select"
                      aria-label="Line type"
                      value={row.line_item_type ?? "labor"}
                      onChange={(e) => onUpdate(i, "line_item_type", e.target.value)}
                      disabled={disabled}
                      data-testid={`${p}line-item-type-${i}`}
                      style={{ marginTop: "var(--space-1)", fontSize: "var(--text-sm)" }}
                    >
                      {LINE_ITEM_TYPE_CHOICES.map((choice) => (
                        <option key={choice.value} value={choice.value}>{choice.label}</option>
                      ))}
                    </select>
                    {row.prepared_group_key && (
                      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
                        From prepared scope. Apply to quote replaces this line.
                      </div>
                    )}
                    {lineShowsHours(row) && (
                      <div className="line-item-hours">
                        <span className="line-item-hours-label">
                          {PERSON_HOURS_LABEL}
                        </span>
                        <input
                          className="p7-input line-item-hours-input"
                          type="number"
                          min="0"
                          step="0.25"
                          inputMode="decimal"
                          placeholder="Low"
                          aria-label={`${PERSON_HOURS_LABEL} low`}
                          value={row.hours_low ?? ""}
                          onChange={(e) => onUpdate(i, "hours_low", e.target.value)}
                          disabled={disabled}
                          data-testid={`${p}line-item-hours-low-${i}`}
                        />
                        <input
                          className="p7-input line-item-hours-input"
                          type="number"
                          min="0"
                          step="0.25"
                          inputMode="decimal"
                          placeholder="High"
                          aria-label={`${PERSON_HOURS_LABEL} high`}
                          value={row.hours_high ?? ""}
                          onChange={(e) => onUpdate(i, "hours_high", e.target.value)}
                          disabled={disabled}
                          data-testid={`${p}line-item-hours-high-${i}`}
                        />
                        {(!row.line_item_type || row.line_item_type === "labor") && hoursAreMissing(row.hours_low, row.hours_high) && (
                          <span
                            className="line-item-hours-missing"
                            data-testid={`${p}line-item-hours-missing-${i}`}
                          >
                            {HOURS_MISSING_LABEL}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td data-label="Qty">
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
                  <td data-label="Unit price">
                    <input
                      className="p7-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.unit_price}
                      placeholder="Price needed"
                      onChange={(e) => onUpdate(i, "unit_price", e.target.value)}
                      disabled={disabled}
                      data-testid={`${p}line-item-price-${i}`}
                    />
                    {markupLabel({
                      unit_price_cents: parseCents(row.unit_price),
                      unit_cost_cents: row.unit_cost_cents ?? null,
                    }) && (
                      <div className="muted" style={{ fontSize: "var(--text-xs)", marginTop: "var(--space-1)" }}>
                        {markupLabel({
                          unit_price_cents: parseCents(row.unit_price),
                          unit_cost_cents: row.unit_cost_cents ?? null,
                        })}
                      </div>
                    )}
                  </td>
                  <td data-label="Total" style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", paddingLeft: "var(--space-2)" }}>
                    {row.unit_price.trim() === "" ? "Price needed" : formatCents(lineTotal(row))}
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
