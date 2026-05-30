"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuickLeadModalProps {
  onClose: () => void;
}

type ContactSource = "call" | "email" | "text";

const SOURCE_LABELS: Record<ContactSource, string> = {
  call:  "Phone call",
  email: "Email",
  text:  "Text message",
};

export function QuickLeadModal({ onClose }: QuickLeadModalProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState<ContactSource>("call");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [savedClientId, setSavedClientId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Name is required."); return; }
    if (!phone.trim()) { setError("Phone number is required."); return; }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/v1/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          service_description: description.trim() || undefined,
          intake_metadata: { contact_source: source },
        }),
      });

      const json = await res.json() as { id?: string; clientId?: string; error?: { message?: string } };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to save lead. Please try again.");
        return;
      }
      setSavedId(json.id ?? null);
      setSavedClientId(json.clientId ?? null);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Success state
  if (savedId) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
          <div style={{ textAlign: "center", padding: "8px 0 16px" }}>
            <p style={{ fontSize: 32, margin: "0 0 8px" }}>✅</p>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Lead saved!</h2>
            <p style={{ fontSize: 14, color: "#52525b", margin: "0 0 20px" }}>
              {name} is in the system. What do you want to do next?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => { router.push(`/app/booking-requests/${savedId}`); onClose(); }}
                style={primaryBtnStyle}
              >
                View lead →
              </button>
              <button
                type="button"
                onClick={async () => {
                  await fetch(`/api/v1/booking-requests/${savedId}/send-intake`, { method: "POST" });
                  router.push(`/app/booking-requests/${savedId}`);
                  onClose();
                }}
                style={secondaryBtnStyle}
              >
                Send intake form to client
              </button>
              {savedClientId && (
                <button
                  type="button"
                  onClick={() => { router.push(`/app/estimates/new?client_id=${savedClientId}`); onClose(); }}
                  style={secondaryBtnStyle}
                >
                  Create estimate now
                </button>
              )}
              <button type="button" onClick={onClose} style={ghostBtnStyle}>
                Done — I&apos;ll follow up later
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Quick Lead</h2>
          <button type="button" onClick={onClose} style={closeStyle}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              autoFocus
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Client name"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Phone *</label>
            <input
              type="tel"
              style={inputStyle}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(603) 555-0100"
              required
            />
          </div>

          <div>
            <label style={labelStyle}>Email <span style={{ fontWeight: 400, color: "#71717a" }}>(optional — needed to send intake form)</span></label>
            <input
              type="email"
              style={inputStyle}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <label style={labelStyle}>They reached out by</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {(["call", "email", "text"] as ContactSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSource(s)}
                  style={{
                    flex: 1,
                    padding: "8px 4px",
                    borderRadius: 6,
                    border: `1px solid ${source === s ? "#0f172a" : "#e4e4e7"}`,
                    background: source === s ? "#0f172a" : "#fff",
                    color: source === s ? "#fff" : "#18181b",
                    fontSize: 13,
                    fontWeight: source === s ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>What do they need? <span style={{ fontWeight: 400, color: "#71717a" }}>(optional)</span></label>
            <textarea
              style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description from the call..."
            />
          </div>

          {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0 }}>{error}</p>}

          <button type="submit" disabled={submitting} style={{ ...primaryBtnStyle, marginTop: 4 }}>
            {submitting ? "Saving…" : "Save lead"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  zIndex: 1000,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "60px 16px 16px",
};

const modalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 24,
  width: "100%",
  maxWidth: 420,
  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  marginBottom: 4,
  color: "#374151",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 10px",
  borderRadius: 6,
  border: "1px solid #d1d5db",
  fontSize: 14,
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  background: "#0f172a",
  color: "#fff",
  padding: "11px 16px",
  borderRadius: 6,
  border: "none",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  width: "100%",
};

const secondaryBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: "#fff",
  color: "#0f172a",
  border: "1px solid #e4e4e7",
};

const ghostBtnStyle: React.CSSProperties = {
  ...primaryBtnStyle,
  background: "transparent",
  color: "#71717a",
  border: "none",
};

const closeStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 16,
  cursor: "pointer",
  color: "#71717a",
  padding: "4px 8px",
};
