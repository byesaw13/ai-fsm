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
import {
  calculatePaintingEstimate,
  formatCents,
  getStandardEstimateTerms,
} from "@/lib/estimates/pricing";
import {
  PAINTING_RATE_STANDARD_CENTS,
  PREP_LEVEL_MULTIPLIERS,
} from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Client {
  id: string;
  name: string;
}

interface Job {
  id: string;
  title: string;
  client_id: string;
}

interface Property {
  id: string;
  address: string;
  client_id: string;
}

interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
}

interface ParsedScope {
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  labor_hours_estimate: number | null;
  material_cost_cents: number | null;
  suggested_job_type: string;
  confidence: number;
  parsed_items: string[];
  warnings: string[];
}

interface ScopeResult {
  parsed: ParsedScope;
  estimate_preview: Record<string, string> | null;
}

interface NewEstimateFormProps {
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

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

const PREP_LEVEL_LABELS: Record<number, string> = {
  1: "1 — Light dusting",
  2: "2 — Wipe down",
  3: "3 — Minor touch-ups",
  4: "4 — Small patch repairs",
  5: "5 — Standard prep",
  6: "6 — Moderate repair",
  7: "7 — Heavy patching",
  8: "8 — Extensive repair",
  9: "9 — Major restoration",
  10: "10 — Full restoration",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NewEstimateForm({
  clients,
  jobs,
  properties,
  initialClientId,
  initialJobId,
}: NewEstimateFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Service type: painting vs generic
  const [serviceType, setServiceType] = useState<"painting" | "generic">("painting");

  // Shared fields
  const [clientId, setClientId] = useState(
    initialClientId && clients.some((c) => c.id === initialClientId)
      ? initialClientId
      : ""
  );
  const [jobId, setJobId] = useState(
    initialJobId && jobs.some((j) => j.id === initialJobId) ? initialJobId : ""
  );
  const [propertyId, setPropertyId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [taxRate, setTaxRate] = useState("0");
  const [sendImmediately, setSendImmediately] = useState(false);

  // Painting fields
  const [sqFt, setSqFt] = useState("");
  const [prepLevel, setPrepLevel] = useState(5);
  const [includesTrim, setIncludesTrim] = useState(true);
  const [includesCeiling, setIncludesCeiling] = useState(false);
  const [materialCostDollars, setMaterialCostDollars] = useState("");
  const [laborHours, setLaborHours] = useState("");

  // Scope parser
  const [scopeNotes, setScopeNotes] = useState("");
  const [scopeParsing, setScopeParsing] = useState(false);
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);

  // Generic fields
  const [mode, setMode] = useState<"itemized" | "flat_rate">("itemized");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([{ ...EMPTY_ROW }]);
  const [flatRate, setFlatRate] = useState("0.00");

  const filteredJobs = useMemo(
    () => (clientId ? jobs.filter((j) => j.client_id === clientId) : jobs),
    [clientId, jobs]
  );
  const filteredProperties = useMemo(
    () => (clientId ? properties.filter((p) => p.client_id === clientId) : []),
    [clientId, properties]
  );

  // Clear job/property when client changes
  useEffect(() => {
    if (jobId && !filteredJobs.some((j) => j.id === jobId)) {
      setJobId("");
    }
  }, [filteredJobs, jobId]);

  useEffect(() => {
    if (propertyId && !filteredProperties.some((p) => p.id === propertyId)) {
      setPropertyId("");
    }
  }, [filteredProperties, propertyId]);

  // Live painting estimate calculation
  const paintingResult = useMemo(() => {
    const sq = parseFloat(sqFt);
    const mat = parseCents(materialCostDollars);
    const hrs = parseFloat(laborHours);
    if (isNaN(sq) || sq <= 0 || isNaN(hrs) || hrs <= 0) return null;
    return calculatePaintingEstimate({
      sq_ft: sq,
      prep_level: prepLevel,
      includes_trim: includesTrim,
      includes_ceiling: includesCeiling,
      material_cost_cents: mat,
      labor_hours_estimate: hrs,
    });
  }, [sqFt, prepLevel, includesTrim, includesCeiling, materialCostDollars, laborHours]);

  // Generic live totals
  const taxRateNum = parseFloat(taxRate) || 0;
  const genericSubtotalCents =
    mode === "flat_rate"
      ? parseCents(flatRate)
      : lineItems.reduce((sum, row) => sum + lineTotal(row), 0);
  const genericTaxCents = Math.round((genericSubtotalCents * taxRateNum) / 100);
  const genericTotalCents = genericSubtotalCents + genericTaxCents;

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

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItemRow, value: string) {
    setLineItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function handleParseScope() {
    setScopeParsing(true);
    setScopeError(null);
    setScopeResult(null);
    try {
      const res = await fetch("/api/v1/estimates/ai-scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: scopeNotes }),
      });
      const json = await res.json() as ScopeResult & { error?: { message?: string } };
      if (!res.ok) {
        setScopeError(json.error?.message ?? "Failed to parse notes.");
        return;
      }
      const { parsed } = json;
      setScopeResult(json);
      if (parsed.sq_ft !== null) setSqFt(parsed.sq_ft.toString());
      if (parsed.prep_level !== null) setPrepLevel(parsed.prep_level);
      setIncludesTrim(parsed.includes_trim);
      setIncludesCeiling(parsed.includes_ceiling);
      if (parsed.labor_hours_estimate !== null) setLaborHours(parsed.labor_hours_estimate.toString());
      if (parsed.material_cost_cents !== null) setMaterialCostDollars((parsed.material_cost_cents / 100).toFixed(2));
      if (parsed.suggested_job_type === "custom") setServiceType("generic");
    } catch {
      setScopeError("Network error — could not parse notes.");
    } finally {
      setScopeParsing(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Please select a client.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      let payload: Record<string, unknown>;

      if (serviceType === "painting" && paintingResult) {
        payload = {
          client_id: clientId,
          job_id: jobId || null,
          property_id: propertyId || null,
          notes: notes.trim() || getStandardEstimateTerms().notes,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: taxRateNum,
          // Painting engine fields
          sq_ft: parseFloat(sqFt),
          prep_level: prepLevel,
          includes_trim: includesTrim,
          includes_ceiling: includesCeiling,
          material_cost_cents: parseCents(materialCostDollars),
          labor_hours_estimate: parseFloat(laborHours),
          // Derived from painting engine
          line_items: [
            {
              description: `Painting labor — ${parseFloat(sqFt).toLocaleString()} sq ft${includesCeiling ? " + ceiling" : ""}${includesTrim ? " + trim" : ""} (prep level ${prepLevel})`,
              quantity: 1,
              unit_price_cents: paintingResult.labor_flat_rate_cents,
              sort_order: 0,
            },
            ...(parseCents(materialCostDollars) > 0
              ? [
                  {
                    description: "Materials",
                    quantity: 1,
                    unit_price_cents: parseCents(materialCostDollars),
                    sort_order: 1,
                  },
                ]
              : []),
            ...(paintingResult.material_handling_cents > 0
              ? [
                  {
                    description: "Material handling fee (15%)",
                    quantity: 1,
                    unit_price_cents: paintingResult.material_handling_cents,
                    sort_order: 2,
                    visible_to_customer: true,
                  },
                ]
              : []),
          ],
          internal_notes: `Internal labor: ${formatCents(paintingResult.internal_labor_cost_cents)} | Gross margin: ${paintingResult.gross_margin_pct}% (${formatCents(paintingResult.gross_margin_cents)})`,
        };
      } else if (mode === "flat_rate") {
        payload = {
          client_id: clientId,
          job_id: jobId || null,
          property_id: propertyId || null,
          notes: notes.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: taxRateNum,
          flat_rate_cents: parseCents(flatRate),
          line_items: [],
        };
      } else {
        if (lineItems.length === 0) {
          setError("Add at least one line item.");
          setPending(false);
          return;
        }
        payload = {
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
      }

      const res = await fetch("/api/v1/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to create estimate.");
        setPending(false);
        return;
      }

      const { id } = (await res.json()) as { id: string };

      if (sendImmediately) {
        await fetch(`/api/v1/estimates/${id}/transition`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "sent" }),
        });
      }

      router.push(`/app/estimates/${id}`);
    } catch {
      setError("An unexpected error occurred. Please try again.");
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p7-form-stack" data-testid="new-estimate-form">
      {error && (
        <Card className="p7-card-danger" padding="sm" role="alert">
          <p style={{ margin: 0 }} data-testid="form-error">
            {error}
          </p>
        </Card>
      )}

      {/* Service Type Toggle */}
      <div>
        <SectionHeader title="Service Type" as="h3" />
        <div
          style={{
            display: "flex",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            overflow: "hidden",
            width: "fit-content",
          }}
        >
          {(["painting", "generic"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setServiceType(t)}
              disabled={pending}
              style={{
                padding: "var(--space-1) var(--space-3)",
                background: serviceType === t ? "var(--accent)" : "transparent",
                color: serviceType === t ? "#fff" : "var(--fg-muted)",
                border: "none",
                cursor: pending ? "default" : "pointer",
                fontSize: "var(--text-sm)",
                fontWeight: serviceType === t ? 600 : 400,
                lineHeight: 1.4,
              }}
            >
              {t === "painting" ? "Painting" : "Generic"}
            </button>
          ))}
        </div>
      </div>

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
              ? "No open jobs for this client."
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
          id="expires_at"
          label="Expires (optional)"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          disabled={pending}
        />

