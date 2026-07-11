"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  invoiceId: string;
  clientEmail: string | null;
  sentAt: string | null;
  emailConfigured: boolean;
  /** When true, this is a paid-receipt email (PDF-first, no status change). */
  isPaid?: boolean;
}

export function SendInvoiceButton({
  invoiceId,
  clientEmail,
  sentAt,
  emailConfigured,
  isPaid = false,
}: Props) {
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
      const res = await fetch(`/api/v1/invoices/${invoiceId}/send`, { method: "POST" });
      const json = await res.json() as {
        sent?: boolean;
        sentTo?: string;
        isPaid?: boolean;
        error?: { message?: string };
      };
      if (res.ok && json.sent) {
        success(
          json.isPaid || isPaid
            ? `Paid invoice emailed to ${json.sentTo}`
            : `Invoice sent to ${json.sentTo}`,
        );
      } else {
        error(json.error?.message ?? "Failed to send invoice");
      }
    } catch {
      error("Network error — could not send invoice");
    } finally {
      setPending(false);
    }
  }

  const primaryLabel = isPaid
    ? pending
      ? "Sending…"
      : sentAt
        ? "Resend Paid Invoice"
        : "Email Paid Invoice"
    : pending
      ? "Sending…"
      : sentAt
        ? "Resend to Client"
        : "Send to Client";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <button
        type="button"
        onClick={handleSend}
        disabled={pending}
        data-testid={isPaid ? "invoice-email-paid-receipt" : "invoice-send-to-client"}
        style={{
          display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
          padding: "8px 16px", borderRadius: 6, border: "none", cursor: pending ? "not-allowed" : "pointer",
          background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "var(--text-sm)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {primaryLabel}
      </button>
      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {isPaid
          ? `Emails a PDF receipt to ${clientEmail} — no portal login required.`
          : sentAt
            ? `Last sent ${new Date(sentAt).toLocaleDateString()} — ${clientEmail}`
            : `Will be sent to ${clientEmail} with a PDF attached.`}
      </p>
    </div>
  );
}
