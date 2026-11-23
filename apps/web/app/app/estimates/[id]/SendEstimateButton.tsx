"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

interface Props {
  estimateId: string;
  clientEmail: string | null;
  sentAt: string | null;
  emailConfigured: boolean;
  /** True while the "Before you can send" list has items (TASK-194). */
  blocked?: boolean;
}

export function SendEstimateButton({ estimateId, clientEmail, sentAt, emailConfigured, blocked = false }: Props) {
  const [pending, setPending] = useState<"send" | "mark" | null>(null);
  const [ackNeeded, setAckNeeded] = useState<{ mode: "send" | "mark"; message: string } | null>(null);
  const { success, error } = useToast();
  const router = useRouter();

  const canEmail = emailConfigured && !!clientEmail;

  async function handleAction(mode: "send" | "mark", acknowledgeCostFloor = false) {
    setPending(mode);
    try {
      const res = await fetch(`/api/v1/estimates/${estimateId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(mode === "mark" ? { markOnly: true } : {}),
          ...(acknowledgeCostFloor ? { acknowledgeCostFloor: true } : {}),
        }),
      });
      const json = await res.json() as {
        sent?: boolean;
        sentTo?: string | null;
        emailSkipped?: boolean;
        error?: { code?: string; message?: string };
      };
      if (json.error?.code === "COST_FLOOR_ACK_REQUIRED") {
        setAckNeeded({ mode, message: json.error.message ?? "This price is below your cost floor." });
        return;
      }
      if (json.error?.code === "BASELINE_INCOMPLETE") router.refresh();
      setAckNeeded(null);
      if (res.ok && json.sent) {
        if (json.emailSkipped || mode === "mark" || !json.sentTo) {
          success(sentAt ? "Estimate marked as resent" : "Estimate marked as sent");
        } else {
          success(`Estimate sent to ${json.sentTo}`);
        }
        router.refresh();
      } else {
        error(json.error?.message ?? "Failed to send estimate");
      }
    } catch {
      error("Network error — could not send estimate");
    } finally {
      setPending(null);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {canEmail && (
        <button
          type="button"
          onClick={() => handleAction("send")}
          disabled={!!pending || blocked}
          data-testid="transition-btn-sent"
          style={{
            display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
            padding: "8px 16px", borderRadius: 6, border: "none", cursor: pending ? "not-allowed" : "pointer",
            background: "var(--accent)", color: "#fff", fontWeight: 600, fontSize: "var(--text-sm)",
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending === "send" ? "Sending…" : sentAt ? "Resend to Customer" : "Send to Customer"}
        </button>
      )}

      <button
        type="button"
        onClick={() => handleAction("mark")}
        disabled={!!pending || blocked}
        // Primary action when email is unavailable — e2e + staff offline path
        data-testid={canEmail ? "transition-btn-mark-sent" : "transition-btn-sent"}
        style={{
          display: "inline-flex", alignItems: "center", gap: "var(--space-2)",
          padding: "8px 16px", borderRadius: 6,
          border: canEmail ? "1px solid var(--border)" : "none",
          cursor: pending ? "not-allowed" : "pointer",
          background: canEmail ? "var(--bg-elevated, #fff)" : "var(--accent)",
          color: canEmail ? "var(--fg)" : "#fff",
          fontWeight: 600, fontSize: "var(--text-sm)",
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending === "mark"
          ? "Updating…"
          : sentAt
            ? "Mark as Resent (no email)"
            : "Mark as Sent"}
      </button>

      {ackNeeded && (
        <div data-testid="cost-floor-ack" style={{ border: "1px solid var(--color-danger)", borderRadius: 6, padding: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <p style={{ margin: "0 0 var(--space-2)" }}>{ackNeeded.message}</p>
          <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => handleAction(ackNeeded.mode, true)}
              disabled={!!pending}
              data-testid="cost-floor-ack-send"
              style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--color-danger)", color: "#fff", fontWeight: 600, cursor: "pointer" }}
            >
              I know, send it anyway
            </button>
            <button
              type="button"
              onClick={() => setAckNeeded(null)}
              disabled={!!pending}
              style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "transparent", color: "var(--fg)", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <p style={{ margin: 0, fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
        {blocked ? "Finish the list above to send. " : ""}
        {canEmail
          ? sentAt
            ? `Last sent ${new Date(sentAt).toLocaleDateString()} — ${clientEmail}. Or mark sent without re-emailing.`
            : `Email to ${clientEmail} with approve/decline links, or mark as sent if you delivered it in person / offline.`
          : !clientEmail
            ? "No customer email on file — use Mark as Sent after delivering offline (portal link / PDF / in person)."
            : "Email not configured — Mark as Sent updates status without delivery."}
      </p>
    </div>
  );
}
