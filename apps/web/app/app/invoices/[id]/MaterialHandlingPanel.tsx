"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@ai-fsm/money";
import { materialHandlingCents } from "@/lib/invoices/material-handling";

interface Props {
  invoiceId: string;
  initialEnabled: boolean;
  handlingPct: number;
  materialSubtotalCents: number;
  disabled?: boolean;
}

export function MaterialHandlingPanel({
  invoiceId,
  initialEnabled,
  handlingPct,
  materialSubtotalCents,
  disabled = false,
}: Props) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const rate = handlingPct / 100;
  const handlingCents = enabled ? materialHandlingCents(materialSubtotalCents, rate) : 0;

  async function toggle(next: boolean) {
    setPending(true);
    setError("");
    const prev = enabled;
    setEnabled(next);
    try {
      const res = await fetch(`/api/v1/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply_material_handling: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEnabled(prev);
        setError(json.error?.message ?? "Could not update material handling");
        return;
      }
      router.refresh();
    } catch {
      setEnabled(prev);
      setError("Network error while updating material handling");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="p7-invoice-handling-bar"
      data-testid="invoice-material-handling-panel"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        marginBottom: "var(--space-3)",
        background: "var(--color-slate-50)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--text-sm)",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "var(--space-2)",
          cursor: pending || disabled ? "not-allowed" : "pointer",
          flex: "1 1 220px",
          minWidth: 0,
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => toggle(e.target.checked)}
          disabled={pending || disabled}
          data-testid="invoice-material-handling-checkbox"
          style={{ marginTop: 3, width: 18, height: 18, flexShrink: 0 }}
        />
        <span>
          <strong>Material handling</strong>
          <span style={{ display: "block", color: "var(--fg-muted)", fontSize: "var(--text-xs)", marginTop: 2 }}>
            {handlingPct}% of materials only — billed as a separate line
          </span>
        </span>
      </label>

      <div style={{ textAlign: "right", flex: "0 0 auto", minWidth: 120 }}>
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Materials subtotal</div>
        <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{formatCents(materialSubtotalCents)}</div>
        {enabled && (
          <div
            style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--accent)" }}
            data-testid="invoice-material-handling-preview"
          >
            + {formatCents(handlingCents)} handling
          </div>
        )}
      </div>

      {error && (
        <div style={{ width: "100%", color: "var(--color-danger)", fontSize: "var(--text-xs)" }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}