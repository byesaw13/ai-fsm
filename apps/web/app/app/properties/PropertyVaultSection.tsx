"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import { computeVaultCompleteness, VAULT_CATEGORIES, VAULT_CATEGORY_LABELS } from "@ai-fsm/domain";
import type { VaultCategory } from "@ai-fsm/domain";
import { VaultItemPhotoPanel } from "./VaultItemPhotoPanel";

interface VaultItem {
  id: string;
  category: VaultCategory;
  name: string;
  location: string | null;
  manufacturer: string | null;
  model_number: string | null;
  serial_number: string | null;
  install_date: string | null;
  last_serviced_date: string | null;
  next_service_date: string | null;
  notes: string | null;
  photo_count: number;
}

interface Props {
  propertyId: string;
  clientId: string;
  initialItems: VaultItem[];
  canEdit: boolean;
}

const BLANK_FORM = {
  category: "mechanical" as VaultCategory,
  name: "",
  location: "",
  manufacturer: "",
  model_number: "",
  serial_number: "",
  install_date: "",
  last_serviced_date: "",
  next_service_date: "",
  notes: "",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function PropertyVaultSection({ propertyId, clientId, initialItems, canEdit }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState<VaultItem[]>(initialItems);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(BLANK_FORM);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Group items by category in canonical order
  const byCategory = VAULT_CATEGORIES.reduce<Record<VaultCategory, VaultItem[]>>(
    (acc, cat) => { acc[cat] = items.filter((i) => i.category === cat); return acc; },
    {} as Record<VaultCategory, VaultItem[]>
  );
  const completeness = computeVaultCompleteness(items);
  const completenessColor =
    completeness.percent === 100
      ? "var(--color-success)"
      : completeness.percent >= 50
      ? "var(--color-primary)"
      : "var(--color-text-secondary)";

  async function handleAdd() {
    if (!form.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/properties/${propertyId}/vault-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          location: form.location || null,
          manufacturer: form.manufacturer || null,
          model_number: form.model_number || null,
          serial_number: form.serial_number || null,
          install_date: form.install_date || null,
          last_serviced_date: form.last_serviced_date || null,
          next_service_date: form.next_service_date || null,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to add item");
        return;
      }
      const { data } = await res.json();
      setItems((prev) => [...prev, { ...data, photo_count: 0 }]);
      setForm(BLANK_FORM);
      setShowAdd(false);
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: VaultItem) {
    setEditingId(item.id);
    setEditForm({
      category: item.category,
      name: item.name,
      location: item.location ?? "",
      manufacturer: item.manufacturer ?? "",
      model_number: item.model_number ?? "",
      serial_number: item.serial_number ?? "",
      install_date: item.install_date ?? "",
      last_serviced_date: item.last_serviced_date ?? "",
      next_service_date: item.next_service_date ?? "",
      notes: item.notes ?? "",
    });
  }

  async function handleEdit(id: string) {
    if (!editForm.name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/vault-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          location: editForm.location || null,
          manufacturer: editForm.manufacturer || null,
          model_number: editForm.model_number || null,
          serial_number: editForm.serial_number || null,
          install_date: editForm.install_date || null,
          last_serviced_date: editForm.last_serviced_date || null,
          next_service_date: editForm.next_service_date || null,
          notes: editForm.notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to update item");
        return;
      }
      const { data } = await res.json();
      setItems((prev) => prev.map((i) => (i.id === id ? data : i)));
      setEditingId(null);
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/v1/vault-items/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error?.message ?? "Failed to delete item");
        return;
      }
      setItems((prev) => prev.filter((i) => i.id !== id));
      router.refresh();
    } catch {
      toast.error("Unexpected error");
    } finally {
      setDeletingId(null);
    }
  }

  const inputStyle: React.CSSProperties = { width: "100%" };

  function VaultItemForm({
    values,
    onChange,
    onSave,
    onCancel,
    saveLabel,
  }: {
    values: typeof BLANK_FORM;
    onChange: (patch: Partial<typeof BLANK_FORM>) => void;
    onSave: () => void;
    onCancel: () => void;
    saveLabel: string;
  }) {
    return (
      <div
        style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)",
          padding: "var(--space-4)", background: "var(--color-surface)",
          border: "1px solid var(--color-border)", borderRadius: "var(--radius-md)",
          marginBottom: "var(--space-3)",
        }}
      >
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="p7-label">Category</label>
          <select className="p7-select" style={inputStyle} value={values.category}
            onChange={(e) => onChange({ category: e.target.value as VaultCategory })}>
            {VAULT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{VAULT_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="p7-label">Name *</label>
          <input className="p7-input" style={inputStyle} value={values.name}
            onChange={(e) => onChange({ name: e.target.value })} placeholder="e.g. HVAC System, Refrigerator" />
        </div>
        <div>
          <label className="p7-label">Location</label>
          <input className="p7-input" style={inputStyle} value={values.location}
            onChange={(e) => onChange({ location: e.target.value })} placeholder="e.g. Basement" />
        </div>
        <div>
          <label className="p7-label">Manufacturer</label>
          <input className="p7-input" style={inputStyle} value={values.manufacturer}
            onChange={(e) => onChange({ manufacturer: e.target.value })} />
        </div>
        <div>
          <label className="p7-label">Model Number</label>
          <input className="p7-input" style={inputStyle} value={values.model_number}
            onChange={(e) => onChange({ model_number: e.target.value })} />
        </div>
        <div>
          <label className="p7-label">Serial Number</label>
          <input className="p7-input" style={inputStyle} value={values.serial_number}
            onChange={(e) => onChange({ serial_number: e.target.value })} />
        </div>
        <div>
          <label className="p7-label">Install Date</label>
          <input className="p7-input" type="date" style={inputStyle} value={values.install_date}
            onChange={(e) => onChange({ install_date: e.target.value })} />
        </div>
        <div>
          <label className="p7-label">Last Serviced</label>
          <input className="p7-input" type="date" style={inputStyle} value={values.last_serviced_date}
            onChange={(e) => onChange({ last_serviced_date: e.target.value })} />
        </div>
        <div>
          <label className="p7-label">Next Service</label>
          <input className="p7-input" type="date" style={inputStyle} value={values.next_service_date}
            onChange={(e) => onChange({ next_service_date: e.target.value })} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label className="p7-label">Notes</label>
          <textarea className="p7-textarea" style={inputStyle} rows={2} value={values.notes}
            onChange={(e) => onChange({ notes: e.target.value })} placeholder="Filter size, paint color code, vendor contact…" />
        </div>
        <div style={{ gridColumn: "1 / -1", display: "flex", gap: "var(--space-2)" }}>
          <button className="p7-btn p7-btn-primary" onClick={onSave} disabled={saving}>{saving ? "Saving…" : saveLabel}</button>
          <button className="p7-btn p7-btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="property-vault-section">
      <div
        data-testid="property-vault-completeness"
        style={{
          marginBottom: "var(--space-4)",
          padding: "var(--space-3)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Vault Completeness
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: "var(--space-2)", flexWrap: "wrap", marginTop: "var(--space-1)" }}>
              <span style={{ fontSize: "var(--font-size-xl)", fontWeight: 700, color: completenessColor }}>
                {completeness.percent}%
              </span>
              <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
                {completeness.coveredCount} of {completeness.totalCount} core categories documented
              </span>
            </div>
          </div>
          {completeness.percent === 100 ? (
            <span style={{ fontSize: "var(--font-size-xs)", fontWeight: 600, color: "var(--color-success)" }}>
              Complete
            </span>
          ) : null}
        </div>
        <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          {completeness.missingCategories.length === 0
            ? "All core categories are represented in the vault."
            : `Missing: ${completeness.missingCategories.map((category) => VAULT_CATEGORY_LABELS[category]).join(", ")}`}
        </p>
      </div>

      {canEdit && !showAdd && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <button className="p7-btn p7-btn-primary" onClick={() => setShowAdd(true)} data-testid="add-vault-item-btn">
            + Add Vault Item
          </button>
        </div>
      )}

      {showAdd && (
        <VaultItemForm
          values={form}
          onChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
          onSave={handleAdd}
          onCancel={() => { setShowAdd(false); setForm(BLANK_FORM); }}
          saveLabel="Add Item"
        />
      )}

      {items.length === 0 && !showAdd && (
        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-text-secondary)" }}>
          No vault items recorded yet. Add the first item to start building this property&apos;s home record.
        </p>
      )}

      {VAULT_CATEGORIES.map((cat) => {
        const catItems = byCategory[cat];
        if (catItems.length === 0) return null;
        return (
          <div key={cat} style={{ marginBottom: "var(--space-5)" }}>
            <h3 style={{
              fontWeight: 600, fontSize: "var(--font-size-sm)",
              color: "var(--color-text-secondary)", textTransform: "uppercase",
              letterSpacing: "0.05em", marginBottom: "var(--space-2)",
              paddingBottom: "var(--space-1)", borderBottom: "1px solid var(--color-border)",
            }}>
              {VAULT_CATEGORY_LABELS[cat]}
              <span style={{ fontWeight: 400, marginLeft: "var(--space-2)" }}>({catItems.length})</span>
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {catItems.map((item) => (
                <div key={item.id} data-testid={`vault-item-${item.id}`}>
                  {editingId === item.id ? (
                    <VaultItemForm
                      values={editForm}
                      onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                      onSave={() => handleEdit(item.id)}
                      onCancel={() => setEditingId(null)}
                      saveLabel="Save Changes"
                    />
                  ) : (
                    <div style={{
                      padding: "var(--space-3)", borderRadius: "var(--radius-md)",
                      background: "var(--color-surface)", border: "1px solid var(--color-border)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: "var(--font-size-sm)", marginBottom: "var(--space-1)", display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                            <span>
                              {item.name}
                              {item.location && (
                                <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: "var(--space-2)" }}>
                                  — {item.location}
                                </span>
                              )}
                            </span>
                            {item.photo_count > 0 && (
                              <span style={{
                                fontSize: "var(--font-size-xs)", fontWeight: 600,
                                color: "var(--color-primary)", background: "color-mix(in srgb, var(--color-primary) 10%, transparent)",
                                borderRadius: "var(--radius-sm)", padding: "1px 6px",
                              }}>
                                {item.photo_count} photo{item.photo_count !== 1 ? "s" : ""}
                              </span>
                            )}
                          </div>
                          {expandedId === item.id && (
                            <>
                              <dl className="p7-detail-list" style={{ marginTop: "var(--space-2)" }}>
                                {item.manufacturer && <div className="p7-detail-row"><dt>Manufacturer</dt><dd>{item.manufacturer}</dd></div>}
                                {item.model_number && <div className="p7-detail-row"><dt>Model</dt><dd>{item.model_number}</dd></div>}
                                {item.serial_number && <div className="p7-detail-row"><dt>Serial</dt><dd>{item.serial_number}</dd></div>}
                                {item.install_date && <div className="p7-detail-row"><dt>Installed</dt><dd>{fmtDate(item.install_date)}</dd></div>}
                                {item.last_serviced_date && <div className="p7-detail-row"><dt>Last Serviced</dt><dd>{fmtDate(item.last_serviced_date)}</dd></div>}
                                {item.next_service_date && <div className="p7-detail-row"><dt>Next Service</dt><dd>{fmtDate(item.next_service_date)}</dd></div>}
                                {item.notes && <div className="p7-detail-row"><dt>Notes</dt><dd style={{ whiteSpace: "pre-wrap" }}>{item.notes}</dd></div>}
                              </dl>
                              <VaultItemPhotoPanel
                                itemId={item.id}
                                canEdit={canEdit}
                                onPhotoCountChange={(count) =>
                                  setItems((prev) =>
                                    prev.map((i) => i.id === item.id ? { ...i, photo_count: count } : i)
                                  )
                                }
                              />
                            </>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                          <button
                            className="p7-btn p7-btn-ghost p7-btn-sm"
                            onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                          >
                            {expandedId === item.id ? "Less" : "Details"}
                          </button>
                          {canEdit && (
                            <>
                              <a
                                href={`/app/estimates/new?client_id=${encodeURIComponent(clientId)}&property_id=${encodeURIComponent(propertyId)}&vault_item_id=${encodeURIComponent(item.id)}`}
                                className="p7-btn p7-btn-secondary p7-btn-sm"
                              >
                                Estimate
                              </a>
                              <button className="p7-btn p7-btn-ghost p7-btn-sm" onClick={() => startEdit(item)}>Edit</button>
                              <button
                                className="p7-btn p7-btn-ghost p7-btn-sm"
                                onClick={() => handleDelete(item.id)}
                                disabled={deletingId === item.id}
                                style={{ color: "var(--color-error, #dc2626)" }}
                              >
                                {deletingId === item.id ? "…" : "Delete"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
