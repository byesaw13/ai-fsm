"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  estimateId: string;
  clientEmail: string | null;
  sentAt: string | null;
  emailConfigured: boolean;
}

export function SendEstimateButton({ estimateId, clientEmail, sentAt, emailConfigured }: Props) {
  const [pending, setPending] = useState(false);
  const { success, error } = useToast();

  if (!emailConfigured) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        Email not configured on this server.
      </p>
    );
  }

  if (!clientEmail) {
    return (
      <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
        Add an email address to this client to enable sending.
      </p>
    );
  }

  async function handleSend() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/send`, { method: "POST" });
      const json = await res.json() as { sent?: boolean; sentTo?: string; error?: { message?: string } };
      if (res.ok && json.sent) {
        success(`Estimate sent to ${json.sentTo}`);
      } else {
        error(json.error?.message ?? "Failed to send estimate");
      }
    } catch {
      error("Network error — could not send estimate");
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <button
        type="button"
        onClick={handleSend}
        disabled={pending}
        style={{
          display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
          padding: "8px 16px", borderRadius: 6, border: "none", cursor: pending ? "not-allowed" : "pointer",
          background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "var(--text-sm)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? "Sending…" : sentAt ? "Resend to Client" : "Send to Client"}
      </button>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {sentAt
          ? `Last sent ${new Date(sentAt).toLocaleDateString()} — ${clientEmail}. Client can approve/decline via email.`
          : `Will be sent to ${clientEmail} with approve/decline links.`}
      </p>
    </div>
  );
}
