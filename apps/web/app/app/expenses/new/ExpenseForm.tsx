"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Input, Select, Textarea, Button } from "@/components/ui";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "@ai-fsm/domain";
import { parseDollarsToCents } from "@/lib/expenses/math";
import { currentMonthKey } from "@/lib/expenses/ui";

interface Props {
  jobs: { id: string; title: string }[];
  clients: { id: string; name: string }[];
  defaultJobId?: string;
  defaultClientId?: string;
  mode?: "standard" | "run";
}

type OpenSessionResponse = { data: { id: string } | null };

export function ExpenseForm({ jobs, clients, defaultJobId, defaultClientId, mode = "standard" }: Props) {
  const router = useRouter();
  const isMaterialRun = mode === "run";

  const todayLocal = new Date();
  const defaultDate = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;

  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState(isMaterialRun ? "materials" : "");
  const [amountStr, setAmountStr] = useState("");
  const [expenseDate, setExpenseDate] = useState(defaultDate);
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Receipt scanning
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [selectedReceiptFile, setSelectedReceiptFile] = useState<File | null>(null);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  // Activity ledger: a material run's time spans from opening this form to
  // saving the expense — logged as a completed segment on save (run mode).
  const formOpenedAtRef = useRef<string>(new Date().toISOString());

  async function handleScanReceipt(file: File) {
    setSelectedReceiptFile(file);
    setScanning(true);
    setScanError(null);
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const res = await fetch("/api/v1/expenses/scan-receipt", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setScanError(data.error?.message ?? "Scan failed — enter the receipt details manually. The photo will still be saved.");
        return;
      }
      const { vendor_name, amount_cents, expense_date, category: cat, notes: n } = data.data;
      if (vendor_name) setVendorName(vendor_name);
      if (amount_cents) setAmountStr((amount_cents / 100).toFixed(2));
      if (expense_date) setExpenseDate(expense_date);
      if (cat && !isMaterialRun) setCategory(cat);
      if (n) setNotes(n);
    } catch {
      setScanError("Network error — enter the receipt details manually. The photo will still be saved.");
    } finally {
      setScanning(false);
      if (receiptInputRef.current) receiptInputRef.current.value = "";
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!vendorName.trim()) errs.vendor_name = "Vendor name is required.";
    if (!category) errs.category = "Category is required.";
    if (!amountStr.trim() || isNaN(parseFloat(amountStr)) || parseFloat(amountStr) <= 0) {
      errs.amount = "Enter a valid amount greater than $0.";
    }
    if (!expenseDate) errs.expense_date = "Date is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setPending(true);
    setError(null);

    const amount_cents = parseDollarsToCents(amountStr);

    try {
      const res = await fetch("/api/v1/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendor_name: vendorName.trim(),
          category,
          amount_cents,
          expense_date: expenseDate,
          job_id: jobId || null,
          client_id: clientId || null,
          notes: notes.trim() || null,
        }),
      });

      const data = (await res.json()) as { id?: string; error?: { message?: string } };

      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to create expense.");
        setPending(false);
        return;
      }

      const expenseId = data.id;
      if (expenseId && selectedReceiptFile) {
        const upload = new FormData();
        upload.append("file", selectedReceiptFile);
        const receiptRes = await fetch(`/api/v1/expenses/${expenseId}/receipt`, {
          method: "POST",
          body: upload,
        });
        if (!receiptRes.ok) {
          setError("Expense saved, but the receipt photo could not be uploaded. Open the expense and try again.");
          setPending(false);
          return;
        }
      }

      if (isMaterialRun) {
        // Hard trigger: log the run as a completed time segment (form open → now).
        if (expenseId) {
          const startedAt = formOpenedAtRef.current;
          const endedAt = new Date().toISOString();
          if (new Date(endedAt) > new Date(startedAt)) {
            await fetch("/api/v1/activities/log", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                activity_type: "material_run",
                started_at: startedAt,
                ended_at: endedAt,
                entity_type: "expense",
                entity_id: expenseId,
                source: "auto_material_run",
                note: vendorName.trim() || null,
              }),
            }).catch(() => null);
          }
        }

        const openRes = await fetch("/api/v1/sessions/open");
        const openJson = (await openRes.json().catch(() => ({ data: null }))) as OpenSessionResponse;
        if (openRes.ok && openJson.data?.id) {
          await fetch(`/api/v1/sessions/${openJson.data.id}/activities`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              entity_type: "supplier_run",
              entity_id: null,
              label: vendorName.trim() || "Material Run",
            }),
          }).catch(() => null);
        }
        router.push("/app" as Route);
        router.refresh();
        return;
      }

      router.push(`/app/expenses/${expenseId}` as Route);
    } catch {
      setError("Network error — please try again.");
      setPending(false);
    }
  }

  const currentMonth = currentMonthKey();

  const categoryOptions = EXPENSE_CATEGORIES.map((c) => ({
    value: c,
    label: EXPENSE_CATEGORY_LABELS[c],
  }));
  const jobOptions = [
    { value: "", label: isMaterialRun ? "No job — general stock" : "No job" },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ];
  const clientOptions = [
    { value: "", label: "No client" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" style={{ maxWidth: "560px" }}>
      {/* Receipt scan */}
      <div
        style={{
          padding: "var(--space-4)",
          background: "var(--bg-subtle, #f8f8f9)",
          borderRadius: "var(--radius-md)",
          border: "1px dashed var(--border)",
        }}
      >
        <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
          {isMaterialRun ? "Material Run Receipt" : "Scan a Receipt"}
        </p>
        <p style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
          Take a photo or upload a receipt image to auto-fill the form below. The photo is saved after the expense is created.
        </p>
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleScanReceipt(file);
          }}
        />
        <button
          type="button"
          className="p7-btn p7-btn-secondary p7-btn-sm"
          onClick={() => receiptInputRef.current?.click()}
          disabled={scanning || pending}
          data-testid="scan-receipt-btn"
        >
          {scanning ? "Scanning…" : "Choose Photo"}
        </button>
        {scanError && (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--color-error, red)" }} role="alert">
            {scanError}
          </p>
        )}
        {selectedReceiptFile && (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Photo ready: {selectedReceiptFile.name}
          </p>
        )}
        {scanning && (
          <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
            Reading receipt with AI…
          </p>
        )}
      </div>

      {error && (
        <div className="p7-card-danger" role="alert">
          {error}
        </div>
      )}

      <Input
        id="vendor_name"
        label="Vendor / Payee"
        value={vendorName}
        onChange={(e) => setVendorName(e.target.value)}
        placeholder="e.g. Home Depot, Shell Gas"
        required
        disabled={pending}
        error={fieldErrors.vendor_name}
      />

      <div className="p7-form-grid-2">
        <Select
          id="category"
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={categoryOptions}
          placeholder="Select category…"
          required
          disabled={pending}
          error={fieldErrors.category}
        />

        <Input
          id="amount"
          label="Amount ($)"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          placeholder="0.00"
          required
          disabled={pending}
          error={fieldErrors.amount}
        />
      </div>

      <Input
        id="expense_date"
        label="Date"
        type="date"
        value={expenseDate}
        onChange={(e) => setExpenseDate(e.target.value)}
        required
        disabled={pending}
        error={fieldErrors.expense_date}
        hint={`Expenses outside ${currentMonth} will not appear in this month's summary.`}
      />

      {(jobs.length > 0 || isMaterialRun) && (
        <Select
          id="job_id"
          label={isMaterialRun ? "Job" : "Link to Job (optional)"}
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={jobOptions}
          disabled={pending}
        />
      )}

      {clients.length > 0 && (
        <Select
          id="client_id"
          label="Link to Client (optional)"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          options={clientOptions}
          disabled={pending}
        />
      )}

      <Textarea
        id="notes"
        label="Notes (optional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Receipt details, purpose, etc."
        disabled={pending}
        rows={3}
      />

      <div className="p7-form-actions">
        <Button type="submit" variant="primary" loading={pending} disabled={pending}>
          {isMaterialRun ? "Save Material Run" : "Save Expense"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push((isMaterialRun ? "/app" : "/app/expenses") as Route)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
