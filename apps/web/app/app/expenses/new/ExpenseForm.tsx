"use client";

import { useState } from "react";
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
}

export function ExpenseForm({ jobs, clients, defaultJobId, defaultClientId }: Props) {
  const router = useRouter();

  const todayLocal = new Date();
  const defaultDate = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, "0")}-${String(todayLocal.getDate()).padStart(2, "0")}`;

  const [vendorName, setVendorName] = useState("");
  const [category, setCategory] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [expenseDate, setExpenseDate] = useState(defaultDate);
  const [jobId, setJobId] = useState(defaultJobId ?? "");
  const [clientId, setClientId] = useState(defaultClientId ?? "");
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

      router.push(`/app/expenses/${data.id}` as Route);
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
    { value: "", label: "No job" },
    ...jobs.map((j) => ({ value: j.id, label: j.title })),
  ];
  const clientOptions = [
    { value: "", label: "No client" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" style={{ maxWidth: "560px" }}>
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

      {jobs.length > 0 && (
        <Select
          id="job_id"
          label="Link to Job (optional)"
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
          Save Expense
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => router.push("/app/expenses" as Route)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
