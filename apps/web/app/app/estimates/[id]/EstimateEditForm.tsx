"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Input,
  Select,
  SectionHeader,
  Textarea,
  useToast,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientOption { id: string; name: string; }
interface JobOption { id: string; title: string; client_id: string; }
interface PropertyOption { id: string; address: string; client_id: string; }

interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
}

interface InitialLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order: number;
}

interface EstimateEditFormProps {
  estimateId: string;
  initialClientId: string;
  initialJobId: string | null;
  initialPropertyId: string | null;
  initialNotes: string | null;
  initialExpiresAt: string | null;
  initialSubtotalCents: number;
  initialTaxCents: number;
  initialLineItems: InitialLineItem[];
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

function centsToDisplayDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isoToDateString(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EstimateEditForm({
  estimateId,
  initialClientId,
  initialJobId,
  initialPropertyId,
  initialNotes,
  initialExpiresAt,
  initialSubtotalCents,
  initialTaxCents,
  initialLineItems,
}: EstimateEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Detect initial mode: flat rate = no line items but subtotal > 0
  const isFlatRateInitially = initialLineItems.length === 0 && initialSubtotalCents > 0;
  const [mode, setMode] = useState<"itemized" | "flat_rate">(
    isFlatRateInitially ? "flat_rate" : "itemized"
  );
  const [flatRate, setFlatRate] = useState(
    isFlatRateInitially ? centsToDisplayDollars(initialSubtotalCents) : "0.00"
  );

  const [clientId, setClientId] = useState(initialClientId);
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [propertyId, setPropertyId] = useState(initialPropertyId ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [expiresAt, setExpiresAt] = useState(isoToDateString(initialExpiresAt));
  const [lineItems, setLineItems] = useState<LineItemRow[]>(
    initialLineItems.length > 0
      ? initialLineItems.map((item) => ({
          description: item.description,
          quantity: String(item.quantity),
          unit_price: centsToDisplayDollars(item.unit_price_cents),
        }))
      : [{ ...EMPTY_ROW }]
  );

  // Derive initial tax rate from stored tax/subtotal
  const derivedTaxRate =
    initialSubtotalCents > 0
      ? ((initialTaxCents / initialSubtotalCents) * 100).toFixed(2)
      : "0";
  const [taxRate, setTaxRate] = useState(derivedTaxRate);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/v1/clients?limit=200").then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/jobs?limit=200").then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/properties?limit=200").then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([clientsData, jobsData, propertiesData]) => {
      if (!cancelled) {
        setClients(clientsData.data ?? []);
        setJobs(jobsData.data ?? []);
        setProperties(propertiesData.data ?? []);
        setLoadingOptions(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

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
  const taxRateNum = parseFloat(taxRate) || 0;
  const subtotalCents =
    mode === "flat_rate"
      ? parseCents(flatRate)
      : lineItems.reduce((sum, row) => sum + lineTotal(row), 0);
  const taxCents = Math.round((subtotalCents * taxRateNum) / 100);
  const totalCents = subtotalCents + taxCents;

  function handleModeChange(newMode: "itemized" | "flat_rate") {
    if (newMode === "flat_rate") {
      const current = lineItems.reduce((sum, row) => sum + lineTotal(row), 0);
      setFlatRate((current / 100).toFixed(2));
    } else {
      if (lineItems.length === 0) setLineItems([{ ...EMPTY_ROW }]);
    }
    setMode(newMode);
  }

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
    if (mode === "itemized" && lineItems.length === 0) { setError("Add at least one line item."); return; }
    setError(null);
    setPending(true);

    try {
      const payload =
        mode === "flat_rate"
          ? {
              client_id: clientId,
              job_id: jobId || null,
              property_id: propertyId || null,
              notes: notes.trim() || null,
              expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
              tax_rate: taxRateNum,
              flat_rate_cents: parseCents(flatRate),
              line_items: [],
            }
          : {
              client_id: clientId,
              job_id: jobId || null,
              property_id: propertyId || null,
              notes: notes.trim() || null,
              expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
              tax_rate: taxRateNum,
              line_items: lineItems.map((row, i) => ({
                description: row.description,
                quantity: parseFloat(row.quantity) || 1,
                unit_price_cents: parseCents(row.unit_price),
                sort_order: i,
              })),
            };

      const res = await fetch(`/api/v1/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to update estimate.");
        setPending(false);
        return;
      }

      toast.success("Estimate saved.");
      router.refresh();
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPending(false);
    }
  }

  return (
    <Card data-testid="estimate-edit-form">
      <SectionHeader title="Edit Estimate" as="h2" />
      <form onSubmit={handleSubmit} className="p7-form-stack">
        {error && (
          <Card className="p7-card-danger" padding="sm" role="alert">
            <p style={{ margin: 0 }} data-testid="edit-form-error">{error}</p>
          </Card>
        )}

        <div className="p7-form-grid p7-form-grid-2">
          <Select
            id="edit-est-client"
            label="Client"
            required
            value={clientId}
            onChange={(e) => {
              setClientId(e.target.value);
              setJobId("");
              setPropertyId("");
            }}
            disabled={loadingOptions || pending}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
            placeholder={loadingOptions ? "Loading…" : "Select a client"}
          />

          <Select
            id="edit-est-job"
            label="Job (optional)"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            disabled={loadingOptions || pending || !clientId}
            options={filteredJobs.map((j) => ({ value: j.id, label: j.title }))}
            placeholder="None"
            hint={
              clientId && !loadingOptions && filteredJobs.length === 0
                ? "No open jobs for this client."
                : undefined
            }
          />

          <Select
            id="edit-est-property"
            label="Property (optional)"
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            disabled={loadingOptions || pending || !clientId}
            options={filteredProperties.map((p) => ({ value: p.id, label: p.address }))}
            placeholder="None"
            hint={
              clientId && !loadingOptions && filteredProperties.length === 0
                ? "No properties for this client."
                : undefined
            }
          />

          <Input
            id="edit-est-expires"
            label="Expires (optional)"
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            disabled={pending}
          />

          <Textarea
            id="edit-est-notes"
            label="Client notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Visible to the client"
            rows={3}
            disabled={pending}
            containerClassName="p7-form-grid-span-2"
          />
        </div>

        {/* Pricing Mode Toggle + Line Items */}
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
            <SectionHeader
              title={mode === "flat_rate" ? "Flat Rate" : "Line Items"}
              count={mode === "itemized" ? lineItems.length : undefined}
              as="h3"
            />
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                overflow: "hidden",
              }}
            >
              {(["itemized", "flat_rate"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeChange(m)}
                  disabled={pending}
                  style={{
                    padding: "var(--space-1) var(--space-3)",
                    background: mode === m ? "var(--accent)" : "transparent",
                    color: mode === m ? "#fff" : "var(--fg-muted)",
                    border: "none",
                    cursor: pending ? "default" : "pointer",
                    fontSize: "var(--text-sm)",
                    fontWeight: mode === m ? 600 : 400,
                    lineHeight: 1.4,
                  }}
                  data-testid={`edit-mode-${m}`}
                >
                  {m === "itemized" ? "Itemized" : "Flat Rate"}
                </button>
              ))}
            </div>
          </div>

          {mode === "flat_rate" ? (
            <div className="p7-form-grid p7-form-grid-2" style={{ marginBottom: "var(--space-3)" }}>
              <Input
                id="edit-flat-rate"
                label="Price ($)"
                type="number"
                min="0"
                step="0.01"
                value={flatRate}
                onChange={(e) => setFlatRate(e.target.value)}
                disabled={pending}
                data-testid="edit-flat-rate-input"
              />
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "var(--space-2)" }}>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addLineItem}
                  disabled={pending}
                  data-testid="edit-add-line-item-btn"
                >
                  + Add Item
                </Button>
              </div>
              {lineItems.length === 0 ? (
                <p style={{ color: "var(--fg-muted)" }}>No line items. Add at least one.</p>
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
                              data-testid={`edit-line-item-desc-${i}`}
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
                              data-testid={`edit-line-item-qty-${i}`}
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
                              data-testid={`edit-line-item-price-${i}`}
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
                                data-testid={`edit-duplicate-line-item-${i}`}
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
                                  data-testid={`edit-remove-line-item-${i}`}
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
            </>
          )}

          {/* Totals */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
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
              {mode === "itemized" && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Subtotal</span>
                  <span data-testid="edit-subtotal">{formatDollars(subtotalCents)}</span>
                </>
              )}

              <label
                htmlFor="edit-tax-rate"
                style={{ color: "var(--fg-muted)", whiteSpace: "nowrap" }}
              >
                Tax Rate (%)
              </label>
              <input
                id="edit-tax-rate"
                className="p7-input"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                disabled={pending}
                style={{ width: 90, textAlign: "right" }}
                data-testid="edit-tax-rate-input"
              />

              {taxCents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Tax</span>
                  <span data-testid="edit-tax-amount">{formatDollars(taxCents)}</span>
                </>
              )}

              <strong>Total</strong>
              <strong data-testid="edit-total">{formatDollars(totalCents)}</strong>
            </div>
          </div>
        </div>

        <div className="p7-form-actions" style={{ marginTop: "var(--space-4)" }}>
          <Button
            type="submit"
            disabled={pending || loadingOptions}
            loading={pending}
            data-testid="submit-estimate-edit-btn"
          >
            {pending ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
