"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents, parseDollarsToCents } from "@ai-fsm/money";

type LineItemType = "labor" | "materials" | "handling_fee" | "adjustment";

interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
  line_item_type: LineItemType;
}

interface Props {
  invoiceId: string;
  jobId: string | null;
  lineItems: LineItem[];
}

const TYPE_LABELS: Record<LineItemType, string> = {
  labor: "Labor",
  materials: "Materials",
  handling_fee: "Handling fee",
  adjustment: "Adjustment / Discount",
};

const TYPES = Object.keys(TYPE_LABELS) as LineItemType[];

// Shared field style for the editor rows. minWidth:0 lets flex items shrink below
// their content so a narrow column wraps cleanly instead of clipping the controls.
const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "var(--text-xs)",
  color: "var(--fg-muted)",
  minWidth: 0,
};

function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function InvoiceLineItemsEditor({ invoiceId, jobId, lineItems }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({
    description: "",
    quantity: "1",
    unit_price: "0.00",
    line_item_type: "labor" as LineItemType,
  });

  async function request(path: string, init: RequestInit) {
    setPending(true);
    setError("");
    try {
      const res = await fetch(path, init);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error?.message ?? "Invoice line item update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error while updating line items");
    } finally {
      setPending(false);
    }
  }

  async function addLineItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.description.trim()) return;
    await request(`/api/v1/invoices/${invoiceId}/line-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: draft.description.trim(),
        quantity: Number(draft.quantity),
        unit_price_cents: parseDollarsToCents(draft.unit_price),
        line_item_type: draft.line_item_type,
      }),
    });
    setDraft({ description: "", quantity: "1", unit_price: "0.00", line_item_type: "labor" });
  }

  // Read the whole row's current (uncommitted) input values, so a PATCH always
  // sends the latest of every field together. Per-field merges against the
  // `item` prop are stale until a refresh lands, so a second edit could revert
  // the first; reading the live DOM avoids that.
  function readRow(tr: HTMLTableRowElement) {
    const get = (f: string) => tr.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-f="${f}"]`)?.value ?? "";
    return {
      description: get("description").trim(),
      quantity: Number(get("quantity")),
      unit_price_cents: parseDollarsToCents(get("price")),
      line_item_type: get("type") as LineItemType,
    };
  }

  async function commitRow(item: LineItem, el: HTMLElement) {
    const tr = el.closest("tr");
    if (!tr) return;
    const v = readRow(tr as HTMLTableRowElement);
    if (!v.description || isNaN(v.quantity) || v.quantity <= 0) return; // invalid — leave as-is
    const unchanged =
      v.description === item.description &&
      v.quantity === item.quantity &&
      v.unit_price_cents === item.unit_price_cents &&
      v.line_item_type === item.line_item_type;
    if (unchanged) return;
    await request(`/api/v1/invoices/${invoiceId}/line-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v),
    });
  }

  async function deleteLineItem(item: LineItem) {
    if (!confirm(`Delete "${item.description}"?`)) return;
    await request(`/api/v1/invoices/${invoiceId}/line-items/${item.id}`, { method: "DELETE" });
  }

  async function laborFromTime() {
    await request(`/api/v1/invoices/${invoiceId}/labor-from-time`, { method: "POST" });
  }

  const subtotal = lineItems.reduce((s, i) => s + i.total_cents, 0);

  return (
    <div data-testid="invoice-line-items-editor">
      {error && (
        <div style={{
          padding: "var(--space-2) var(--space-3)",
          background: "var(--color-red-50)",
          color: "var(--color-danger)",
          borderRadius: "var(--radius-sm)",
          fontSize: "var(--text-sm)",
          marginBottom: "var(--space-3)"
        }} data-testid="invoice-line-items-error">
          {error}
        </div>
      )}

      {jobId && (
        <div style={{ marginBottom: "var(--space-3)" }}>
          <button
            type="button"
            onClick={laborFromTime}
            disabled={pending}
            className="p7-btn p7-btn-secondary p7-btn-sm"
            data-testid="invoice-labor-from-time-btn"
          >
            + Pull labor from tracked time
          </button>
        </div>
      )}

      {/* Line items table — sturdy and scannable */}
      <div className="p7-table-wrapper p7-invoice-line-items">
        <table className="p7-table" style={{ fontSize: "var(--text-sm)" }}>
          <thead>
            <tr>
              <th className="p7-col-desc">Description</th>
              <th className="p7-col-type">Type</th>
              <th className="p7-col-qty" style={{ textAlign: "right" }}>Qty</th>
              <th className="p7-col-price" style={{ textAlign: "right" }}>Unit Price</th>
              <th className="p7-col-total" style={{ textAlign: "right" }}>Line Total</th>
              <th className="p7-col-actions" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {lineItems.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--fg-muted)" }}>
                  No line items yet. Add below.
                </td>
              </tr>
            )}

            {lineItems.map((item) => {
              const lineTotal = item.total_cents;
              return (
                <tr key={item.id} data-testid="invoice-line-item-edit-row">
                  <td>
                    <input
                      type="text"
                      data-f="description"
                      defaultValue={item.description}
                      disabled={pending}
                      className="input"
                      style={{ width: "100%", fontSize: "inherit", padding: "6px 8px" }}
                      onBlur={(e) => commitRow(item, e.target)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>
                  <td>
                    <select
                      data-f="type"
                      defaultValue={item.line_item_type}
                      disabled={pending}
                      className="input"
                      style={{ fontSize: "inherit", padding: "6px 6px" }}
                      onChange={(e) => commitRow(item, e.target)}
                    >
                      {TYPES.map((t) => (
                        <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      data-f="quantity"
                      defaultValue={item.quantity}
                      disabled={pending}
                      className="input"
                      style={{ width: '100%', maxWidth: '80px', textAlign: "right", fontSize: "inherit", padding: "6px 6px" }}
                      onBlur={(e) => commitRow(item, e.target)}
                    />
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                    <input
                      type="number"
                      step="0.01"
                      data-f="price"
                      defaultValue={centsToDollars(item.unit_price_cents)}
                      disabled={pending}
                      className="input"
                      style={{ width: '100%', maxWidth: '100px', textAlign: "right", fontSize: "inherit", padding: "6px 6px" }}
                      onBlur={(e) => commitRow(item, e.target)}
                    />
                  </td>
                  <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
                    {formatCents(lineTotal)}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => deleteLineItem(item)}
                      disabled={pending}
                      aria-label="Delete line item"
                      className="p7-btn p7-btn-secondary"
                      style={{
                        minWidth: 44, minHeight: 44, padding: "8px 12px", fontSize: 20, lineHeight: 1,
                        border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)"
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={(e) => commitRow(item, e.currentTarget)}
                      disabled={pending}
                      aria-label="Save changes to this line"
                      className="p7-btn p7-btn-secondary"
                      style={{
                        minWidth: 44, minHeight: 44, padding: "6px 8px", fontSize: 14, lineHeight: 1,
                        border: "1px solid var(--border)", background: "transparent", color: "var(--fg-muted)"
                      }}
                      title="Save"
                    >
                      ✓
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
              <td colSpan={4} style={{ textAlign: "right", fontWeight: 600, paddingTop: "var(--space-2)" }}>Subtotal (items)</td>
              <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontWeight: 700, paddingTop: "var(--space-2)" }}>
                {formatCents(subtotal)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Add new line — always available, commits cleanly */}
      <form
        onSubmit={addLineItem}
        className="p7-invoice-add-form"
        style={{
          marginTop: "var(--space-3)",
          paddingTop: "var(--space-3)",
          borderTop: "1px solid var(--border)"
        }}
        data-testid="invoice-line-item-add-form"
      >
        <label style={fieldStyle}>
          Description
          <input
            value={draft.description}
            onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
            placeholder="Describe the work or material"
            disabled={pending}
            required
            className="input"
          />
        </label>
        <label style={fieldStyle}>
          Type
          <select
            value={draft.line_item_type}
            onChange={(e) => setDraft((d) => ({ ...d, line_item_type: e.target.value as LineItemType }))}
            disabled={pending}
            className="input"
          >
            {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        <label style={fieldStyle}>
          Qty
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={draft.quantity}
            onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))}
            disabled={pending}
            className="input"
          />
        </label>
        <label style={fieldStyle}>
          Unit price
          <input
            type="number"
            step="0.01"
            value={draft.unit_price}
            onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value }))}
            disabled={pending}
            className="input"
          />
        </label>

        <button
          type="submit"
          disabled={pending || !draft.description.trim()}
          className="p7-btn p7-btn-primary"
          style={{ height: 38 }}
        >
          Add line
        </button>

        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", paddingBottom: 4 }}>
          Live totals update on save
        </div>
      </form>
    </div>
  );
}
