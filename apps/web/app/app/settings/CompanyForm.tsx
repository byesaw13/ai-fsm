"use client";

import { useState } from "react";
import { STANDARD_DEPOSIT_PERCENT, STANDARD_DEPOSIT_TERMS } from "@ai-fsm/domain";
import { useToast } from "@/components/ui/Toast";

interface AccountSettings {
  invoice_terms?: string;
  deposit_percent?: number;
  deposit_terms?: string;
  estimate_expiry_days?: number;
}

interface Props {
  accountId: string;
  initialName: string;
  initialSettings: AccountSettings;
}

export function CompanyForm({ initialName, initialSettings }: Props) {
  const { success, error } = useToast();
  const [name, setName] = useState(initialName);
  const [invoiceTerms, setInvoiceTerms] = useState(initialSettings.invoice_terms ?? "");
  const [depositPercent, setDepositPercent] = useState(
    String(initialSettings.deposit_percent ?? STANDARD_DEPOSIT_PERCENT),
  );
  const [depositTerms, setDepositTerms] = useState(
    initialSettings.deposit_terms ?? STANDARD_DEPOSIT_TERMS,
  );
  const [expiryDays, setExpiryDays] = useState(String(initialSettings.estimate_expiry_days ?? 30));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/v1/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          settings: {
            invoice_terms: invoiceTerms || undefined,
            deposit_percent: depositPercent !== "" ? parseFloat(depositPercent) : undefined,
            deposit_terms: depositTerms || undefined,
            estimate_expiry_days: expiryDays ? parseInt(expiryDays, 10) : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { error(data.error?.message ?? "Save failed"); return; }
      success("Company settings saved");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="form-group">
        <label htmlFor="company-name">Business name</label>
        <input
          id="company-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={255}
        />
      </div>
      <div className="form-group">
        <label htmlFor="invoice-terms">Invoice payment terms</label>
        <textarea
          id="invoice-terms"
          value={invoiceTerms}
          onChange={(e) => setInvoiceTerms(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="e.g. Payment due within 30 days of invoice date."
        />
      </div>
      <div className="form-group">
        <label htmlFor="deposit-percent">Standard deposit (%)</label>
        <input
          id="deposit-percent"
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={depositPercent}
          onChange={(e) => setDepositPercent(e.target.value)}
          style={{ maxWidth: 120 }}
        />
        <small style={{ color: "var(--fg-muted)" }}>
          The standard for all deposits — shown on documents and used as the default for new estimates.
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="deposit-terms">Deposits wording</label>
        <textarea
          id="deposit-terms"
          value={depositTerms}
          onChange={(e) => setDepositTerms(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <small style={{ color: "var(--fg-muted)" }}>
          Use <code>{"{deposit_percent}"}</code> where the percentage should appear.
        </small>
      </div>
      <div className="form-group">
        <label htmlFor="expiry-days">Default estimate expiry (days)</label>
        <input
          id="expiry-days"
          type="number"
          min={1}
          max={365}
          value={expiryDays}
          onChange={(e) => setExpiryDays(e.target.value)}
          style={{ maxWidth: 120 }}
        />
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Save company settings"}
        </button>
      </div>
    </form>
  );
}
