"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Textarea, Button } from "@/components/ui";

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
        setError(json.error?.message ?? "Failed to save request. Please try again.");
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
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>Request saved!</h2>
            <p style={{ fontSize: 14, color: "var(--fg-secondary)", margin: "0 0 20px" }}>
              {name} is in the system. What do you want to do next?
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Button
                type="button"
                onClick={() => { router.push(`/app/requests/${savedId}`); onClose(); }}
              >
                View request →
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  await fetch(`/api/v1/booking-requests/${savedId}/send-intake`, { method: "POST" });
                  router.push(`/app/requests/${savedId}`);
                  onClose();
                }}
                variant="secondary"
              >
                Send intake form to client
              </Button>
              {savedClientId && (
                <Button
                  type="button"
                  onClick={() => { router.push(`/app/estimates/new?client_id=${savedClientId}`); onClose(); }}
                  variant="secondary"
                >
                  Create estimate now
                </Button>
              )}
              <Button type="button" onClick={onClose} variant="ghost">
                Done — I&apos;ll follow up later
              </Button>
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
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>New Request</h2>
          <button type="button" onClick={onClose} style={closeStyle}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Input
            id="quick-lead-name"
            label="Name *"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Client name"
            required
          />

          <Input
            id="quick-lead-phone"
            label="Phone *"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(603) 555-0100"
            required
          />

          <Input
            id="quick-lead-email"
            label="Email"
            hint="optional — needed to send intake form"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional"
          />

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
                    borderRadius: "var(--radius-md)",
                    border: `1px solid ${source === s ? "var(--accent)" : "var(--border)"}`,
                    background: source === s ? "var(--accent)" : "var(--bg-card)",
                    color: source === s ? "var(--accent-fg)" : "var(--fg)",
                    fontSize: "var(--text-sm)",
                    fontWeight: source === s ? 600 : 400,
                    cursor: "pointer",
                  }}
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            id="quick-lead-desc"
            label="What do they need? (optional)"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description from the call..."
          />

          {error && <p style={{ color: "var(--color-red-600)", fontSize: 13, margin: 0 }}>{error}</p>}

          <Button type="submit" loading={submitting} style={{ marginTop: 4 }}>
            Save Request
          </Button>
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
  background: "var(--bg-overlay)",
  zIndex: "var(--z-overlay, 300)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "60px 16px 16px",
};

const modalStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  width: "100%",
  maxWidth: 420,
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-xl)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  marginBottom: 4,
  color: "var(--fg)",
};

const closeStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  fontSize: 16,
  cursor: "pointer",
  color: "var(--fg-muted)",
  padding: "4px 8px",
};

