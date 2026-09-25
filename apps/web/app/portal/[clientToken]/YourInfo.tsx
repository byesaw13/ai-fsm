"use client";

import { useState } from "react";
import { BUSINESS_PHONE_DISPLAY } from "@/lib/sms/consent";
import { formatPhoneDisplay } from "@/lib/phone";

const CONTACT_LABEL: Record<string, string> = { sms: "Text", email: "Email", phone: "Phone call" };
const field = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15, boxSizing: "border-box" as const };
const row = { display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: "1px solid #f3f4f6", fontSize: 14 };

/** Portal "Your info" (TASK-161). Name/address changes go through the office. */
export function YourInfo({
  clientToken,
  name,
  phone,
  email,
  preferredContact,
  readOnly,
}: {
  clientToken: string;
  name: string;
  phone: string | null;
  email: string | null;
  preferredContact: string | null;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ phone: formatPhoneDisplay(phone), email: email ?? "", preferred_contact: preferredContact ?? "email" });
  const [saved, setSaved] = useState({ phone, preferredContact });
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body: Record<string, string> = { preferred_contact: draft.preferred_contact };
    if (draft.phone.trim() && draft.phone.trim() !== formatPhoneDisplay(phone)) body.phone = draft.phone.trim();
    if (draft.email.trim() && draft.email.trim().toLowerCase() !== (email ?? "").toLowerCase()) body.email = draft.email.trim();
    const res = await fetch(`/api/portal/${clientToken}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    const json = await res?.json().catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      setError(json?.error ?? "Could not save. Please try again.");
      return;
    }
    setSaved({ phone: body.phone ?? saved.phone, preferredContact: draft.preferred_contact });
    setNote(json?.emailPending ? `Check ${body.email} for a link to confirm your new email.` : "Saved.");
    setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={save} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16 }}>
        <label htmlFor="yi-phone" style={{ fontSize: 13, fontWeight: 600 }}>Mobile phone</label>
        <input id="yi-phone" type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} style={{ ...field, margin: "4px 0 12px" }} />
        <label htmlFor="yi-email" style={{ fontSize: 13, fontWeight: 600 }}>Email</label>
        <input id="yi-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} style={{ ...field, margin: "4px 0 4px" }} />
        <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>A new email takes effect after you click the link we send to it.</div>
        <label htmlFor="yi-pref" style={{ fontSize: 13, fontWeight: 600 }}>Best way to reach you</label>
        <select id="yi-pref" value={draft.preferred_contact} onChange={(e) => setDraft({ ...draft, preferred_contact: e.target.value })} style={{ ...field, margin: "4px 0 12px" }}>
          {Object.entries(CONTACT_LABEL).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        {error && <div role="alert" style={{ color: "#991b1b", fontSize: 14, marginBottom: 10 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" disabled={saving} style={{ flex: 1, background: "#111", color: "#fff", border: "none", borderRadius: 8, padding: "10px 14px", fontWeight: 700, cursor: "pointer" }}>{saving ? "Saving…" : "Save"}</button>
          <button type="button" onClick={() => setEditing(false)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "10px 14px", cursor: "pointer" }}>Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 16px 12px" }}>
      <div style={row}><span style={{ color: "#6b7280" }}>Name</span><span>{name}</span></div>
      <div style={row}><span style={{ color: "#6b7280" }}>Phone</span><span>{formatPhoneDisplay(saved.phone) || "—"}</span></div>
      <div style={row}><span style={{ color: "#6b7280" }}>Email</span><span>{email ?? "—"}</span></div>
      <div style={{ ...row, borderBottom: "none" }}><span style={{ color: "#6b7280" }}>Best way to reach you</span><span>{CONTACT_LABEL[saved.preferredContact ?? ""] ?? "—"}</span></div>
      {note && <div style={{ fontSize: 13, color: "#065f46", marginBottom: 8 }}>{note}</div>}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#6b7280" }}>Need to change your name or address? Call or text {BUSINESS_PHONE_DISPLAY}.</span>
        {!readOnly && (
          <button type="button" onClick={() => setEditing(true)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>
            Edit
          </button>
        )}
      </div>
    </div>
  );
}
