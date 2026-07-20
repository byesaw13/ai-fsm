"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { formatCents } from "@/lib/money";
import { requestedDepositCents, type InvoiceDepositType } from "@/lib/invoices/deposit";

interface Props {
  invoiceId: string;
  totalCents: number;
  initialType: InvoiceDepositType;
  initialPercentage: number | null;
  initialFixedCents: number | null;
  /** Standard deposit % from Settings — pre-fills the percentage field. */
  standardPercent: number;
}

export function InvoiceDepositForm({
  invoiceId,
  totalCents,
  initialType,
  initialPercentage,
  initialFixedCents,
  standardPercent,
}: Props) {
  const router = useRouter();
  const { success, error } = useToast();
  const [type, setType] = useState<InvoiceDepositType>(initialType);
  const [percent, setPercent] = useState(
    String(initialPercentage ?? standardPercent),
  );
  const [fixedDollars, setFixedDollars] = useState(
    initialFixedCents != null ? (initialFixedCents / 100).toFixed(2) : "",
  );
  const [saving, setSaving] = useState(false);

  const previewCents = requestedDepositCents(
    {
      depositType: type,
      depositPercentage: parseFloat(percent) || 0,
      depositFixedCents: Math.round((parseFloat(fixedDollars) || 0) * 100),
    },
    totalCents,
  );

  async function save() {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { deposit_type: type };
      if (type === "percentage") payload.deposit_percentage = parseFloat(percent) || 0;
      if (type === "fixed") payload.deposit_fixed_cents = Math.round((parseFloat(fixedDollars) || 0) * 100);

      const res = await fetch(`/api/v1/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error?.message ?? "Could not save deposit");
      }
      success("Deposit updated");
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "Could not save deposit");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
        <label htmlFor="deposit-type" style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Deposit
        </label>
        <select
          id="deposit-type"
          className="p7-input"
          value={type}
          onChange={(e) => setType(e.target.value as InvoiceDepositType)}
          disabled={saving}
          style={{ maxWidth: 160 }}
        >
          <option value="none">None</option>
          <option value="percentage">Percentage</option>
          <option value="fixed">Fixed amount</option>
        </select>

        {type === "percentage" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              className="p7-input"
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              disabled={saving}
              style={{ width: 90 }}
              aria-label="Deposit percentage"
            />
            <span>%</span>
          </span>
        )}

        {type === "fixed" && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span>$</span>
            <input
              className="p7-input"
              type="number"
              min={0}
              step="0.01"
              value={fixedDollars}
              onChange={(e) => setFixedDollars(e.target.value)}
              disabled={saving}
              style={{ width: 110 }}
              aria-label="Fixed deposit amount"
            />
          </span>
        )}

        <button type="button" className="p7-btn p7-btn-secondary p7-btn-sm" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save deposit"}
        </button>
      </div>

      {type !== "none" && (
        <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
          Deposit requested: <strong style={{ color: "var(--fg)" }}>{formatCents(previewCents)}</strong>
          {" "}of {formatCents(totalCents)}. Collect it via the Square deposit link or by recording a payment;
          the remaining balance is due on completion.
        </p>
      )}
    </div>
  );
}