        <Textarea
          id="notes"
          label="Client notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Visible to the client"
          rows={3}
          disabled={pending}
          containerClassName="p7-form-grid-span-2"
        />
      </div>

      {/* Painting Estimator */}
      {serviceType === "painting" && (
        <div>
          <SectionHeader title="Painting Estimator" as="h3" />

          {/* Scope parser */}
          <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
            <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
              Parse from description
            </p>
            <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
              Paste the customer&apos;s job description to auto-fill the fields below.
            </p>
            <Textarea
              id="scope_notes"
              label=""
              value={scopeNotes}
              onChange={(e) => setScopeNotes(e.target.value)}
              placeholder="e.g. Paint 3 bedrooms, patch some holes and sand walls, include ceiling and trim, about $350 for materials"
              rows={3}
              disabled={pending || scopeParsing}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleParseScope}
                disabled={!scopeNotes.trim() || scopeParsing || pending}
                loading={scopeParsing}
              >
                {scopeParsing ? "Parsing…" : "Parse Notes"}
              </Button>
            </div>

            {scopeError && (
              <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-error)" }}>
                {scopeError}
              </p>
            )}

            {scopeResult && (
              <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", marginBottom: "var(--space-1)" }}>
                  <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>Parsed</span>
                  <span style={{
                    padding: "2px 8px", borderRadius: 99, fontSize: "var(--text-xs)", fontWeight: 600, color: "#fff",
                    background: scopeResult.parsed.confidence >= 70 ? "var(--status-success)" : scopeResult.parsed.confidence >= 40 ? "var(--status-warning)" : "var(--status-error)",
                  }}>
                    {scopeResult.parsed.confidence}% confidence
                  </span>
                </div>
                <ul style={{ margin: 0, padding: "0 0 0 var(--space-4)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  {scopeResult.parsed.parsed_items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                {scopeResult.parsed.warnings.map((w, i) => (
                  <p key={i} style={{ margin: "var(--space-1) 0 0", fontSize: "var(--text-xs)", color: "var(--status-warning)", fontWeight: 500 }}>
                    ⚠ {w}
                  </p>
                ))}
                <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                  Fields applied below — review and adjust as needed.
                </p>
              </div>
            )}
          </div>

          <div className="p7-form-grid p7-form-grid-2">
            <Input
              id="sq_ft"
              label="Square Footage"
              type="number"
              min="1"
              step="1"
              value={sqFt}
              onChange={(e) => setSqFt(e.target.value)}
              disabled={pending}
              placeholder="e.g. 1200"
            />

            <Input
              id="labor_hours"
              label="Estimated Labor Hours"
              type="number"
              min="0.5"
              step="0.5"
              value={laborHours}
              onChange={(e) => setLaborHours(e.target.value)}
              disabled={pending}
              placeholder="Internal only, not shown to client"
              hint="Used for margin calculation"
            />

            <Input
              id="material_cost"
              label="Material Cost ($)"
              type="number"
              min="0"
              step="0.01"
              value={materialCostDollars}
              onChange={(e) => setMaterialCostDollars(e.target.value)}
              disabled={pending}
              placeholder="e.g. 350.00"
            />

            <div className="p7-field">
              <label className="p7-label">Prep Level</label>
              <select
                id="prep_level"
                className="p7-select"
                value={prepLevel}
                onChange={(e) => setPrepLevel(Number(e.target.value))}
                disabled={pending}
              >
                {Object.entries(PREP_LEVEL_MULTIPLIERS).map(([level, mult]) => (
                  <option key={level} value={level}>
                    {PREP_LEVEL_LABELS[Number(level)] ?? `Level ${level} (${mult}x)`}
                  </option>
                ))}
              </select>
              <span className="p7-field-hint">
                Multiplier: {PREP_LEVEL_MULTIPLIERS[prepLevel]?.toFixed(2)}x base rate
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: "var(--space-4)", marginTop: "var(--space-2)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includesTrim}
                onChange={(e) => setIncludesTrim(e.target.checked)}
                disabled={pending}
              />
              <span>Include trim (+$0.20/sq ft)</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={includesCeiling}
                onChange={(e) => setIncludesCeiling(e.target.checked)}
                disabled={pending}
              />
              <span>Include ceiling (+30% surface)</span>
            </label>
          </div>

          {/* Live Preview */}
          {paintingResult && (
            <div style={{ marginTop: "var(--space-4)" }}>
              <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
                <SectionHeader title="Estimate Preview" as="h4" />
                <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
                  <span style={{ color: "var(--fg-muted)" }}>Labor (flat rate)</span>
                  <span>{formatCents(paintingResult.labor_flat_rate_cents)}</span>

                  {parseCents(materialCostDollars) > 0 && (
                    <>
                      <span style={{ color: "var(--fg-muted)" }}>Materials</span>
                      <span>{formatCents(parseCents(materialCostDollars))}</span>

                      <span style={{ color: "var(--fg-muted)" }}>Handling fee (15%)</span>
                      <span>{formatCents(paintingResult.material_handling_cents)}</span>
                    </>
                  )}

                  <strong>Total</strong>
                  <strong>{formatCents(paintingResult.total_cents)}</strong>

                  <span style={{ color: "var(--fg-muted)" }}>Deposit (30%)</span>
                  <span>{formatCents(paintingResult.deposit_cents)}</span>

                  <span style={{ color: "var(--fg-muted)" }}>Balance (70%)</span>
                  <span>{formatCents(paintingResult.balance_cents)}</span>
                </div>

                {/* Internal margin section */}
                <div style={{ marginTop: "var(--space-3)", paddingTop: "var(--space-2)", borderTop: "1px dashed var(--border)" }}>
                    <SectionHeader title="Internal Margin" as="h4" />
                  <div style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "var(--space-1) var(--space-4)", textAlign: "right" }}>
                    <span style={{ color: "var(--fg-muted)" }}>Internal labor cost ($85/hr)</span>
                    <span>{formatCents(paintingResult.internal_labor_cost_cents)}</span>

                    <span style={{ color: "var(--fg-muted)" }}>Gross margin</span>
                    <span style={{
                      color: paintingResult.gross_margin_pct >= 30 ? "var(--color-success)" : paintingResult.gross_margin_pct >= 15 ? "var(--color-warning)" : "var(--color-danger)",
                      fontWeight: 600,
                    }}>
                      {paintingResult.gross_margin_pct}% ({formatCents(paintingResult.gross_margin_cents)})
                    </span>

                    <span style={{ color: "var(--fg-muted)" }}>Effective rate</span>
                    <span>${(paintingResult.effective_sq_ft_rate_cents / 100).toFixed(2)}/sq ft</span>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {!paintingResult && (parseFloat(sqFt) > 0 || parseFloat(laborHours) > 0) && (
            <p style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)", marginTop: "var(--space-2)" }}>
              Enter both square footage and labor hours to see the estimate preview.
            </p>
          )}
        </div>
      )}

      {/* Generic Pricing */}
      {serviceType === "generic" && (
        <div>
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
                  data-testid={`mode-${m}`}
                >
                  {m === "itemized" ? "Itemized" : "Flat Rate"}
                </button>
              ))}
            </div>
          </div>

          {mode === "flat_rate" ? (
            <div className="p7-form-grid p7-form-grid-2" style={{ marginBottom: "var(--space-3)" }}>
              <Input
                id="flat_rate"
                label="Price ($)"
                type="number"
                min="0"
                step="0.01"
                value={flatRate}
                onChange={(e) => setFlatRate(e.target.value)}
                disabled={pending}
                data-testid="flat-rate-input"
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
                  data-testid="add-line-item-btn"
                >
                  + Add Item
                </Button>
              </div>
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
                            {formatCents(lineTotal(row))}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: "var(--space-1)" }}>
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
            </>
          )}

          {/* Generic totals */}
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
              {mode === "itemized" && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Subtotal</span>
                  <span data-testid="subtotal">{formatCents(genericSubtotalCents)}</span>
                </>
              )}

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

              {genericTaxCents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Tax</span>
                  <span data-testid="tax-amount">{formatCents(genericTaxCents)}</span>
                </>
              )}

              <strong>Total</strong>
              <strong data-testid="total">{formatCents(genericTotalCents)}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Options */}
      <div>
        <SectionHeader title="Options" as="h3" />
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={sendImmediately}
            onChange={(e) => setSendImmediately(e.target.checked)}
            disabled={pending}
            data-testid="send-immediately-checkbox"
          />
          <span>Send to client immediately</span>
        </label>
      </div>

      {/* Actions */}
      <div className="p7-form-actions">
        <LinkButton href="/app/estimates" variant="secondary" tabIndex={-1}>
          Cancel
        </LinkButton>
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !clientId || (serviceType === "painting" && !paintingResult)}
          loading={pending}
          data-testid="submit-estimate-btn"
        >
          {pending
            ? "Creating…"
            : sendImmediately
            ? "Create & Send"
            : "Create Estimate"}
        </Button>
      </div>
    </form>
  );
}
