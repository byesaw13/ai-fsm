"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  invoiceId: string;
  hasDeposit: boolean;
  remainingCents: number;
  existingLinkUrl: string | null;
}

export function SquareLinkActions({
  invoiceId,
  hasDeposit,
  remainingCents,
  existingLinkUrl,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<"deposit" | "balance" | "custom">(
    hasDeposit ? "deposit" : "balance"
  );
  const [customAmount, setCustomAmount] = useState("");
  const [linkUrl, setLinkUrl] = useState<string | null>(existingLinkUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError("");
    try {
      const payload: { kind: string; amount_cents?: number } = { kind };
      if (kind === "custom") {
        const cents = Math.round(parseFloat(customAmount) * 100);
        if (isNaN(cents) || cents <= 0) {
          setError("Enter a valid custom amount");
          setLoading(false);
          return;
        }
        payload.amount_cents = cents;
      }
      const res = await fetch(`/api/v1/invoices/${invoiceId}/square-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error?.message ?? "Failed to create payment link");
        return;
      }
      setLinkUrl(data.data?.url ?? null);
      router.refresh();
    } catch {
      setError("Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!linkUrl) return;
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link");
    }
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}
      data-testid="square-link-actions"
    >
      {error && (
        <p className="error-inline" data-testid="square-link-error">
          {error}
        </p>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <select
          value={kind}
          onChange={(e) =>
            setKind(e.target.value as "deposit" | "balance" | "custom")
          }
          aria-label="Payment link amount"
        >
          {hasDeposit && <option value="deposit">Deposit</option>}
          <option value="balance">Remaining balance</option>
          <option value="custom">Custom amount</option>
        </select>
        {kind === "custom" && (
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={(remainingCents / 100).toFixed(2)}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="Amount ($)"
            style={{ maxWidth: 120 }}
            aria-label="Custom amount"
          />
        )}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleCreate}
          disabled={loading}
          data-testid="create-square-link"
        >
          {loading ? "Creating…" : "Create Square Link"}
        </button>
      </div>

      {linkUrl && (
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center", flexWrap: "wrap" }}>
          <a
            href={linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: "var(--text-sm)", color: "var(--accent)", wordBreak: "break-all" }}
          >
            {linkUrl}
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleCopy}
            data-testid="copy-square-link"
          >
            {copied ? "Copied!" : "Copy Payment Link"}
          </button>
        </div>
      )}
    </div>
  );
}
