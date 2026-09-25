"use client";

import { useState } from "react";
import { PRICE_BOOK_CATEGORY_LABELS } from "@ai-fsm/domain";

const OTHER = "__other__";
const field = { width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 15, boxSizing: "border-box" as const };
const label = { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", margin: "12px 0 4px" };

/** Portal "Request service" (TASK-161): pre-filled with who they are. */
export function RequestServiceForm({
  clientToken,
  properties,
}: {
  clientToken: string;
  properties: { id: string; address: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? OTHER);
  const [address, setAddress] = useState("");
  const [category, setCategory] = useState("general_repairs");
  const [description, setDescription] = useState("");
  const [access, setAccess] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch(`/api/portal/${clientToken}/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(propertyId === OTHER ? { address } : { property_id: propertyId }),
        service_category: category,
        service_description: description,
        ...(access ? { access_notes: access } : {}),
      }),
    }).catch(() => null);
    if (res?.ok) {
      setState("sent");
    } else {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "Something went wrong. Please try again or text us.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 10, padding: 16, marginBottom: 24, color: "#065f46" }}>
        <strong>Request sent.</strong> We&apos;ll be in touch within one business day.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ width: "100%", background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 10, padding: "13px 16px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginBottom: 24 }}
      >
        Request service
      </button>
    );
  }

  return (
    <form onSubmit={submit} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16, marginBottom: 24 }}>
      <div style={{ fontWeight: 700, fontSize: 16 }}>Request service</div>

      <label style={label} htmlFor="rq-address">Where?</label>
      <select id="rq-address" value={propertyId} onChange={(e) => setPropertyId(e.target.value)} style={field}>
        {properties.map((p) => (
          <option key={p.id} value={p.id}>{p.address}</option>
        ))}
        <option value={OTHER}>A different address…</option>
      </select>
      {propertyId === OTHER && (
        <input aria-label="Address" required minLength={3} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, town" style={{ ...field, marginTop: 6 }} />
      )}

      <label style={label} htmlFor="rq-category">What kind of work?</label>
      <select id="rq-category" value={category} onChange={(e) => setCategory(e.target.value)} style={field}>
        {Object.entries(PRICE_BOOK_CATEGORY_LABELS).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>

      <label style={label} htmlFor="rq-desc">What needs doing?</label>
      <textarea id="rq-desc" required minLength={10} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Two closet doors are off their track and the hall needs touch-up paint." style={field} />

      <label style={label} htmlFor="rq-access">Access notes (optional)</label>
      <input id="rq-access" value={access} onChange={(e) => setAccess(e.target.value)} placeholder="Gate code, lockbox, pets…" style={field} />

      {error && <div role="alert" style={{ color: "#991b1b", fontSize: 14, marginTop: 10 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="submit" disabled={state === "sending"} style={{ flex: 1, background: "#1d4ed8", color: "#fff", border: "none", borderRadius: 8, padding: "11px 14px", fontSize: 15, fontWeight: 700, cursor: "pointer", opacity: state === "sending" ? 0.6 : 1 }}>
          {state === "sending" ? "Sending…" : "Send request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 8, padding: "11px 14px", fontSize: 15, cursor: "pointer" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}
