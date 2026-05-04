"use client";

import { useState, useCallback } from "react";

interface LineItem {
  id?: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  total_cents?: number;
  sort_order: number;
}

interface ChangeOrder {
  id: string;
  title: string;
  description: string | null;
  status: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  declined_at: string | null;
  created_at: string;
  line_items: LineItem[];
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const statusColors: Record<string, string> = {
  draft: "var(--fg-muted)",
  sent: "var(--accent)",
  approved: "var(--status-success)",
  declined: "var(--status-error)",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  approved: "Approved",
  declined: "Declined",
};

interface ChangeOrdersClientProps {
  estimateId: string;
  initialChangeOrders: ChangeOrder[];
}

export function ChangeOrdersClient({ estimateId, initialChangeOrders }: ChangeOrdersClientProps) {
  const [changeOrders, setChangeOrders] = useState(initialChangeOrders);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "", quantity: 1, unit_price_cents: 0, sort_order: 0 },
  ]);

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setNotes("");
    setLineItems([{ description: "", quantity: 1, unit_price_cents: 0, sort_order: 0 }]);
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    const validItems = lineItems.filter((item) => item.description.trim() && item.unit_price_cents > 0);
    if (validItems.length === 0) {
      setError("Add at least one line item with a price");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const url = editingId
        ? `/api/v1/change-orders?id=${editingId}`
        : "/api/v1/change-orders";
      const method = "POST";

      const body = editingId
        ? { title: title.trim(), description: description.trim() || null, notes: notes.trim() || null, line_items: validItems.map((item, i) => ({ ...item, description: item.description.trim(), sort_order: i })) }
        : { estimate_id: estimateId, title: title.trim(), description: description.trim() || null, notes: notes.trim() || null, tax_rate: 0, line_items: validItems.map((item, i) => ({ ...item, description: item.description.trim(), sort_order: i })) };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? "Failed to save");
      }

      // Refresh
      const listRes = await fetch(`/api/v1/change-orders?estimate_id=${estimateId}`);
      const listData = await listRes.json();
      setChangeOrders(listData.data ?? []);

      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (id: string, action: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/change-orders?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? `Failed to ${action}`);
      }
      const listRes = await fetch(`/api/v1/change-orders?estimate_id=${estimateId}`);
      const listData = await listRes.json();
      setChangeOrders(listData.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const addItem = () => {
    setLineItems([...lineItems, { description: "", quantity: 1, unit_price_cents: 0, sort_order: lineItems.length }]);
  };

  const removeItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const subtotal = lineItems.reduce((sum, item) => sum + item.quantity * item.unit_price_cents, 0);

  return (
    <div className="card action-card" data-testid="change-orders-panel">
      <h2 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        Change Orders
        {!showForm && !editingId && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            style={{
              fontSize: "var(--text-sm)",
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: "pointer",
              color: "var(--accent)",
            }}
          >
            + New
          </button>
        )}
      </h2>

      {error && (
        <div style={{ padding: "var(--space-2)", background: "var(--status-error)", color: "#fff", borderRadius: 6, fontSize: "var(--text-sm)", marginBottom: "var(--space-3)" }}>
          {error}
        </div>
      )}

      {(showForm || editingId) && (
        <div style={{ marginTop: "var(--space-3)", padding: "var(--space-3)", background: "var(--bg-secondary)", borderRadius: 8 }}>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 4 }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Additional wall repairs"
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)" }}
            />
          </div>
          <div style={{ marginBottom: "var(--space-3)" }}>
            <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 4 }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explain what this change order covers..."
              rows={2}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)", resize: "vertical" }}
            />
          </div>

          <div style={{ marginBottom: "var(--space-3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <label style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Line Items</label>
              <button type="button" onClick={addItem} style={{ fontSize: "var(--text-xs)", color: "var(--accent)", background: "none", border: "none", cursor: "pointer" }}>
                + Add item
              </button>
            </div>
            {lineItems.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
                <div style={{ flex: 3 }}>
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(i, "description", e.target.value)}
                    placeholder="Description"
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, "quantity", parseFloat(e.target.value) || 0)}
                    placeholder="Qty"
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={item.unit_price_cents}
                    onChange={(e) => updateItem(i, "unit_price_cents", parseInt(e.target.value) || 0)}
                    placeholder="Price ¢"
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)" }}
                  />
                </div>
                <div style={{ textAlign: "right", fontSize: "var(--text-sm)", fontWeight: 600, minWidth: 80 }}>
                  {formatDollars(item.quantity * item.unit_price_cents)}
                </div>
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--status-error)", fontSize: 18 }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <div style={{ textAlign: "right", fontSize: "var(--text-sm)", fontWeight: 600, marginTop: 4 }}>
              Subtotal: {formatDollars(subtotal)}
            </div>
          </div>

          <div style={{ marginBottom: "var(--space-3)" }}>
            <label style={{ display: "block", fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: 4 }}>Internal Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={1}
              style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "var(--text-sm)", resize: "vertical" }}
            />
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={resetForm}
              style={{ padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: "var(--text-sm)" }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              style={{ padding: "6px 16px", borderRadius: 6, border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: "var(--text-sm)", opacity: saving ? 0.6 : 1 }}
              disabled={saving}
            >
              {saving ? "Saving..." : editingId ? "Update" : "Create Draft"}
            </button>
          </div>
        </div>
      )}

      {changeOrders.length === 0 && !showForm && (
        <p className="muted" style={{ marginTop: "var(--space-2)" }}>
          No change orders yet. Add scope changes or additional work to this approved estimate.
        </p>
      )}

      {changeOrders.length > 0 && (
        <div style={{ marginTop: "var(--space-3)" }}>
          {changeOrders.map((co) => (
            <div
              key={co.id}
              style={{
                padding: "var(--space-3)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{co.title}</div>
                  {co.description && (
                    <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", marginTop: 2 }}>{co.description}</div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      padding: "2px 8px",
                      borderRadius: 4,
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      color: statusColors[co.status] ?? "var(--fg-muted)",
                      border: `1px solid ${statusColors[co.status] ?? "var(--border)"}`,
                    }}
                  >
                    {statusLabels[co.status] ?? co.status}
                  </span>
                  <span style={{ fontWeight: 700, fontSize: "var(--text-sm)" }}>{formatDollars(co.total_cents)}</span>
                </div>
              </div>

              {co.line_items && co.line_items.length > 0 && (
                <table style={{ width: "100%", fontSize: "var(--text-sm)", borderCollapse: "collapse", marginBottom: 8 }}>
                  <tbody>
                    {co.line_items.map((item, i) => (
                      <tr key={item.id ?? i} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "4px 0" }}>{item.description}</td>
                        <td style={{ padding: "4px 0", textAlign: "right", color: "var(--fg-muted)" }}>
                          {item.quantity} × {formatDollars(item.unit_price_cents)}
                        </td>
                        <td style={{ padding: "4px 0", textAlign: "right", fontWeight: 600 }}>
                          {formatDollars(item.total_cents ?? item.quantity * item.unit_price_cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {co.notes && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", fontStyle: "italic", marginBottom: 8 }}>
                  Note: {co.notes}
                </div>
              )}

              {co.approved_by_name && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  Approved by {co.approved_by_name} on {new Date(co.approved_at!).toLocaleDateString()}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                {co.status === "draft" && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(co.id);
                        setTitle(co.title);
                        setDescription(co.description ?? "");
                        setNotes(co.notes ?? "");
                        setLineItems(co.line_items.length > 0 ? co.line_items : [{ description: "", quantity: 1, unit_price_cents: 0, sort_order: 0 }]);
                        setShowForm(true);
                      }}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontSize: "var(--text-xs)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(co.id, "send")}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--accent)", background: "transparent", color: "var(--accent)", cursor: "pointer", fontSize: "var(--text-xs)" }}
                    >
                      Send
                    </button>
                  </>
                )}
                {co.status === "sent" && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleAction(co.id, "approve")}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "var(--status-success)", color: "#fff", cursor: "pointer", fontSize: "var(--text-xs)" }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAction(co.id, "decline")}
                      style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--status-error)", background: "transparent", color: "var(--status-error)", cursor: "pointer", fontSize: "var(--text-xs)" }}
                    >
                      Decline
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
