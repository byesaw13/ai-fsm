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
import { EstimateTierEditor } from "../components/EstimateTierEditor";
import { GuardrailsSection } from "../components/GuardrailsSection";
import { LineItemsTable } from "../components/LineItemsTable";
import { PaintingEstimatorSection } from "../components/PaintingEstimatorSection";
import {
  PREP_LEVEL_MULTIPLIERS,
  computePaintingProject,
  roomResultToLegacyFields,
} from "@ai-fsm/domain";
import type { RoomSpec, ProjectOptions, PaintingProjectResult } from "@ai-fsm/domain";
import type { OptionTier } from "@/lib/estimates/form-helpers";
import { parseCents, lineTotal, EMPTY_ROW, buildShoppingListFromPaintingSummary, type LineItemRow } from "@/lib/estimates/form-helpers";
import { RoomByRoomEditor } from "../../estimates/new/components/RoomByRoomEditor";

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
  // Room-by-room painting
  initialRoomSpecs?: RoomSpec[] | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  initialRoomSpecs,
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

  // Room-by-room state
  const [paintingMode, setPaintingMode] = useState<"quick" | "room_by_room">(
    initialRoomSpecs && initialRoomSpecs.length > 0 ? "room_by_room" : "quick"
  );
  const [roomSpecs, setRoomSpecs] = useState<RoomSpec[]>(initialRoomSpecs ?? []);
  const [projectOptions, setProjectOptions] = useState<ProjectOptions>({ coat_count: 2, occupied_home: false, vaulted_ceilings: false });

  function handleRoomByRoomChange(rooms: RoomSpec[], opts: ProjectOptions, result: PaintingProjectResult) {
    setRoomSpecs(rooms);
    setProjectOptions(opts);
    const legacy = roomResultToLegacyFields(result);
    setSqFt(legacy.sq_ft.toString());
    setPrepLevel(legacy.prep_level);
    setIncludesTrim(legacy.includes_trim);
    setIncludesCeiling(legacy.includes_ceiling);
    setMaterialCostDollars((result.material_subtotal_cents / 100).toFixed(2));
    const estHours = (result.total_wall_sqft + result.total_ceiling_sqft) / 100 * 0.85 * opts.coat_count;
    setLaborHours(estHours.toFixed(1));
  }

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
          // Persist room specs when in room-by-room mode
          ...(paintingMode === "room_by_room" && roomSpecs.length > 0 ? { room_specs: roomSpecs } : {}),
          // Build shopping list from room result if available
          ...((() => {
            if (paintingMode === "room_by_room" && roomSpecs.length > 0) {
              const result = computePaintingProject(roomSpecs, projectOptions);
              const sl = buildShoppingListFromPaintingSummary(result);
              return sl ? { shopping_list_json: sl } : {};
            }
            return {};
          })()),
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
            {/* Mode toggle — Quick vs Room-by-room */}
            <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-3)" }}>
              {(["quick", "room_by_room"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPaintingMode(m)}
                  style={{
                    fontSize: "var(--text-xs)",
                    padding: "4px 12px",
                    borderRadius: "var(--radius-sm)",
                    border: `1px solid ${paintingMode === m ? "var(--accent)" : "var(--border)"}`,
                    background: paintingMode === m ? "var(--accent)" : "var(--bg-subtle)",
                    color: paintingMode === m ? "#fff" : "var(--fg)",
                    cursor: "pointer",
                    fontWeight: paintingMode === m ? 600 : 400,
                  }}
                >
                  {m === "quick" ? "Quick (sqft total)" : "Room by room"}
                </button>
              ))}
            </div>

            {paintingMode === "room_by_room" && (
              <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "var(--space-4)", marginBottom: "var(--space-4)" }}>
                <p style={{ margin: "0 0 var(--space-3)", fontWeight: 600, fontSize: "var(--text-sm)" }}>
                  Room-by-room painting estimator
                </p>
                <RoomByRoomEditor
                  rooms={roomSpecs.length > 0 ? roomSpecs : [{
                    name: "", length_ft: 0, width_ft: 0, ceiling_height_ft: 8,
                    doors: 1, windows: 2, include_ceiling: false, include_trim: true,
                    prep_level: "minor", paint_supplied_by: "dovetails", paint_grade: "standard",
                    primer_needed: false, dark_to_light: false,
                  }]}
                  options={projectOptions}
                  onChange={handleRoomByRoomChange}
                />
              </div>
            )}

            {paintingMode === "quick" && (
            <PaintingEstimatorSection
              idPrefix="edit"
              disabled={pending}
              sqFt={sqFt} setSqFt={setSqFt}
              laborHours={laborHours} setLaborHours={setLaborHours}
              materialCostDollars={materialCostDollars} setMaterialCostDollars={setMaterialCostDollars}
              prepLevel={prepLevel} setPrepLevel={setPrepLevel}
              includesTrim={includesTrim} setIncludesTrim={setIncludesTrim}
              includesCeiling={includesCeiling} setIncludesCeiling={setIncludesCeiling}
              paintingResult={paintingResult ? { ...paintingResult, material_cents: paintingResult.material_subtotal_cents } : null}
            />
            )}
          </div>
        )}

        {/* Generic Pricing */}
        {serviceType === "generic" && (
        <div style={{ marginTop: "var(--space-4)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
            <SectionHeader
              title={mode === "flat_rate" ? "Fixed Bid" : "Line Items"}
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
                  {m === "itemized" ? "Itemized" : "Fixed Bid"}
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

interface TierDraft {
  id: string;
  label: string;
  description: string;
  is_recommended: boolean;
  line_items: LineItemRow[];
}

function tierSubtotal(tier: OptionTier): number {
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

  function updateLineItem(tierIdx: number, liIdx: number, field: keyof LineItemRow, val: string) {
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

        <EstimateTierEditor
          tiers={tiers as unknown as OptionTier[]}
          taxRateNum={initialTaxRate}
          disabled={pending}
          onUpdateTier={(ti, patch) => {
            if (patch.is_recommended) {
              // Enforce single recommended tier — clear all others
              setTiers((prev) => prev.map((t, i) => ({
                ...t,
                ...(i === ti ? patch : { is_recommended: false }),
              })));
            } else {
              updateTier(ti, patch as Partial<TierDraft>);
            }
          }}
          onUpdateTierLineItem={updateLineItem}
          onAddTierLineItem={addLineItem}
          onRemoveTierLineItem={removeLineItem}
          tierSubtotalCents={tierSubtotal}
        />

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
