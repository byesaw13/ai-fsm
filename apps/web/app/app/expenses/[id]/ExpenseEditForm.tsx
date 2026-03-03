"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Input, Select, Textarea, Button } from "@/components/ui";
import type { ExpenseCategory } from "@ai-fsm/domain";
import { parseDollarsToCents, formatCentsToDollars } from "@/lib/expenses/math";

interface Expense {
  id: string;
  vendor_name: string;
  category: ExpenseCategory;
  amount_cents: number;
  expense_date: string; // YYYY-MM-DD
  job_id: string | null;
  client_id: string | null;
  notes: string | null;
}

interface Props {
  expense: Expense;
  jobs: { id: string; title: string }[];
  clients: { id: string; name: string }[];
  categories: { value: string; label: string }[];
}

export function ExpenseEditForm({ expense, jobs, clients, categories }: Props) {
  const router = useRouter();

  const initialAmount = (expense.amount_cents / 100).toFixed(2);

  const [vendorName, setVendorName] = useState(expense.vendor_name);
  const [category, setCategory] = useState<string>(expense.category);
  const [amountStr, setAmountStr] = useState(initialAmount);
  const [expenseDate, setExpenseDate] = useState(expense.expense_date);
  const [jobId, setJobId] = useState(expense.job_id ?? "");
  const [clientId, setClientId] = useState(expense.client_id ?? "");
  const [notes, setNotes] = useState(expense.notes ?? "");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
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
    setSuccess(false);

    const amount_cents = parseDollarsToCents(amountStr);

    try {
      const res = await fetch(`/api/v1/expenses/${expense.id}`, {
        method: "PATCH",
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

      const data = (await res.json()) as { updated?: boolean; error?: { message?: string } };

      if (!res.ok) {
        setError(data?.error?.message ?? "Failed to update expense.");
        setPending(false);
        return;
      }

      setSuccess(true);
      setPending(false);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack">
      {error && (
        <div className="p7-card-danger" role="alert" style={{ fontSize: "var(--text-sm)" }}>
          {error}
        </div>
      )}
      {success && (
        <div
          className="p7-card"
          role="status"
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-green-700)",
            border: "1px solid var(--color-green-200)",
          }}
        >
          Expense updated.
        </div>
      )}

      <Input
        id="edit_vendor_name"
        label="Vendor / Payee"
        value={vendorName}
        onChange={(e) => setVendorName(e.target.value)}
        required
        disabled={pending}
        error={fieldErrors.vendor_name}
      />

      <Select
        id="edit_category"
        label="Category"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        options={categories}
        required
        disabled={pending}
        error={fieldErrors.category}
      />

      <Input
        id="edit_amount"
        label="Amount ($)"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        value={amountStr}
        onChange={(e) => setAmountStr(e.target.value)}
        required
        disabled={pending}
        error={fieldErrors.amount}
        hint={`Current: ${formatCentsToDollars(expense.amount_cents)}`}
      />

      <Input
        id="edit_expense_date"
        label="Date"
        type="date"
        value={expenseDate}
        onChange={(e) => setExpenseDate(e.target.value)}
        required
        disabled={pending}
        error={fieldErrors.expense_date}
      />

      {jobs.length > 0 && (
        <Select
          id="edit_job_id"
          label="Link to Job"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          options={[
            { value: "", label: "No job" },
            ...jobs.map((j) => ({ value: j.id, label: j.title })),
          ]}
          disabled={pending}
        />
      )}

      {clients.length > 0 && (
        <Select
          id="edit_client_id"
          label="Link to Client"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          options={[
            { value: "", label: "No client" },
            ...clients.map((c) => ({ value: c.id, label: c.name })),
          ]}
          disabled={pending}
        />
      )}

      <Textarea
        id="edit_notes"
        label="Notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        disabled={pending}
        rows={3}
      />

      <div className="p7-form-actions">
        <Button type="submit" variant="primary" loading={pending} disabled={pending} size="sm">
          Save Changes
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => router.push("/app/expenses" as Route)}
        >
          Back to List
        </Button>
      </div>
    </form>
  );
}
