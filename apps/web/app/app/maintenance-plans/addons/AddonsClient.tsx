"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Addon {
  id: string;
  name: string;
  description: string | null;
  annual_price_cents: number;
  is_active: boolean;
  sort_order: number;
  subscription_count: string;
}

interface Props {
  initialAddons: Addon[];
}

function dollars(cents: number) {
  return (cents / 100).toFixed(0);
}

export function AddonsClient({ initialAddons }: Props) {
  const router = useRouter();
  const [addons, setAddons] = useState(initialAddons);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blank = { name: "", description: "", annual_price_dollars: "", is_active: true, sort_order: "0" };
  const [form, setForm] = useState(blank);

  function startEdit(a: Addon) {
    setEditingId(a.id);
    setShowNew(false);
    setForm({
      name: a.name,
      description: a.description ?? "",
      annual_price_dollars: dollars(a.annual_price_cents),
      is_active: a.is_active,
      sort_order: String(a.sort_order),
    });
    setError(null);
  }

  function startNew() {
    setShowNew(true);
    setEditingId(null);
    setForm(blank);
    setError(null);
  }

  function cancel() {
    setShowNew(false);
    setEditingId(null);
    setError(null);
  }

  async function handleSave(id?: string) {
    setSaving(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      annual_price_cents: Math.round((parseFloat(form.annual_price_dollars) || 0) * 100),
      is_active: form.is_active,
      sort_order: parseInt(form.sort_order) || 0,
    };
    try {
      const res = await fetch(id ? `/api/v1/plan-addons/${id}` : "/api/v1/plan-addons", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error?.message ?? "Failed to save");
        return;
      }
      cancel();
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(a: Addon) {
    const res = await fetch(`/api/v1/plan-addons/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !a.is_active }),
    });
    if (res.ok) {
      setAddons((prev) => prev.map((x) => x.id === a.id ? { ...x, is_active: !x.is_active } : x));
    }
  }

  function AddonFormRow({ isNew, id }: { isNew?: boolean; id?: string }) {
    return (
      <tr style={{ background: "var(--color-surface-raised, #f9fafb)" }}>
        <td style={{ padding: "var(--space-2)" }}>
          <input className="p7-input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Add-on name" style={{ width: "100%" }} />
        </td>
        <td style={{ padding: "var(--space-2)" }}>
          <input className="p7-input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description" style={{ width: "100%" }} />
        </td>
        <td style={{ padding: "var(--space-2)" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary)" }}>$</span>
            <input
              className="p7-input" type="number" min="0" step="1"
              style={{ paddingLeft: 20, width: "100%" }}
              value={form.annual_price_dollars}
              onChange={(e) => setForm((f) => ({ ...f, annual_price_dollars: e.target.value }))}
              placeholder="0"
            />
          </div>
        </td>
        <td style={{ padding: "var(--space-2)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            <span style={{ fontSize: "var(--font-size-xs)" }}>Active</span>
          </label>
        </td>
        <td style={{ padding: "var(--space-2)" }}>
          <div style={{ display: "flex", gap: "var(--space-1)" }}>
            <button
              type="button"
              className="p7-btn p7-btn-primary p7-btn-sm"
              disabled={saving || !form.name.trim()}
              onClick={() => handleSave(id)}
            >
              {saving ? "…" : "Save"}
            </button>
            <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={cancel}>Cancel</button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ color: "var(--color-error, #dc2626)", fontSize: "var(--font-size-sm)", marginBottom: "var(--space-3)" }}>{error}</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--color-border)" }}>
              <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Name</th>
              <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Description</th>
              <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Annual Price</th>
              <th style={{ textAlign: "left", padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>Status</th>
              <th style={{ padding: "var(--space-2) var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                <button type="button" className="p7-btn p7-btn-primary p7-btn-sm" onClick={startNew} disabled={showNew || !!editingId}>
                  + Add
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {showNew && <AddonFormRow isNew />}
            {addons.map((a) => (
              editingId === a.id ? (
                <AddonFormRow key={a.id} id={a.id} />
              ) : (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--color-border)", opacity: a.is_active ? 1 : 0.55 }}>
                  <td style={{ padding: "var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>{a.name}</td>
                  <td style={{ padding: "var(--space-3)", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>{a.description ?? "—"}</td>
                  <td style={{ padding: "var(--space-3)", fontSize: "var(--font-size-sm)", fontWeight: 600 }}>
                    ${dollars(a.annual_price_cents)}<span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>/yr</span>
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(a)}
                      style={{
                        fontSize: "var(--font-size-xs)", padding: "2px 8px", borderRadius: "var(--radius-sm)",
                        border: "1px solid var(--color-border)", cursor: "pointer",
                        background: a.is_active ? "#dcfce7" : "var(--color-surface)",
                        color: a.is_active ? "#166534" : "var(--color-text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      {a.is_active ? "Active" : "Inactive"}
                    </button>
                    {parseInt(a.subscription_count) > 0 && (
                      <span style={{ marginLeft: 6, fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>
                        {a.subscription_count} sub{parseInt(a.subscription_count) !== 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "var(--space-3)" }}>
                    <button type="button" className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => startEdit(a)} disabled={!!editingId || showNew}>
                      Edit
                    </button>
                  </td>
                </tr>
              )
            ))}
            {addons.length === 0 && !showNew && (
              <tr>
                <td colSpan={5} style={{ padding: "var(--space-6)", textAlign: "center", color: "var(--color-text-secondary)", fontSize: "var(--font-size-sm)" }}>
                  No add-ons yet. Click &ldquo;+ Add&rdquo; to create your first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
