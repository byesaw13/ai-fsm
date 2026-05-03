"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

export interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: "owner" | "admin" | "tech";
  created_at: string;
}

interface Props {
  initialMembers: TeamMember[];
  currentUserId: string;
  currentRole: string;
}

const ROLE_LABELS: Record<string, string> = { owner: "Owner", admin: "Admin", tech: "Technician" };

const EMPTY_FORM = { full_name: "", email: "", phone: "", role: "tech" as const, password: "", password2: "" };

export function TeamPanel({ initialMembers, currentUserId, currentRole }: Props) {
  const { success, error } = useToast();
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<TeamMember>>({});

  const isOwner = currentRole === "owner";

  // --- Add user ---
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.password2) { error("Passwords do not match"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/v1/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: form.full_name, email: form.email, phone: form.phone || undefined, role: form.role, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Failed to add user"); return; }
      setMembers((prev) => [...prev, data.data as TeamMember].sort((a, b) => a.full_name.localeCompare(b.full_name)));
      setForm(EMPTY_FORM);
      setAdding(false);
      success(`${form.full_name} added to the team`);
    } finally {
      setSaving(false);
    }
  }

  // --- Edit user ---
  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/users/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Failed to update user"); return; }
      setMembers((prev) => prev.map((m) => m.id === editId ? { ...m, ...(data.data as TeamMember) } : m));
      setEditId(null);
      success("Team member updated");
    } finally {
      setSaving(false);
    }
  }

  // --- Remove user ---
  async function handleRemove(member: TeamMember) {
    if (!confirm(`Remove ${member.full_name} from the team? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/v1/users/${member.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Failed to remove user"); return; }
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      success(`${member.full_name} removed`);
    } catch {
      error("Failed to remove user");
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {members.map((m) => (
        <div key={m.id} style={{ border: "1px solid var(--color-border, #e4e4e7)", borderRadius: 8, padding: "14px 16px" }}>
          {editId === m.id ? (
            <form onSubmit={handleEdit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Name</label>
                  <input type="text" value={editForm.full_name ?? m.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} required />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Phone</label>
                  <input type="tel" value={editForm.phone ?? m.phone ?? ""} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                {isOwner && (
                  <>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Email</label>
                      <input type="email" value={editForm.email ?? m.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} required />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label>Role</label>
                      <select value={editForm.role ?? m.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as TeamMember["role"] }))}>
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="tech">Technician</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save"}</button>
                <button type="button" className="btn btn-sm" onClick={() => setEditId(null)}>Cancel</button>
              </div>
            </form>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{m.full_name}</div>
                <div style={{ fontSize: 13, color: "var(--color-muted, #71717a)" }}>{m.email}{m.phone ? ` · ${m.phone}` : ""}</div>
              </div>
              <span style={{ fontSize: 12, background: "var(--color-surface-2, #f4f4f5)", padding: "2px 8px", borderRadius: 4 }}>
                {ROLE_LABELS[m.role] ?? m.role}
              </span>
              {(isOwner || currentRole === "admin") && m.id !== currentUserId && (
                <button type="button" className="btn btn-sm" onClick={() => { setEditId(m.id); setEditForm({}); }}>Edit</button>
              )}
              {isOwner && m.id !== currentUserId && (
                <button type="button" className="btn btn-sm btn-danger" onClick={() => handleRemove(m)}>Remove</button>
              )}
            </div>
          )}
        </div>
      ))}

      {adding ? (
        <form onSubmit={handleAdd} style={{ border: "1px dashed var(--color-border, #e4e4e7)", borderRadius: 8, padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>New team member</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Full name</label>
              <input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as typeof form.role }))}>
                {isOwner && <option value="owner">Owner</option>}
                {isOwner && <option value="admin">Admin</option>}
                <option value="tech">Technician</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Password</label>
              <input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Confirm password</label>
              <input type="password" value={form.password2} onChange={(e) => setForm((f) => ({ ...f, password2: e.target.value }))} required minLength={8} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Adding…" : "Add member"}</button>
            <button type="button" className="btn btn-sm" onClick={() => { setAdding(false); setForm(EMPTY_FORM); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-sm" onClick={() => setAdding(true)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
          + Add team member
        </button>
      )}
    </div>
  );
}
