"use client";

import { useState, type CSSProperties, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Textarea } from "@/components/ui";

type Props = {
  clientId: string;
  clientName: string;
  phone: string;
  /** Optional job to attach the message to */
  defaultJobId?: string | null;
};

export function SendSmsButton({ clientId, clientName, phone, defaultJobId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = message.trim();
    if (!text) {
      setError("Message is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/clients/${clientId}/sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          job_id: defaultJobId || undefined,
        }),
      });
      const json = (await res.json()) as {
        data?: { message_id?: string };
        error?: { message?: string; code?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to send SMS.");
        return;
      }
      setSent(true);
      setMessage("");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="p7-btn p7-btn-secondary p7-btn-sm"
        onClick={() => {
          setOpen(true);
          setSent(false);
          setError(null);
        }}
        data-testid="send-sms-open"
      >
        Text (app)
      </button>
    );
  }

  return (
    <div style={overlayStyle} onClick={() => !submitting && setOpen(false)}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()} data-testid="send-sms-modal">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Send SMS</h2>
            <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--fg-muted)" }}>
              To {clientName} · {phone}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            style={closeBtnStyle}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {sent ? (
          <div style={{ textAlign: "center", padding: "20px 0 8px" }}>
            <p style={{ fontSize: 28, margin: "0 0 8px" }}>✓</p>
            <p style={{ fontWeight: 600, margin: "0 0 4px" }}>Message sent</p>
            <p style={{ fontSize: 13, color: "var(--fg-muted)", margin: "0 0 16px" }}>
              Logged on the client record. If the phone gateway also fires sms:sent, it will
              dedupe by message id.
            </p>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSend} style={{ marginTop: 16, display: "grid", gap: 12 }}>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type your message…"
              rows={5}
              maxLength={1600}
              data-testid="send-sms-message"
              required
            />
            <div style={{ fontSize: 12, color: "var(--fg-muted)", textAlign: "right" }}>
              {message.length}/1600
            </div>
            {error ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--color-error, #b91c1c)" }} data-testid="send-sms-error">
                {error}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !message.trim()} data-testid="send-sms-submit">
                {submitting ? "Sending…" : "Send SMS"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 16,
};

const modalStyle: CSSProperties = {
  background: "var(--bg-card, #fff)",
  borderRadius: 12,
  padding: 20,
  width: "100%",
  maxWidth: 440,
  boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
  border: "1px solid var(--border, #e5e7eb)",
};

const closeBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  fontSize: 24,
  lineHeight: 1,
  cursor: "pointer",
  color: "var(--fg-muted)",
  padding: 0,
};
