"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  clientEmail: string | null;
  portalUrl: string;
  pdfUrl: string;
  status: string;
  emailConfigured: boolean;
  canSend: boolean;
  /** When true (Complete & Invoice handoff), show on all viewports and scroll into view. */
  deliverFocus?: boolean;
}

/**
 * Deliver actions for the owner: email when configured; always share/copy portal link.
 * Sticky on mobile; when deliverFocus, also pinned at the top of the invoice after complete.
 */
export function InvoiceMobileDeliverBar({
  invoiceId,
  invoiceNumber,
  clientEmail,
  portalUrl,
  pdfUrl,
  status,
  emailConfigured,
  canSend,
  deliverFocus = false,
}: Props) {
  const [pending, setPending] = useState(false);
  const { success, error } = useToast();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!deliverFocus) return;
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [deliverFocus]);

  const isDraft = status === "draft";
  const isUnpaid = ["sent", "partial", "overdue"].includes(status);
  const showSend = canSend && emailConfigured && clientEmail && (isDraft || isUnpaid);

  async function handleSend() {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}/send`, { method: "POST" });
      const json = (await res.json()) as {
        sent?: boolean;
        sentTo?: string;
        error?: { message?: string };
      };
      if (res.ok && json.sent) {
        success(`Invoice sent to ${json.sentTo}`);
      } else {
        error(json.error?.message ?? "Failed to send invoice");
      }
    } catch {
      error("Network error — could not send invoice");
    } finally {
      setPending(false);
    }
  }

  async function handleShare() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: invoiceNumber,
          text: `Invoice ${invoiceNumber}`,
          url: portalUrl,
        });
        return;
      }
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(portalUrl);
        success("Client link copied");
        return;
      }
      error("Sharing not available on this device");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      error("Could not share link");
    }
  }

  return (
    <div
      ref={rootRef}
      id="invoice-deliver"
      className={
        deliverFocus
          ? "p7-sticky-primary p7-invoice-mobile-deliver p7-invoice-deliver-focus"
          : "p7-sticky-primary p7-only-mobile p7-invoice-mobile-deliver"
      }
      data-testid="invoice-mobile-deliver-bar"
      data-deliver-focus={deliverFocus ? "1" : "0"}
    >
      {deliverFocus && (
        <p
          style={{
            flex: "1 1 100%",
            margin: "0 0 var(--space-1)",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            color: "var(--fg)",
          }}
        >
          Review the numbers, then deliver to the client
        </p>
      )}
      {showSend && (
        <button
          type="button"
          onClick={handleSend}
          disabled={pending}
          data-testid="invoice-mobile-send"
          className="p7-btn p7-btn-primary"
          style={{
            flex: "1 1 140px",
            minHeight: 48,
            opacity: pending ? 0.7 : 1,
          }}
        >
          {pending ? "Sending…" : isDraft ? "Send invoice" : "Resend invoice"}
        </button>
      )}
      <button
        type="button"
        onClick={handleShare}
        data-testid="invoice-mobile-share"
        className="p7-btn p7-btn-secondary"
        style={{ flex: "1 1 120px", minHeight: 48 }}
      >
        Share link
      </button>
      <a
        href={pdfUrl}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="invoice-mobile-pdf"
        className="p7-btn p7-btn-secondary"
        style={{
          flex: "0 0 auto",
          minHeight: 48,
          display: "inline-flex",
          alignItems: "center",
          textDecoration: "none",
        }}
      >
        PDF
      </a>
    </div>
  );
}
