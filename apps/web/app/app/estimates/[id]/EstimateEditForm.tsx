"use client";

import { useState, useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
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
import {
  calculatePaintingEstimate,
  formatCents,
} from "@/lib/estimates/pricing";
import { GuardrailsSection } from "../components/GuardrailsSection";
import { LineItemsTable } from "../components/LineItemsTable";
import {
  PREP_LEVEL_MULTIPLIERS,
} from "@ai-fsm/domain";
import { lineTotal, type LineItemRow } from "@/lib/estimates/form-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ClientOption { id: string; name: string; }
interface JobOption { id: string; title: string; client_id: string; }
interface PropertyOption { id: string; address: string; client_id: string; }


interface InitialLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  sort_order: number;
}

interface InitialOption {
  id: string;
  label: string;
  description: string;
  is_recommended: boolean;
  sort_order: number;
  line_items: { description: string; quantity: number; unit_price_cents: number }[];
}

interface EstimateEditFormProps {
  estimateId: string;
  presentationMode?: "standard" | "multi_option";
  initialOptions?: InitialOption[];
  initialClientId: string;
  initialJobId: string | null;
  initialPropertyId: string | null;
  initialNotes: string | null;
  initialExpiresAt: string | null;
  initialSubtotalCents: number;
  initialTaxCents: number;
  initialLineItems: InitialLineItem[];
  // Painting fields
  initialSqFt?: number | null;
  initialPrepLevel?: number | null;
  initialIncludesTrim?: boolean;
  initialIncludesCeiling?: boolean;
  initialMaterialCostCents?: number | null;
  initialLaborHours?: number | null;
  initialTripCount?: "one_trip" | "multi_trip";
  initialRequiresDryingOrCuring?: boolean;
  initialDifficultAccess?: boolean;
  initialOldHouseRisk?: boolean;
  initialCoordinationRequired?: boolean;
  initialFinishExpectation?: "basic" | "clean" | "premium";
  initialTravelSurchargeCents?: number;
  initialRiskAdjustmentCents?: number;
  initialMinimumServiceOverrideReason?: "bundled" | "membership_included" | "promo" | "owner_approved" | null;
  initialMinimumServiceOverrideNote?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}


function formatDollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function centsToDisplayDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

function isoToDateString(iso: string | Date | null): string {
  if (!iso) return "";
  const str = iso instanceof Date ? iso.toISOString() : iso;
  return str.slice(0, 10);
}

const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

// Public export — routes to TierEditor or standard form based on mode
export function EstimateEditForm(props: EstimateEditFormProps) {
  if (props.presentationMode === "multi_option") {
    const initialTaxRate =
      props.initialSubtotalCents > 0
        ? Math.round((props.initialTaxCents / props.initialSubtotalCents) * 10000) / 100
        : 0;
    return (
      <TierEditor
        estimateId={props.estimateId}
        initialOptions={props.initialOptions ?? []}
        initialNotes={props.initialNotes}
        initialExpiresAt={props.initialExpiresAt}
        initialTaxRate={initialTaxRate}
      />
    );
  }
  return <StandardEstimateEditForm {...props} />;
}

