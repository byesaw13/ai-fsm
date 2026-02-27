"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  LinkButton,
  Select,
  SectionHeader,
  Textarea,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Client { id: string; name: string; }
interface Job { id: string; title: string; client_id: string; }
interface Property { id: string; address: string; client_id: string; }

interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
}

interface NewInvoiceFormProps {
  clients: Client[];
  jobs: Job[];
  properties: Property[];
  initialClientId?: string;
  initialJobId?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function lineTotal(row: LineItemRow): number {
  const qty = parseFloat(row.quantity);
  if (isNaN(qty) || qty <= 0) return 0;
  return Math.round(qty * parseCents(row.unit_price));
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewInvoiceForm({
  clients,
  jobs,
  properties,
  initialClientId,
  initialJobId,
}: NewInvoiceFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(
    initialClientId && clients.some((c) => c.id === initialClientId)
      ? initialClientId
      : ""
  );
  const [jobId, setJobId] = useState(
    initialJobId && jobs.some((j) => j.id === initialJobId) ? initialJobId : ""
  );
  const [propertyId, setPropertyId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([{ ...EMPTY_ROW }]);
  const [taxRate, setTaxRate] = useState("0");

  const filteredJobs = useMemo(
    () => (clientId ? jobs.filter((j) => j.client_id === clientId) : jobs),
    [clientId, jobs]
  );
  const filteredProperties = useMemo(
    () => (clientId ? properties.filter((p) => p.client_id === clientId) : []),
    [clientId, properties]
  );

  useEffect(() => {
    if (jobId && !filteredJobs.some((j) => j.id === jobId)) setJobId("");
  }, [filteredJobs, jobId]);

  useEffect(() => {
    if (propertyId && !filteredProperties.some((p) => p.id === propertyId))
      setPropertyId("");
  }, [filteredProperties, propertyId]);

  // Live totals
  const subtotalCents = lineItems.reduce((sum, row) => sum + lineTotal(row), 0);
  const taxRateNum = parseFloat(taxRate) || 0;
  const taxCents = Math.round((subtotalCents * taxRateNum) / 100);
  const totalCents = subtotalCents + taxCents;

  function addLineItem() {
    setLineItems((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function duplicateLineItem(index: number) {
    setLineItems((prev) => {
      const copy = { ...prev[index] };
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next;
    });
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItemRow, value: string) {
    setLineItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Please select a client."); return; }
    if (lineItems.length === 0) { setError("Add at least one line item."); return; }

    setPending(true);
    setError(null);

    try {
      const payload = {
        client_id: clientId,
        job_id: jobId || null,
        property_id: propertyId || null,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        notes: notes.trim() || null,
        tax_rate: taxRateNum,
        line_items: lineItems.map((row, i) => ({
          description: row.description,
          quantity: parseFloat(row.quantity) || 1,
          unit_price_cents: parseCents(row.unit_price),
          sort_order: i,
        })),
      };

      const res = await fetch("/api/v1/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create invoice.");
        setPending(false);
        return;
      }

      const { id } = (await res.json()) as { id: string };
      router.push(`/app/invoices/${id}`);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="new-invoice-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }} data-testid="form-error">{error}</p>
        </Card>
      )}

      {/* Details */}
      <div className="p7-form-grid p7-form-grid-2">
        <Select
          id="client_id"
          label="Client"
          required
          value={clientId}
          onChange={(e) => {
            setClientId(e.target.value);
            setJobId("");
            setPropertyId("");
          }}
          disabled={pending}
          options={clients.map((c) => ({ value: c.id, label: c.name }))}
          placeholder="Select a client"
          hint={clients.length === 0 ? "No clients yet. Create one first." : undefined}
        />

        <Select
          id="job_id"
          label="Job (optional)"
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          disabled={pending || !clientId}
          options={filteredJobs.map((j) => ({ value: j.id, label: j.title }))}
          placeholder="None"
          hint={
            clientId && filteredJobs.length === 0
              ? "No jobs for this client."
              : undefined
          }
        />

        <Select
          id="property_id"
          label="Property (optional)"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          disabled={pending || !clientId}
          options={filteredProperties.map((p) => ({ value: p.id, label: p.address }))}
          placeholder="None"
          hint={
            clientId && filteredProperties.length === 0
              ? "No properties for this client."
              : undefined
          }
        />

        <Input
          id="due_date"
          label="Due Date (optional)"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={pending}
        />

        <Textarea
          id="notes"
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes visible on the invoice"
          rows={3}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
        />
      </div>

      {/* Line Items */}
      <div>
        <SectionHeader
          title="Line Items"
          count={lineItems.length}
          action={
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addLineItem}
              disabled={pending}
              data-testid="add-line-item-btn"
            >
              + Add Item
            </Button>
          }
        />

        {lineItems.length === 0 ? (
          <p style={{ color: "var(--fg-muted)", padding: "var(--space-3) 0" }}>
            No line items. Add at least one.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="line-items-table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit Price ($)</th>
                  <th style={{ width: 100 }}>Total</th>
                  <th style={{ width: 70 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        className="p7-input"
                        type="text"
                        value={row.description}
                        onChange={(e) => updateLineItem(i, "description", e.target.value)}
                        placeholder="Description"
                        required
                        disabled={pending}
                        data-testid={`line-item-desc-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        className="p7-input"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.quantity}
                        onChange={(e) => updateLineItem(i, "quantity", e.target.value)}
                        disabled={pending}
                        data-testid={`line-item-qty-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        className="p7-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={(e) => updateLineItem(i, "unit_price", e.target.value)}
                        disabled={pending}
                        data-testid={`line-item-price-${i}`}
                      />
                    </td>
                    <td
                      style={{
                        color: "var(--fg-muted)",
                        fontSize: "var(--text-sm)",
                        paddingLeft: "var(--space-2)",
                      }}
                    >
                      {formatDollars(lineTotal(row))}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "var(--space-1)" }}>
                        <button
                          type="button"
                          className="p7-btn p7-btn-ghost p7-btn-sm"
                          title="Duplicate row"
                          onClick={() => duplicateLineItem(i)}
                          disabled={pending}
                          data-testid={`duplicate-line-item-${i}`}
                          aria-label={`Duplicate line item ${i + 1}`}
                        >
                          ⧉
                        </button>
                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            className="p7-btn p7-btn-ghost p7-btn-sm"
                            title="Remove row"
                            onClick={() => removeLineItem(i)}
                            disabled={pending}
                            data-testid={`remove-line-item-${i}`}
                            aria-label={`Remove line item ${i + 1}`}
                            style={{ color: "var(--color-danger)" }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totals */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "var(--space-2)",
            marginTop: "var(--space-3)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "auto auto",
              gap: "var(--space-2) var(--space-4)",
              alignItems: "center",
              textAlign: "right",
            }}
          >
            <span style={{ color: "var(--fg-muted)" }}>Subtotal</span>
            <span data-testid="subtotal">{formatDollars(subtotalCents)}</span>

            <label
              htmlFor="tax_rate"
              style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}
            >
              Tax Rate (%)
            </label>
            <input
              id="tax_rate"
              className="p7-input"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(e.target.value)}
              disabled={pending}
              style={{ width: 90, textAlign: "right" }}
              data-testid="tax-rate-input"
            />

            {taxCents > 0 && (
              <>
                <span style={{ color: "var(--fg-muted)" }}>Tax</span>
                <span data-testid="tax-amount">{formatDollars(taxCents)}</span>
              </>
            )}

            <strong>Total</strong>
            <strong data-testid="total">{formatDollars(totalCents)}</strong>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p7-form-actions">
        <LinkButton href="/app/invoices" variant="secondary" tabIndex={-1}>
          Cancel
        </LinkButton>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !clientId}
          loading={pending}
          data-testid="submit-invoice-btn"
        >
          {pending ? "Creating…" : "Create Invoice"}
        </Button>
      </div>
    </form>
  );
}
