"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ClientOption {
  id: string;
  name: string;
}

interface JobOption {
  id: string;
  title: string;
  client_id: string;
}

interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
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

export default function NewEstimatePage() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [clientId, setClientId] = useState("");
  const [jobId, setJobId] = useState("");
  const [notes, setNotes] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([
    { description: "", quantity: "1", unit_price: "0.00" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/v1/clients").then((r) => r.json()).catch(() => ({ data: [] })),
      fetch("/api/v1/jobs?limit=100").then((r) => r.json()).catch(() => ({ data: [] })),
    ]).then(([clientsData, jobsData]) => {
      if (!cancelled) {
        setClients(clientsData.data ?? []);
        setJobs(jobsData.data ?? []);
        setLoadingOptions(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredJobs = clientId
    ? jobs.filter((j) => j.client_id === clientId)
    : jobs;

  const subtotalCents = lineItems.reduce(
    (sum, row) => sum + lineTotal(row),
    0
  );

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      { description: "", quantity: "1", unit_price: "0.00" },
    ]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(
    index: number,
    field: keyof LineItemRow,
    value: string
  ) {
    setLineItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Please select a client");
      return;
    }
    if (lineItems.length === 0) {
      setError("Add at least one line item");
      return;
    }

    setSubmitting(true);
    setError("");

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

      const res = await fetch("/api/v1/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create estimate");
        return;
      }

      const { id } = (await res.json()) as { id: string };
      router.push(`/app/estimates/${id}` as `/app/estimates/${string}`);
    } catch {
      setError("Unexpected error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <Link href="/app/estimates" className="back-link">
            ← Estimates
          </Link>
          <h1 className="page-title">New Estimate</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Client & Job */}
        <div className="card detail-card">
          <h2>Details</h2>

          <div className="form-field">
            <label htmlFor="client_id">
              Client <span className="required">*</span>
            </label>
            <select
              id="client_id"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setJobId("");
              }}
              required
              disabled={loadingOptions}
              aria-busy={loadingOptions}
            >
              <option value="">
                {loadingOptions ? "Loading clients…" : "— Select client —"}
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="job_id">Job (optional)</label>
            <select
              id="job_id"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              disabled={loadingOptions}
              aria-busy={loadingOptions}
            >
              <option value="">
                {loadingOptions ? "Loading jobs…" : "— None —"}
              </option>
              {filteredJobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label htmlFor="expires_at">Expires (optional)</label>
            <input
              id="expires_at"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Client-visible notes"
            />
          </div>
        </div>

        {/* Line Items */}
        <div className="card">
          <div className="section-header">
            <h2>Line Items</h2>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={addLineItem}
              data-testid="add-line-item-btn"
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
                        onChange={(e) =>
                          updateLineItem(i, "description", e.target.value)
                        }
                        placeholder="Description"
                        required
                        data-testid={`line-item-desc-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={row.quantity}
                        onChange={(e) =>
                          updateLineItem(i, "quantity", e.target.value)
                        }
                        data-testid={`line-item-qty-${i}`}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.unit_price}
                        onChange={(e) =>
                          updateLineItem(i, "unit_price", e.target.value)
                        }
                        data-testid={`line-item-price-${i}`}
                      />
                    </td>
                    <td className="line-total">
                      {formatDollars(lineTotal(row))}
                    </td>
                    <td>
                      {lineItems.length > 1 && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => removeLineItem(i)}
                          data-testid={`remove-line-item-${i}`}
                          aria-label={`Remove line item ${i + 1}`}
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
                  <td colSpan={3} className="subtotal-label">
                    Subtotal
                  </td>
                  <td className="line-total" data-testid="subtotal">
                    {formatDollars(subtotalCents)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {/* Submit */}
        <div className="card">
          {error && (
            <p className="error-inline" data-testid="form-error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Link href="/app/estimates" className="btn btn-secondary">
              Cancel
            </Link>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || loadingOptions}
              data-testid="submit-estimate-btn"
            >
              {submitting ? "Creating…" : "Create Estimate"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
