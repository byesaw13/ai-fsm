"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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

function dollarsToCents(value: string): number {
  return Math.round(Number(value || 0) * 100);
}

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
    await request(`/api/v1/invoices/${invoiceId}/line-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: draft.description,
        quantity: Number(draft.quantity),
        unit_price_cents: dollarsToCents(draft.unit_price),
        line_item_type: draft.line_item_type,
      }),
    });
    setDraft({ description: "", quantity: "1", unit_price: "0.00", line_item_type: "labor" });
  }

  async function updateLineItem(item: LineItem, formData: FormData) {
    await request(`/api/v1/invoices/${invoiceId}/line-items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: String(formData.get("description") ?? ""),
        quantity: Number(formData.get("quantity") ?? 0),
        unit_price_cents: dollarsToCents(String(formData.get("unit_price") ?? "0")),
        line_item_type: String(formData.get("line_item_type") ?? item.line_item_type),
      }),
    });
  }

  async function deleteLineItem(item: LineItem) {
    await request(`/api/v1/invoices/${invoiceId}/line-items/${item.id}`, { method: "DELETE" });
  }

  async function laborFromTime() {
    await request(`/api/v1/invoices/${invoiceId}/labor-from-time`, { method: "POST" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }} data-testid="invoice-line-items-editor">
      {error && <p className="error-inline" data-testid="invoice-line-items-error">{error}</p>}

      {jobId && (
        <button
          type="button"
          onClick={laborFromTime}
          disabled={pending}
          className="btn btn-secondary"
          data-testid="invoice-labor-from-time-btn"
          style={{ alignSelf: "flex-start" }}
        >
          Labor from tracked time
        </button>
      )}

      {lineItems.map((item) => (
        <form
          key={item.id}
          action={(formData) => updateLineItem(item, formData)}
          style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "end" }}
          data-testid="invoice-line-item-edit-row"
        >
          <label style={{ ...fieldStyle, flex: "3 1 180px" }}>
            Description
            <input name="description" defaultValue={item.description} disabled={pending} required className="input" />
          </label>
          <label style={{ ...fieldStyle, flex: "2 1 120px" }}>
            Type
            <select name="line_item_type" defaultValue={item.line_item_type} disabled={pending} className="input">
              {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
            </select>
          </label>
          <label style={{ ...fieldStyle, flex: "1 1 70px" }}>
            Qty
            <input name="quantity" type="number" min="0.01" step="0.01" defaultValue={item.quantity} disabled={pending} required className="input" />
          </label>
          <label style={{ ...fieldStyle, flex: "1 1 90px" }}>
            Unit price
            <input name="unit_price" type="number" step="0.01" defaultValue={centsToDollars(item.unit_price_cents)} disabled={pending} required className="input" />
          </label>
          <div style={{ display: "flex", gap: "var(--space-1)", flex: "0 0 auto" }}>
            <button type="submit" disabled={pending} className="btn btn-secondary">Save</button>
            <button type="button" onClick={() => deleteLineItem(item)} disabled={pending} className="btn btn-secondary" aria-label={`Delete ${item.description}`}>Delete</button>
          </div>
        </form>
      ))}

      <form onSubmit={addLineItem} style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "end", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }} data-testid="invoice-line-item-add-form">
        <label style={{ ...fieldStyle, flex: "3 1 180px" }}>
          Description
          <input value={draft.description} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} disabled={pending} required className="input" />
        </label>
        <label style={{ ...fieldStyle, flex: "2 1 120px" }}>
          Type
          <select value={draft.line_item_type} onChange={(e) => setDraft((d) => ({ ...d, line_item_type: e.target.value as LineItemType }))} disabled={pending} className="input">
            {TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
          </select>
        </label>
        <label style={{ ...fieldStyle, flex: "1 1 70px" }}>
          Qty
          <input type="number" min="0.01" step="0.01" value={draft.quantity} onChange={(e) => setDraft((d) => ({ ...d, quantity: e.target.value }))} disabled={pending} required className="input" />
        </label>
        <label style={{ ...fieldStyle, flex: "1 1 90px" }}>
          Unit price
          <input type="number" step="0.01" value={draft.unit_price} onChange={(e) => setDraft((d) => ({ ...d, unit_price: e.target.value }))} disabled={pending} required className="input" />
        </label>
        <button type="submit" disabled={pending} className="btn btn-primary" style={{ flex: "0 0 auto" }}>Add</button>
      </form>
    </div>
  );
}
