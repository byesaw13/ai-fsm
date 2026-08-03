"use client";

import { useState } from "react";
import {
  STANDARD_DEPOSIT_PERCENT,
  STANDARD_DEPOSIT_TERMS,
  STANDARD_ESTIMATE_TERMS,
  STANDARD_INVOICE_TERMS,
} from "@ai-fsm/domain";
import { useToast } from "@/components/ui/Toast";

interface AccountSettings {
  invoice_terms?: string;
  estimate_terms?: string;
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
  // Empty = use domain default at render time; show default as placeholder.
  const [invoiceTerms, setInvoiceTerms] = useState(initialSettings.invoice_terms ?? "");
  const [estimateTerms, setEstimateTerms] = useState(initialSettings.estimate_terms ?? "");
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
            // Persist raw strings so clearing a box reverts to domain defaults
            // (branding falls back when empty/undefined).
            invoice_terms: invoiceTerms,
            estimate_terms: estimateTerms,
            deposit_percent: depositPercent !== "" ? parseFloat(depositPercent) : undefined,
            // Send the raw string (not `|| undefined`): clearing this box must
            // persist "" so the separate Deposits section is suppressed.
            deposit_terms: depositTerms,
            estimate_expiry_days: expiryDays ? parseInt(expiryDays, 10) : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        error(data.error?.message ?? "Save failed");
        return;
      }
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
        <label htmlFor="estimate-terms">Estimate terms</label>
        <textarea
          id="estimate-terms"
          value={estimateTerms}
          onChange={(e) => setEstimateTerms(e.target.value)}
          rows={14}
          maxLength={8000}
          placeholder={STANDARD_ESTIMATE_TERMS}
          data-testid="estimate-terms"
        />
        <small style={{ color: "var(--fg-muted)" }}>
          Shown on estimate PDFs and print. Leave blank to use the built-in default
          (price validity, deposit before schedule, change orders, access, warranty).
          Use <code>{"{deposit_percent}"}</code> where the standard deposit % should appear.
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="invoice-terms">Invoice terms</label>
        <textarea
          id="invoice-terms"
          value={invoiceTerms}
          onChange={(e) => setInvoiceTerms(e.target.value)}
          rows={14}
          maxLength={8000}
          placeholder={STANDARD_INVOICE_TERMS}
          data-testid="invoice-terms"
        />
        <small style={{ color: "var(--fg-muted)" }}>
          Shown on invoice PDFs, print, and the client portal. Leave blank to use the
          built-in default (due upon completion, late fees, payment methods, deposit applied,
          warranty). Use <code>{"{deposit_percent}"}</code> if needed.
        </small>
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
        <label htmlFor="deposit-terms">Deposits section wording</label>
        <textarea
          id="deposit-terms"
          value={depositTerms}
          onChange={(e) => setDepositTerms(e.target.value)}
          rows={3}
          maxLength={2000}
        />
        <small style={{ color: "var(--fg-muted)" }}>
          Separate short “Deposits” block on documents. Use{" "}
          <code>{"{deposit_percent}"}</code> where the percentage should appear. Clear this
          box if the deposit sentence already lives inside Estimate/Invoice terms above.
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
