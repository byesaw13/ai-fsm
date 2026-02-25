"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";

interface ClientOption { id: string; name: string; }
interface JobOption { id: string; title: string; client_id: string; }

interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string; // dollars
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
  initialNotes: string | null;
  initialExpiresAt: string | null;
  initialLineItems: InitialLineItem[];
}

function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function lineTotal(row: LineItemRow): number {
  const qty = parseFloat(row.quantity);
  const price = parseCents(row.unit_price);
  if (isNaN(qty) || qty <= 0) return 0;
  return Math.round(qty * price);
}

function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsToDisplayDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

// Convert "2024-01-15T00:00:00.000Z" → "2024-01-15" for date input
function isoToDateString(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function EstimateEditForm({
  estimateId,
  initialClientId,
  initialJobId,
  initialNotes,
  initialExpiresAt,
  initialLineItems,
}: EstimateEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  const [clientId, setClientId] = useState(initialClientId);
  const [jobId, setJobId] = useState(initialJobId ?? "");
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [expiresAt, setExpiresAt] = useState(isoToDateString(initialExpiresAt));
  const [lineItems, setLineItems] = useState<LineItemRow[]>(
    initialLineItems.length > 0
      ? initialLineItems.map(item => ({
          description: item.description,
          quantity: String(item.quantity),
          unit_price: centsToDisplayDollars(item.unit_price_cents),
        }))
      : [{ description: "", quantity: "1", unit_price: "0.00" }]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/v1/clients?limit=200").then(r => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/jobs?limit=200").then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([clientsData, jobsData]) => {
      if (!cancelled) {
        setClients(clientsData.data ?? []);
        setJobs(jobsData.data ?? []);
        setLoadingOptions(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const filteredJobs = clientId ? jobs.filter(j => j.client_id === clientId) : jobs;

  const subtotalCents = lineItems.reduce((sum, row) => sum + lineTotal(row), 0);

  function addLineItem() {
    setLineItems(prev => [...prev, { description: "", quantity: "1", unit_price: "0.00" }]);
  }

  function removeLineItem(index: number) {
    setLineItems(prev => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItemRow, value: string) {
    setLineItems(prev => prev.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) { setError("Please select a client"); return; }
    if (lineItems.length === 0) { setError("Add at least one line item"); return; }
    setError("");
    setPending(true);
    try {
      const payload = {
        client_id: clientId,
        job_id: jobId || null,
        notes: notes || null,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
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
        setError(data.error?.message ?? "Failed to update estimate");
        return;
      }

      toast.success("Estimate updated");
      router.refresh();
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card" data-testid="estimate-edit-form">
      <h2>Edit Estimate</h2>
      <form onSubmit={handleSubmit}>
        {/* Details */}
        <div className="form-field">
          <label htmlFor="edit-est-client">
            Client <span className="required">*</span>
          </label>
          <select
            id="edit-est-client"
            value={clientId}
            onChange={e => { setClientId(e.target.value); setJobId(""); }}
            required
            disabled={loadingOptions || pending}
          >
            <option value="">{loadingOptions ? "Loading…" : "— Select client —"}</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-est-job">Job (optional)</label>
          <select
            id="edit-est-job"
            value={jobId}
            onChange={e => setJobId(e.target.value)}
            disabled={loadingOptions || pending}
          >
            <option value="">{loadingOptions ? "Loading…" : "— None —"}</option>
            {filteredJobs.map(j => (
              <option key={j.id} value={j.id}>{j.title}</option>
            ))}
          </select>
        </div>

        <div className="form-field">
          <label htmlFor="edit-est-expires">Expires (optional)</label>
          <input
            id="edit-est-expires"
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="form-field">
          <label htmlFor="edit-est-notes">Notes (optional)</label>
          <textarea
            id="edit-est-notes"
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Client-visible notes"
            disabled={pending}
          />
        </div>

        {/* Line Items */}
        <div style={{ marginTop: "var(--space-4)" }}>
          <div className="section-header">
            <h3 style={{ margin: 0 }}>Line Items</h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addLineItem}
              disabled={pending}
              data-testid="edit-add-line-item-btn"
            >
              + Add Item
            </button>
          </div>

          {lineItems.length === 0 ? (
            <p className="muted">No line items. Add at least one.</p>
          ) : (
            <table className="line-items-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th style={{ width: 80 }}>Qty</th>
                  <th style={{ width: 120 }}>Unit Price</th>
                  <th style={{ width: 100 }}>Total</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="text"
                        value={row.description}
                        onChange={e => updateLineItem(i, "description", e.target.value)}
                        placeholder="Description"
                        required
                        disabled={pending}
                        data-testid={`edit-line-item-desc-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.quantity}
                        onChange={e => updateLineItem(i, "quantity", e.target.value)}
                        disabled={pending}
                        data-testid={`edit-line-item-qty-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={e => updateLineItem(i, "unit_price", e.target.value)}
                        disabled={pending}
                        data-testid={`edit-line-item-price-${i}`}
                      />
                    </td>
                    <td className="line-total">{formatDollars(lineTotal(row))}</td>
                    <td>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeLineItem(i)}
                          disabled={pending}
                          aria-label={`Remove line item ${i + 1}`}
                          data-testid={`edit-remove-line-item-${i}`}
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="subtotal-label">Subtotal</td>
                  <td className="line-total" data-testid="edit-subtotal">
                    {formatDollars(subtotalCents)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Actions */}
        <div style={{ marginTop: "var(--space-4)" }}>
          {error && (
            <p className="error-inline" role="alert" data-testid="edit-form-error">{error}</p>
          )}
          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || loadingOptions}
              data-testid="submit-estimate-edit-btn"
            >
              {pending ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