function StandardEstimateEditForm({
  estimateId,
  initialClientId,
  initialJobId,
  initialPropertyId,
  initialNotes,
  initialExpiresAt,
  initialSubtotalCents,
  initialTaxCents,
  initialLineItems,
  initialSqFt,
  initialPrepLevel,
  initialIncludesTrim,
  initialIncludesCeiling,
  initialMaterialCostCents,
  initialLaborHours,
  initialTripCount,
  initialRequiresDryingOrCuring,
  initialDifficultAccess,
  initialOldHouseRisk,
  initialCoordinationRequired,
  initialFinishExpectation,
  initialTravelSurchargeCents,
  initialRiskAdjustmentCents,
  initialMinimumServiceOverrideReason,
  initialMinimumServiceOverrideNote,
}: EstimateEditFormProps) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);

  // Detect initial mode
  const hasPaintingData = initialSqFt !== null && initialSqFt !== undefined;
  const isFlatRateInitially = !hasPaintingData && initialLineItems.length === 0 && initialSubtotalCents > 0;
  const [serviceType, setServiceType] = useState<"painting" | "generic">(
    hasPaintingData ? "painting" : "generic"
  );
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

  // Painting state
  const [sqFt, setSqFt] = useState(initialSqFt?.toString() ?? "");
  const [prepLevel, setPrepLevel] = useState(initialPrepLevel ?? 5);
  const [includesTrim, setIncludesTrim] = useState(initialIncludesTrim ?? true);
  const [includesCeiling, setIncludesCeiling] = useState(initialIncludesCeiling ?? false);
  const [materialCostDollars, setMaterialCostDollars] = useState(
    initialMaterialCostCents ? (initialMaterialCostCents / 100).toFixed(2) : ""
  );
  const [laborHours, setLaborHours] = useState(initialLaborHours?.toString() ?? "");
  const [tripCount, setTripCount] = useState<"one_trip" | "multi_trip">(initialTripCount ?? "one_trip");
  const [requiresDryingOrCuring, setRequiresDryingOrCuring] = useState(initialRequiresDryingOrCuring ?? false);
  const [difficultAccess, setDifficultAccess] = useState(initialDifficultAccess ?? false);
  const [oldHouseRisk, setOldHouseRisk] = useState(initialOldHouseRisk ?? false);
  const [coordinationRequired, setCoordinationRequired] = useState(initialCoordinationRequired ?? false);
  const [finishExpectation, setFinishExpectation] = useState<"basic" | "clean" | "premium">(initialFinishExpectation ?? "clean");
  const [travelSurcharge, setTravelSurcharge] = useState(centsToDisplayDollars(initialTravelSurchargeCents ?? 0));
  const [riskAdjustment, setRiskAdjustment] = useState(centsToDisplayDollars(initialRiskAdjustmentCents ?? 0));
  const [minimumOverrideReason, setMinimumOverrideReason] = useState(initialMinimumServiceOverrideReason ?? "");
  const [minimumOverrideNote, setMinimumOverrideNote] = useState(initialMinimumServiceOverrideNote ?? "");

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
  const guardrailAdjustmentCents = parseCents(travelSurcharge) + parseCents(riskAdjustment);
  const adjustedSubtotalCents = subtotalCents + guardrailAdjustmentCents;
  const taxCents = Math.round((adjustedSubtotalCents * taxRateNum) / 100);
  const totalCents = adjustedSubtotalCents + taxCents;

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
      let payload: Record<string, unknown>;

      if (serviceType === "painting" && paintingResult) {
        payload = {
          client_id: clientId,
          job_id: jobId || null,
          property_id: propertyId || null,
          notes: notes.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: taxRateNum,
          sq_ft: parseFloat(sqFt),
          prep_level: prepLevel,
          includes_trim: includesTrim,
          includes_ceiling: includesCeiling,
          material_cost_cents: parseCents(materialCostDollars),
          labor_hours_estimate: parseFloat(laborHours),
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
                  },
                ]
              : []),
          ],
          trip_count: tripCount,
          requires_drying_or_curing: requiresDryingOrCuring,
          difficult_access: difficultAccess,
          old_house_risk: oldHouseRisk,
          coordination_required: coordinationRequired,
          finish_expectation: finishExpectation,
          travel_surcharge_cents: parseCents(travelSurcharge),
          risk_adjustment_cents: parseCents(riskAdjustment),
          minimum_service_override_reason: minimumOverrideReason || null,
          minimum_service_override_note: minimumOverrideNote.trim() || null,
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
          trip_count: tripCount,
          requires_drying_or_curing: requiresDryingOrCuring,
          difficult_access: difficultAccess,
          old_house_risk: oldHouseRisk,
          coordination_required: coordinationRequired,
          finish_expectation: finishExpectation,
          travel_surcharge_cents: parseCents(travelSurcharge),
          risk_adjustment_cents: parseCents(riskAdjustment),
          minimum_service_override_reason: minimumOverrideReason || null,
          minimum_service_override_note: minimumOverrideNote.trim() || null,
        };
      } else {
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
          trip_count: tripCount,
          requires_drying_or_curing: requiresDryingOrCuring,
          difficult_access: difficultAccess,
          old_house_risk: oldHouseRisk,
          coordination_required: coordinationRequired,
          finish_expectation: finishExpectation,
          travel_surcharge_cents: parseCents(travelSurcharge),
          risk_adjustment_cents: parseCents(riskAdjustment),
          minimum_service_override_reason: minimumOverrideReason || null,
          minimum_service_override_note: minimumOverrideNote.trim() || null,
        };
      }

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

        <GuardrailsSection
          idPrefix="edit"
          disabled={pending}
          tripCount={tripCount} setTripCount={setTripCount}
          finishExpectation={finishExpectation} setFinishExpectation={setFinishExpectation}
          travelSurcharge={travelSurcharge} setTravelSurcharge={setTravelSurcharge}
          riskAdjustment={riskAdjustment} setRiskAdjustment={setRiskAdjustment}
          minimumOverrideReason={minimumOverrideReason} setMinimumOverrideReason={setMinimumOverrideReason}
          minimumOverrideNote={minimumOverrideNote} setMinimumOverrideNote={setMinimumOverrideNote}
          requiresDryingOrCuring={requiresDryingOrCuring} setRequiresDryingOrCuring={setRequiresDryingOrCuring}
          difficultAccess={difficultAccess} setDifficultAccess={setDifficultAccess}
          oldHouseRisk={oldHouseRisk} setOldHouseRisk={setOldHouseRisk}
          coordinationRequired={coordinationRequired} setCoordinationRequired={setCoordinationRequired}
        />

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

        {/* Painting Estimator */}
        {serviceType === "painting" && (
          <div style={{ marginTop: "var(--space-4)" }}>
            <SectionHeader title="Painting Estimator" as="h3" />

            <div className="p7-form-grid p7-form-grid-2">
              <Input
                id="edit-sq-ft"
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
                id="edit-labor-hours"
                label="Estimated Labor Hours"
                type="number"
                min="0.5"
                step="0.5"
                value={laborHours}
                onChange={(e) => setLaborHours(e.target.value)}
                disabled={pending}
                placeholder="Internal only"
                hint="Used for margin calculation"
              />

              <Input
                id="edit-material-cost"
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
                <label className="p7-label" htmlFor="edit-prep-level">Prep Level</label>
                <select
                  id="edit-prep-level"
                  className="p7-select"
                  value={prepLevel}
                  onChange={(e) => setPrepLevel(Number(e.target.value))}
                  disabled={pending}
                >
                  {Object.entries(PREP_LEVEL_MULTIPLIERS).map(([level, mult]) => (
                    <option key={level} value={level}>
                      Level {level} ({mult}x)
                    </option>
                  ))}
                </select>
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
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        )}

        {/* Generic Pricing */}
        {serviceType === "generic" && (
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
              <LineItemsTable
                items={lineItems}
                disabled={pending}
                testIdPrefix="edit"
                onUpdate={updateLineItem}
                onAdd={addLineItem}
                onRemove={removeLineItem}
                onDuplicate={duplicateLineItem}
              />
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

              {guardrailAdjustmentCents > 0 && (
                <>
                  <span style={{ color: "var(--fg-muted)" }}>Pricing Adjustments</span>
                  <span>{formatDollars(guardrailAdjustmentCents)}</span>
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
        )}

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

// ---------------------------------------------------------------------------
// TierEditor — edit Good/Better/Best options on a multi_option estimate
// ---------------------------------------------------------------------------

interface TierLineItem { description: string; quantity: string; unit_price: string; }
interface TierDraft {
  id: string;
  label: string;
  description: string;
  is_recommended: boolean;
  line_items: TierLineItem[];
}

function tierSubtotal(tier: TierDraft): number {
  return tier.line_items.reduce((sum, row) => {
    const qty = parseFloat(row.quantity) || 0;
    const price = parseFloat(row.unit_price) || 0;
    return sum + Math.round(qty * price * 100);
  }, 0);
}

function TierEditor({
  estimateId,
  initialOptions,
  initialNotes,
  initialExpiresAt,
  initialTaxRate,
}: {
  estimateId: string;
  initialOptions: InitialOption[];
  initialNotes: string | null;
  initialExpiresAt: string | null;
  initialTaxRate: number;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [expiresAt, setExpiresAt] = useState(isoToDateString(initialExpiresAt));

  const [tiers, setTiers] = useState<TierDraft[]>(
    initialOptions.map((opt) => ({
      id: opt.id,
      label: opt.label,
      description: opt.description,
      is_recommended: opt.is_recommended,
      line_items: opt.line_items.length > 0
        ? opt.line_items.map((li) => ({
            description: li.description,
            quantity: String(li.quantity),
            unit_price: centsToDisplayDollars(li.unit_price_cents),
          }))
        : [{ description: "", quantity: "1", unit_price: "0.00" }],
    }))
  );

  function updateTier(i: number, patch: Partial<TierDraft>) {
    setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  }

  function updateLineItem(tierIdx: number, liIdx: number, field: keyof TierLineItem, val: string) {
    setTiers((prev) => prev.map((t, i) =>
      i !== tierIdx ? t : {
        ...t,
        line_items: t.line_items.map((li, j) => j === liIdx ? { ...li, [field]: val } : li),
      }
    ));
  }

  function addLineItem(tierIdx: number) {
    setTiers((prev) => prev.map((t, i) =>
      i !== tierIdx ? t : { ...t, line_items: [...t.line_items, { description: "", quantity: "1", unit_price: "0.00" }] }
    ));
  }

  function removeLineItem(tierIdx: number, liIdx: number) {
    setTiers((prev) => prev.map((t, i) =>
      i !== tierIdx ? t : { ...t, line_items: t.line_items.filter((_, j) => j !== liIdx) }
    ));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const options = tiers.map((tier, idx) => ({
        label: tier.label,
        description: tier.description || null,
        is_recommended: tier.is_recommended,
        sort_order: idx,
        line_items: tier.line_items
          .filter((li) => li.description.trim())
          .map((li, liIdx) => ({
            description: li.description.trim(),
            quantity: parseFloat(li.quantity) || 1,
            unit_price_cents: Math.round((parseFloat(li.unit_price) || 0) * 100),
            sort_order: liIdx,
          })),
      }));

      const res = await fetch(`/api/v1/estimates/${estimateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presentation_mode: "multi_option",
          options,
          notes: notes.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: initialTaxRate,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error?.message ?? "Failed to save");
        return;
      }
      toast.success("Estimate saved");
      window.location.reload();
    } catch {
      setError("Network error — try again");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <SectionHeader title="Edit Tiers" />
      <form onSubmit={handleSave} className="p7-form-stack">
        {error && <div className="p7-card-danger" role="alert">{error}</div>}

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, gap: "var(--space-4)" }}>
          {tiers.map((tier, ti) => (
            <div
              key={tier.id}
              style={{
                border: tier.is_recommended ? "2px solid var(--accent, #2563eb)" : "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-4)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-3)",
              }}
            >
              <Input
                id={`tier-label-${ti}`}
                label="Tier Name"
                value={tier.label}
                onChange={(e) => updateTier(ti, { label: e.target.value })}
                disabled={pending}
              />
              <Input
                id={`tier-desc-${ti}`}
                label="Description"
                value={tier.description}
                onChange={(e) => updateTier(ti, { description: e.target.value })}
                placeholder="What's included…"
                disabled={pending}
              />
              <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                <input
                  type="checkbox"
                  checked={tier.is_recommended}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setTiers((prev) => prev.map((t, i) => ({ ...t, is_recommended: i === ti ? checked : false })));
                  }}
                  disabled={pending}
                />
                Recommended
              </label>

              <div>
                <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Line Items</p>
                {tier.line_items.map((li, liIdx) => (
                  <div key={liIdx} style={{ display: "grid", gridTemplateColumns: "1fr 60px 80px 24px", gap: "var(--space-1)", marginBottom: "var(--space-1)", alignItems: "end" }}>
                    <input
                      type="text"
                      value={li.description}
                      onChange={(e) => updateLineItem(ti, liIdx, "description", e.target.value)}
                      placeholder="Description"
                      disabled={pending}
                      style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}
                    />
                    <input
                      type="number"
                      value={li.quantity}
                      onChange={(e) => updateLineItem(ti, liIdx, "quantity", e.target.value)}
                      min="0.01"
                      step="0.01"
                      disabled={pending}
                      style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}
                    />
                    <input
                      type="number"
                      value={li.unit_price}
                      onChange={(e) => updateLineItem(ti, liIdx, "unit_price", e.target.value)}
                      min="0"
                      step="0.01"
                      placeholder="Price"
                      disabled={pending}
                      style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", fontSize: "var(--text-sm)" }}
                    />
                    {tier.line_items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeLineItem(ti, liIdx)}
                        disabled={pending}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className="p7-btn p7-btn-ghost p7-btn-sm"
                  onClick={() => addLineItem(ti)}
                  disabled={pending}
                  style={{ marginTop: "var(--space-1)" }}
                >
                  + Add line
                </button>
              </div>

              <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--fg)" }}>
                Subtotal: ${(tierSubtotal(tier) / 100).toFixed(2)}
              </div>
            </div>
          ))}
        </div>

        <Input
          id="tier-expires"
          label="Expires (optional)"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          disabled={pending}
        />

        <Textarea
          id="tier-notes"
          label="Client notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          disabled={pending}
        />

        <div className="p7-form-actions">
          <Button type="submit" variant="primary" loading={pending} disabled={pending}>
            {pending ? "Saving…" : "Save Tiers"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
