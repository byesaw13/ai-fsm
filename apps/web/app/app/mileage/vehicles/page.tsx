"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Card, SectionHeader } from "@/components/ui";

interface Vehicle {
  id: string;
  nickname: string;
  make: string | null;
  model: string | null;
  year: number | null;
  plate: string | null;
  is_active: boolean;
  is_default: boolean;
  bluetooth_id: string | null;
  current_odometer: number | null;
  total_miles: string | null;
}

const EMPTY_FORM = { nickname: "", make: "", model: "", year: "", plate: "", bluetooth_id: "", is_default: false };

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addPending, setAddPending] = useState(false);
  const [addError, setAddError] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch("/api/v1/vehicles").catch(() => null);
    if (res?.ok) {
      const data = await res.json();
      setVehicles(data.data ?? []);
    } else {
      setError("Failed to load vehicles");
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addForm.nickname.trim()) { setAddError("Nickname is required"); return; }
    setAddPending(true);
    setAddError("");
    const res = await fetch("/api/v1/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: addForm.nickname.trim(),
        make:     addForm.make.trim()  || undefined,
        model:    addForm.model.trim() || undefined,
        year:     addForm.year ? parseInt(addForm.year, 10) : undefined,
        plate:    addForm.plate.trim() || undefined,
      }),
    });
    const data = await res.json();
    setAddPending(false);
    if (!res.ok) { setAddError(data.error?.message ?? "Failed to add vehicle"); return; }
    setAddForm(EMPTY_FORM);
    setShowAdd(false);
    load();
  }

  function startEdit(v: Vehicle) {
    setEditId(v.id);
    setEditForm({
      nickname: v.nickname,
      make:     v.make ?? "",
      model:    v.model ?? "",
      year:     v.year ? String(v.year) : "",
      plate:    v.plate ?? "",
      bluetooth_id: v.bluetooth_id ?? "",
      is_default: v.is_default,
    });
    setEditError("");
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    if (!editForm.nickname.trim()) { setEditError("Nickname is required"); return; }
    setEditPending(true);
    setEditError("");
    const res = await fetch(`/api/v1/vehicles/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nickname: editForm.nickname.trim(),
        make:     editForm.make.trim()  || null,
        model:    editForm.model.trim() || null,
        year:     editForm.year ? parseInt(editForm.year, 10) : null,
        plate:    editForm.plate.trim() || null,
        bluetooth_id: editForm.bluetooth_id.trim() || null,
        is_default: editForm.is_default,
      }),
    });
    const data = await res.json();
    setEditPending(false);
    if (!res.ok) { setEditError(data.error?.message ?? "Failed to update vehicle"); return; }
    setEditId(null);
    load();
  }

  async function handleToggleActive(v: Vehicle) {
    await fetch(`/api/v1/vehicles/${v.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !v.is_active }),
    });
    load();
  }

  const inputStyle: React.CSSProperties = { width: "100%" };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href={"/app/mileage" as Route} className="back-link">← Mileage</Link>
          <h1 className="page-title">Vehicles</h1>
        </div>
        <button
          className="p7-btn p7-btn-primary"
          onClick={() => { setShowAdd(true); setAddError(""); }}
          style={{ display: showAdd ? "none" : undefined }}
        >
          + Add Vehicle
        </button>
      </div>

      {error && <div className="p7-alert p7-alert-danger">{error}</div>}

      {showAdd && (
        <Card>
          <SectionHeader title="New Vehicle" />
          {addError && <div className="p7-alert p7-alert-danger" style={{ marginBottom: "var(--space-3)" }}>{addError}</div>}
          <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <div>
                <label className="p7-label">Nickname *</label>
                <input className="p7-input" style={inputStyle} value={addForm.nickname} onChange={e => setAddForm(f => ({ ...f, nickname: e.target.value }))} placeholder="e.g. Ram 1500" disabled={addPending} autoFocus />
              </div>
              <div>
                <label className="p7-label">License Plate</label>
                <input className="p7-input" style={inputStyle} value={addForm.plate} onChange={e => setAddForm(f => ({ ...f, plate: e.target.value }))} placeholder="e.g. DOVTLS" disabled={addPending} />
              </div>
              <div>
                <label className="p7-label">Make</label>
                <input className="p7-input" style={inputStyle} value={addForm.make} onChange={e => setAddForm(f => ({ ...f, make: e.target.value }))} placeholder="e.g. Ram" disabled={addPending} />
              </div>
              <div>
                <label className="p7-label">Model</label>
                <input className="p7-input" style={inputStyle} value={addForm.model} onChange={e => setAddForm(f => ({ ...f, model: e.target.value }))} placeholder="e.g. 1500" disabled={addPending} />
              </div>
              <div>
                <label className="p7-label">Year</label>
                <input className="p7-input" style={inputStyle} type="number" min="1900" max="2100" value={addForm.year} onChange={e => setAddForm(f => ({ ...f, year: e.target.value }))} placeholder="e.g. 2019" disabled={addPending} />
              </div>
            </div>
            <div className="p7-form-actions">
              <button type="submit" className="p7-btn p7-btn-primary" disabled={addPending}>{addPending ? "Adding…" : "Add Vehicle"}</button>
              <button type="button" className="p7-btn p7-btn-ghost" onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}>Cancel</button>
            </div>
          </form>
        </Card>
      )}

      {loading ? (
        <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>Loading…</p>
      ) : vehicles.length === 0 ? (
        <Card>
          <p style={{ margin: 0, color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>No vehicles yet. Add one above to start logging odometer readings.</p>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {vehicles.map((v) => (
            <Card key={v.id} style={{ opacity: v.is_active ? 1 : 0.6 }}>
              {editId === v.id ? (
                <>
                  {editError && <div className="p7-alert p7-alert-danger" style={{ marginBottom: "var(--space-3)" }}>{editError}</div>}
                  <form onSubmit={handleEdit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
                      <div>
                        <label className="p7-label">Nickname *</label>
                        <input className="p7-input" style={inputStyle} value={editForm.nickname} onChange={e => setEditForm(f => ({ ...f, nickname: e.target.value }))} disabled={editPending} autoFocus />
                      </div>
                      <div>
                        <label className="p7-label">License Plate</label>
                        <input className="p7-input" style={inputStyle} value={editForm.plate} onChange={e => setEditForm(f => ({ ...f, plate: e.target.value }))} disabled={editPending} />
                      </div>
                      <div>
                        <label className="p7-label">Make</label>
                        <input className="p7-input" style={inputStyle} value={editForm.make} onChange={e => setEditForm(f => ({ ...f, make: e.target.value }))} disabled={editPending} />
                      </div>
                      <div>
                        <label className="p7-label">Model</label>
                        <input className="p7-input" style={inputStyle} value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} disabled={editPending} />
                      </div>
                      <div>
                        <label className="p7-label">Year</label>
                        <input className="p7-input" style={inputStyle} type="number" min="1900" max="2100" value={editForm.year} onChange={e => setEditForm(f => ({ ...f, year: e.target.value }))} disabled={editPending} />
                      </div>
                    </div>
                    <div>
                      <label className="p7-label">Bluetooth ID (car stereo MAC)</label>
                      <input className="p7-input" style={inputStyle} value={editForm.bluetooth_id} onChange={e => setEditForm(f => ({ ...f, bluetooth_id: e.target.value }))} placeholder="e.g. 00:22:A0:A6:49:0D (Uconnect)" disabled={editPending} />
                      <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>Auto-tags trips to this vehicle when your phone connects to its stereo.</span>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      <input type="checkbox" checked={editForm.is_default} onChange={e => setEditForm(f => ({ ...f, is_default: e.target.checked }))} disabled={editPending} />
                      Default vehicle (pre-selected when logging a trip)
                    </label>
                    <div className="p7-form-actions">
                      <button type="submit" className="p7-btn p7-btn-primary" disabled={editPending}>{editPending ? "Saving…" : "Save"}</button>
                      <button type="button" className="p7-btn p7-btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                    </div>
                  </form>
                </>
              ) : (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>{v.nickname}</span>
                      {v.plate && (
                        <span style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", letterSpacing: 1, padding: "2px 6px", background: "var(--surface-raised)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)" }}>
                          {v.plate}
                        </span>
                      )}
                      {!v.is_active && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", padding: "2px 6px", background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>Inactive</span>
                      )}
                      {v.is_default && (
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--accent)", padding: "2px 6px", background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>Default</span>
                      )}
                      {v.bluetooth_id && (
                        <span title={v.bluetooth_id} style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", padding: "2px 6px", background: "var(--surface-raised)", borderRadius: "var(--radius-sm)" }}>🔵 BT linked</span>
                      )}
                    </div>
                    {(v.make || v.model || v.year) && (
                      <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                        {[v.year, v.make, v.model].filter(Boolean).join(" ")}
                      </div>
                    )}
                    <div style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-1)" }}>
                      Last known odometer: <strong>{v.current_odometer != null ? Number(v.current_odometer).toLocaleString() : "—"}</strong>
                      {" · "}Lifetime miles: <strong>{v.total_miles != null ? Math.round(Number(v.total_miles)).toLocaleString() : "0"}</strong>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "var(--space-2)", flexShrink: 0 }}>
                    <button className="p7-btn p7-btn-ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => startEdit(v)}>Edit</button>
                    <button className="p7-btn p7-btn-ghost" style={{ fontSize: "var(--text-xs)" }} onClick={() => handleToggleActive(v)}>
                      {v.is_active ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
