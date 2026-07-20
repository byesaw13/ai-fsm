"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PriceBookService } from "@/components/PriceBookSelector";
import { formatCents, getStandardEstimateTerms } from "@/lib/estimates/pricing";
import type { DepositDueTrigger, DepositType } from "@/lib/estimates/deposit-policy";
import {
  ENGINE_VERSION,
  STANDARD_DEPOSIT_PERCENT,
  type MaterialSuggestion,
  type EstimateSpec,
} from "@ai-fsm/domain";
import { useEstimateAI } from "./useEstimateAI";
import {
  resolveAssessmentContext,
  type AssessmentContext,
} from "@/lib/estimates/assessment-context";
import type { ShoppingList, SpecifiedMaterial, RoomSpec, ProjectOptions, EstimateResult } from "@ai-fsm/domain";
import {
  estimateResultToLegacyFields,
  buildShoppingListFromEstimateResult,
  roomSpecsToEstimateSpec,
} from "@ai-fsm/domain";
import { useEstimatePriceBook } from "./useEstimatePriceBook";
import { useEstimateTiers } from "./useEstimateTiers";
import {
  parseCents, lineTotal, mapPrepLevel,
  EMPTY_ROW, PREP_LEVEL_LABELS, STEP_LABELS, DEFAULT_TIERS,
  buildManualShoppingList,

  type LineItemRow, type OptionTier,
} from "@/lib/estimates/form-helpers";
import { useEstimatePricing } from "./useEstimatePricing";
import { useEstimateLiveIntel } from "./useEstimateLiveIntel";
import { usePricingSettings } from "./usePricingSettings";

// Re-export shared helpers + types so the component's existing imports keep working
export {
  parseCents, lineTotal, mapPrepLevel,
  EMPTY_ROW, PREP_LEVEL_LABELS, STEP_LABELS, DEFAULT_TIERS,
  type LineItemRow, type OptionTier,
} from "@/lib/estimates/form-helpers";

export { type EditableSuggestion, type ParsedScope, type ScopeResult } from "./useEstimateAI";

// ---------------------------------------------------------------------------
// Types (form-specific, not shared)
// ---------------------------------------------------------------------------

export interface Client {
  id: string;
  name: string;
}

export interface Job {
  id: string;
  title: string;
  client_id: string;
}

export interface Property {
  id: string;
  address: string;
  client_id: string;
}

export interface NewEstimateFormProps {
  /** Standard deposit % from Settings — the default for a new estimate. */
  defaultDepositPercent?: number;
  clients: Client[];
  jobs: Job[];
  properties: Property[];
  initialClientId?: string;
  initialJobId?: string;
  initialPropertyId?: string;
  initialVaultItemId?: string;
  vaultItemContext?: { name: string; category: string; location: string | null } | null;
  initialPricingMode?: "itemized" | "flat_rate" | "multi_option";
  /** When set, the form auto-applies this draft on mount (from AI interview flow) */
  initialInterviewDraft?: { draft: import("@/lib/estimates/ai-draft").DraftEstimate; shoppingList: ShoppingList | null } | null;
  /** When set, the form auto-applies a T&M briefing draft on mount (paste → hours/range path). */
  initialTmDraft?: import("@/lib/estimates/tm-briefing").TmEstimateDraft | null;
  /** Seed text for the notes/scope field (e.g. walkthrough findings). Initial value only — never overwrites edits. */
  initialNotes?: string;
  /** Booking request that originated this estimate — stored for chain traceability. */
  bookingRequestId?: string;
  /** Server-loaded assessment summary, used to recover context when the
   * sessionStorage hand-off is missing (refresh / deep-link). TASK-018 slice 2. */
  serverAssessmentContext?: AssessmentContext | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEstimateForm({
  clients,
  jobs,
  properties,
  initialClientId,
  initialJobId,
  initialPropertyId,
  initialVaultItemId,
  vaultItemContext,
  initialPricingMode = "flat_rate",
  initialInterviewDraft,
  initialTmDraft = null,
  initialNotes,
  bookingRequestId,
  serverAssessmentContext = null,
  defaultDepositPercent,
}: NewEstimateFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);

  const [clientList, setClientList] = useState<Client[]>(clients);
  const [jobList, setJobList] = useState<Job[]>(jobs);
  const [propertyList, setPropertyList] = useState<Property[]>(properties);

  const [inlineForm, setInlineForm] = useState<"client" | "job" | "property" | null>(null);

  const [serviceType, setServiceType] = useState<"painting" | "generic">("generic");

  const [clientId, setClientId] = useState(
    initialClientId && clientList.some((c) => c.id === initialClientId) ? initialClientId : ""
  );
  const [jobId, setJobId] = useState(
    initialJobId && jobList.some((j) => j.id === initialJobId) ? initialJobId : ""
  );
  const [propertyId, setPropertyId] = useState(
    initialPropertyId && propertyList.some((p) => p.id === initialPropertyId) ? initialPropertyId : ""
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState(
    // Initial value only (runs once on mount) so later user edits are never overwritten.
    // Walkthrough prefill takes precedence, then vault-item context, then empty.
    initialNotes?.trim()
      ? initialNotes
      : vaultItemContext
      ? `Service for ${vaultItemContext.name}${vaultItemContext.location ? ` (${vaultItemContext.location})` : ""} — ${vaultItemContext.category}.`
      : ""
  );
  const [taxRate, setTaxRate] = useState("0");
  const [sendImmediately, setSendImmediately] = useState(false);
  const [depositRequired, setDepositRequired] = useState(false);
  const [depositType, setDepositType] = useState<DepositType>("none");
  const [depositPercentage, setDepositPercentage] = useState(
    String(defaultDepositPercent ?? STANDARD_DEPOSIT_PERCENT),
  );
  const [depositFixedDollars, setDepositFixedDollars] = useState("0.00");
  const [depositDueTrigger, setDepositDueTrigger] = useState<DepositDueTrigger>("before_scheduling");
  const [termsScopeAccepted, setTermsScopeAccepted] = useState(false);
  const [termsPaymentAccepted, setTermsPaymentAccepted] = useState(false);
  const [termsChangeOrderAccepted, setTermsChangeOrderAccepted] = useState(false);

  const [sqFt, setSqFt] = useState("");
  const [prepLevel, setPrepLevel] = useState(5);
  const [includesTrim, setIncludesTrim] = useState(true);
  const [includesCeiling, setIncludesCeiling] = useState(false);
  const [materialCostDollars, setMaterialCostDollars] = useState("");
  const [laborHours, setLaborHours] = useState("");
  const [addedMaterials, setAddedMaterials] = useState<Set<string>>(new Set());

  const [lineItems, setLineItems] = useState<LineItemRow[]>(() => {
    if (typeof window === "undefined") return [{ ...EMPTY_ROW }];
    try {
      const raw = window.sessionStorage.getItem("estimate_prefill_materials");
      if (raw) {
        const parsed = JSON.parse(raw) as LineItemRow[];
        window.sessionStorage.removeItem("estimate_prefill_materials");
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore parse errors */ }
    return [{ ...EMPTY_ROW }];
  });

  // Assessment hand-off (generated description + rooms). Consume once at form
  // level: storage is always cleared so it can't survive into a later estimate,
  // but the context is only applied when this estimate was opened from an
  // assessment (from_assessment=1) — a plain new-estimate never inherits stale
  // context left behind by an abandoned hand-off.
  const [assessmentContext] = useState<AssessmentContext | null>(() =>
    resolveAssessmentContext(
      searchParams.get("from_assessment") === "1",
      serverAssessmentContext
    )
  );

  const [tripCount, setTripCount] = useState<"one_trip" | "multi_trip">("one_trip");
  const [requiresDryingOrCuring, setRequiresDryingOrCuring] = useState(false);
  const [difficultAccess, setDifficultAccess] = useState(false);
  const [oldHouseRisk, setOldHouseRisk] = useState(false);
  const [coordinationRequired, setCoordinationRequired] = useState(false);
  const [finishExpectation, setFinishExpectation] = useState<"basic" | "clean" | "premium">("clean");
  const [travelSurcharge, setTravelSurcharge] = useState("0.00");
  // Full travel recommendation from TravelRecommendation widget (applied post-create)
  const [travelRecommendation, setTravelRecommendation] = useState<import("@/components/travel/TravelRecommendation").TravelRecommendationValue | null>(null);
  const [riskAdjustment, setRiskAdjustment] = useState("0.00");
  const [minimumOverrideReason, setMinimumOverrideReason] = useState("");
  const [minimumOverrideNote, setMinimumOverrideNote] = useState("");
  const [scopeAssumptions, setScopeAssumptions] = useState("");
  const assumptionsLookupInFlight = useRef(false);

  const [pendingDraftScope, setPendingDraftScope] = useState<
    Record<string, { scopeValues: Record<string, number | string>; complexityFactors: string[] }>
  >({});

  const [draftShoppingList, setDraftShoppingList] = useState<ShoppingList | null>(null);
  const [draftSpecifiedMaterials, setDraftSpecifiedMaterials] = useState<SpecifiedMaterial[]>([]);
  /** Internal notes seeded by T&M briefing (or painting engine); submitted with create payload. */
  const [internalNotes, setInternalNotes] = useState("");

  // Room-by-room painting estimator
  const [paintingMode, setPaintingMode] = useState<"quick" | "room_by_room">("quick");
  const [roomSpecs, setRoomSpecs] = useState<RoomSpec[]>([]);
  const [projectOptions, setProjectOptions] = useState<ProjectOptions>({
    coat_count: 2,
    occupied_home: false,
    vaulted_ceilings: false,
  });
  // Shopping list derived from room-by-room computation (authoritative for painting mode)
  const [roomShoppingList, setRoomShoppingList] = useState<ShoppingList | null>(null);

  // ---------------------------------------------------------------------------
  // Price book sub-hook
  // ---------------------------------------------------------------------------

  const priceBook = useEstimatePriceBook();
  const { priceBookItems, setPriceBookItems, scopeResults, setScopeResults,
          priceBookLineItems, scopeMaterialsTotalCents,
          handleScopeChange, removePriceBookItem } = priceBook;

  function handleAddPriceBookItem(service: PriceBookService, priceCents: number) {
    priceBook.handleAddPriceBookItem(service, priceCents, (row) => {
      setLineItems((prev) => [...prev.filter((r) => r.description.trim()), row]);
    });
    // Auto-populate scope assumptions from template default when first item is added.
    // Guard with a ref so rapid adds don't fire competing fetches.
    if (!scopeAssumptions.trim() && !assumptionsLookupInFlight.current) {
      assumptionsLookupInFlight.current = true;
      fetch(`/api/v1/scope-templates?category=${encodeURIComponent(service.category)}`)
        .then((r) => r.json())
        .then((data: { template?: { default_assumptions?: string | null } }) => {
          const assumptions = data?.template?.default_assumptions;
          if (assumptions) setScopeAssumptions((cur) => cur.trim() ? cur : assumptions);
        })
        .catch(() => { /* non-critical */ })
        .finally(() => { assumptionsLookupInFlight.current = false; });
    }
  }

  // ---------------------------------------------------------------------------
  // Tiers sub-hook
  // ---------------------------------------------------------------------------

  const tiersHook = useEstimateTiers(() =>
    lineItems.reduce((sum, row) => sum + lineTotal(row), 0),
    initialPricingMode
  );
  const { mode, flatRate, setFlatRate, tiers,
          updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem,
          tierSubtotalCents } = tiersHook;

  function handleModeChange(newMode: "itemized" | "flat_rate" | "multi_option") {
    if (newMode === "itemized" && lineItems.length === 0) {
      setLineItems([{ ...EMPTY_ROW }]);
    }
    tiersHook.handleModeChange(newMode);
  }

  // ---------------------------------------------------------------------------
  // AI sub-hook
  // ---------------------------------------------------------------------------

  const ai = useEstimateAI({
    jobId,
    pending,
    onScopeParsed: (parsed) => {
      if (parsed.sq_ft !== null) setSqFt(parsed.sq_ft.toString());
      if (parsed.prep_level !== null) setPrepLevel(parsed.prep_level);
      setIncludesTrim(parsed.includes_trim);
      setIncludesCeiling(parsed.includes_ceiling);
      if (parsed.labor_hours_estimate !== null) setLaborHours(parsed.labor_hours_estimate.toString());
      if (parsed.material_cost_cents !== null) setMaterialCostDollars((parsed.material_cost_cents / 100).toFixed(2));
      if (parsed.suggested_job_type === "custom") setServiceType("generic");
    },
    onAddLineItems: (rows) => {
      setLineItems((prev) => [...prev.filter((r) => r.description.trim()), ...rows]);
    },
    onApplyDraft: ({ priceBookItems: draftItems, lineItems: newLineItems, scopeMap, notes: draftNotes, guardrails, shoppingList, specifiedMaterials }) => {
      setPriceBookItems(draftItems);
      setScopeResults({});
      setLineItems((prev) => {
        const manual = prev.filter((r) => r.description.trim() && !r.price_book_id);
        return [...newLineItems, ...manual];
      });
      setPendingDraftScope(scopeMap);
      if (draftNotes) setNotes(draftNotes);
      setTripCount(guardrails.trip_count);
      setDifficultAccess(guardrails.difficult_access);
      setOldHouseRisk(guardrails.old_house_risk);
      setRequiresDryingOrCuring(guardrails.requires_drying_or_curing);
      setCoordinationRequired(guardrails.coordination_required);
      setFinishExpectation(guardrails.finish_expectation);
      setDraftShoppingList(shoppingList ?? null);
      setDraftSpecifiedMaterials(specifiedMaterials ?? []);
    },
  });

  // ---------------------------------------------------------------------------
  // Auto-apply interview draft on mount
  // ---------------------------------------------------------------------------

  const interviewDraftApplied = useRef(false);
  useEffect(() => {
    if (initialInterviewDraft && !interviewDraftApplied.current) {
      interviewDraftApplied.current = true;
      const { draft, shoppingList } = initialInterviewDraft;
      // Re-use the AI hook's internal builder
      ai.applyPendingDraftFromExternal(draft, shoppingList);
      setStep(3); // Jump to Adjustments step after interview
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Auto-apply T&M briefing draft on mount
  // ---------------------------------------------------------------------------

  const tmDraftApplied = useRef(false);
  useEffect(() => {
    if (initialTmDraft && !tmDraftApplied.current) {
      tmDraftApplied.current = true;
      const tm = initialTmDraft;
      handleModeChange("itemized");
      setServiceType("generic");
      setLineItems(
        tm.line_items.map((li) => ({
          description: li.description,
          quantity: String(li.quantity),
          unit_price: (li.unit_price_cents / 100).toFixed(2),
        }))
      );
      setNotes(tm.notes);
      setInternalNotes(tm.internal_notes);
      setLaborHours(String(tm.labor_mid_hours + tm.travel_mid_hours));
      setTripCount(tm.guardrails.trip_count);
      setDifficultAccess(tm.guardrails.difficult_access);
      setOldHouseRisk(tm.guardrails.old_house_risk);
      setRequiresDryingOrCuring(tm.guardrails.requires_drying_or_curing);
      setCoordinationRequired(tm.guardrails.coordination_required);
      setFinishExpectation(tm.guardrails.finish_expectation);
      setDraftShoppingList(tm.shopping_list);
      setDraftSpecifiedMaterials(tm.specified_materials);
      const riskLine =
        tm.extraction.risks.length > 0
          ? `Risks: ${tm.extraction.risks.join("; ")}`
          : "";
      const scopeLine =
        tm.extraction.scope_items.length > 0
          ? `Scope: ${tm.extraction.scope_items.join("; ")}`
          : tm.extraction.scope_summary;
      setScopeAssumptions(
        [scopeLine, riskLine, tm.extraction.materials_policy].filter(Boolean).join("\n")
      );
      // Land on Pricing so mid-range lines are visible; fall back to Who & What if no client yet.
      setStep(clientId ? 2 : 1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // Filtered lists + entity callbacks
  // ---------------------------------------------------------------------------

  const filteredJobs = useMemo(
    () => (clientId ? jobList.filter((j) => j.client_id === clientId) : jobList),
    [clientId, jobList]
  );
  const filteredProperties = useMemo(
    () => (clientId ? propertyList.filter((p) => p.client_id === clientId) : []),
    [clientId, propertyList]
  );

  const handleClientCreated = useCallback((client: { id: string; name: string }) => {
    setClientList((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
    setClientId(client.id);
    setJobId("");
    setPropertyId("");
    setInlineForm(null);
  }, []);

  const handleJobCreated = useCallback((job: { id: string; title: string; client_id: string }) => {
    setJobList((prev) => [...prev, job]);
    setJobId(job.id);
    setInlineForm(null);
  }, []);

  const handlePropertyCreated = useCallback((property: { id: string; address: string; client_id: string }) => {
    setPropertyList((prev) => [...prev, property]);
    setPropertyId(property.id);
    setInlineForm(null);
  }, []);

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

  // ---------------------------------------------------------------------------
  // Pricing (delegated to useEstimatePricing)
  // ---------------------------------------------------------------------------

  const pricing = useEstimatePricing({
    serviceType, mode, lineItems, tiers, flatRate, taxRate,
    sqFt, prepLevel, includesTrim, includesCeiling,
    materialCostDollars, scopeMaterialsTotalCents,
    travelSurcharge, riskAdjustment,
    depositRequired, depositType, depositPercentage, depositFixedDollars, depositDueTrigger,
  });

  // ---------------------------------------------------------------------------
  // Live intelligence (unified derived state — Block 1)
  // ---------------------------------------------------------------------------

  const { settings: pricingSettings } = usePricingSettings();

  const liveIntel = useEstimateLiveIntel({
    serviceType, mode,
    paintingResult: pricing.paintingResult,
    genericTotalCents: pricing.genericTotalCents,
    depositCents: pricing.depositCents,
    balanceDueCents: pricing.balanceDueCents,
    scopeMaterialsTotalCents,
    scopeResults,
    priceBookItems,
    lineItems,
    laborHours,
    tripCount, requiresDryingOrCuring, difficultAccess, oldHouseRisk,
    coordinationRequired, finishExpectation,
    travelSurcharge, riskAdjustment,
    minimumOverrideReason,
    pricingSettings,
  });

  // ---------------------------------------------------------------------------
  // Line items
  // ---------------------------------------------------------------------------

  function addLineItem() {
    setLineItems((prev) => [...prev, { ...EMPTY_ROW }]);
  }

  function addBulkLineItems(items: LineItemRow[]) {
    setLineItems((prev) => [...prev.filter((r) => r.description.trim()), ...items]);
  }

  function removeLineItem(index: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateLineItem(index: number, field: keyof LineItemRow, value: string) {
    setLineItems((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function handleRoomByRoomChange(rooms: RoomSpec[], opts: ProjectOptions, result: EstimateResult) {
    setRoomSpecs(rooms);
    setProjectOptions(opts);
    const legacy = estimateResultToLegacyFields(result, rooms);
    setSqFt(legacy.sq_ft.toString());
    setPrepLevel(legacy.prep_level);
    setIncludesTrim(legacy.includes_trim);
    setIncludesCeiling(legacy.includes_ceiling);
    setMaterialCostDollars((result.summary.materialCents / 100).toFixed(2));
    const paintableSqft = legacy.sq_ft;
    const estHours = paintableSqft / 100 * 0.85 * opts.coat_count;
    setLaborHours(estHours.toFixed(1));
    setRoomShoppingList(buildShoppingListFromEstimateResult(result, rooms, opts));
  }

  function handleAddMaterial(mat: MaterialSuggestion) {
    const key = mat.name.toLowerCase();
    if (addedMaterials.has(key)) return;
    setAddedMaterials((prev) => new Set([...prev, key]));
    const desc = mat.notes ? `${mat.name} (${mat.notes})` : mat.name;
    setLineItems((prev) => [
      ...prev.filter((r) => r.description.trim()),
      { description: desc, quantity: mat.typicalQty.toString(), unit_price: "0.00" },
    ]);
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function advanceStep() {
    if (step === 1 && !clientId) {
      setError("Please select a client before continuing.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, 4));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goBack() {
    setError(null);
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const selectedClient = clientList.find((c) => c.id === clientId);
  const selectedJob = jobList.find((j) => j.id === jobId);
  const selectedProperty = propertyList.find((p) => p.id === propertyId);

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) return;
    if (!clientId) {
      setError("Please select a client.");
      return;
    }

    setPending(true);
    setError(null);

    const { paintingResult, taxRateNum } = pricing;

    try {
      let payload: Record<string, unknown>;
      let baseEngineSpec: EstimateSpec | null = null;

      if (serviceType === "painting") {
        if (!paintingResult) {
          setError("Enter the square footage to create a painting estimate.");
          setPending(false);
          return;
        }
        baseEngineSpec =
          paintingMode === "room_by_room" && roomSpecs.length > 0
            ? roomSpecsToEstimateSpec(roomSpecs, projectOptions)
            : paintingResult._spec;
        payload = {
          client_id: clientId,
          job_id: jobId || null,
          property_id: propertyId || null,
          notes: notes.trim() || getStandardEstimateTerms().notes,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: taxRateNum,
          sq_ft: parseFloat(sqFt),
          prep_level: prepLevel,
          includes_trim: includesTrim,
          includes_ceiling: includesCeiling,
          material_cost_cents: parseCents(materialCostDollars),
          labor_hours_estimate: parseFloat(laborHours) || 0,
          line_items: [
            {
              description: `Painting labor — ${parseFloat(sqFt).toLocaleString()} sq ft${includesCeiling ? " + ceiling" : ""}${includesTrim ? " + trim" : ""} (prep level ${prepLevel})`,
              quantity: 1,
              unit_price_cents: paintingResult.labor_flat_rate_cents,
              sort_order: 0,
            },
            ...(paintingResult.material_cents > 0
              ? [{ description: "Materials", quantity: 1, unit_price_cents: paintingResult.material_cents, sort_order: 1 }]
              : []),
            ...(paintingResult.material_handling_cents > 0
              ? [{ description: "Material handling fee (15%)", quantity: 1, unit_price_cents: paintingResult.material_handling_cents, sort_order: 2, visible_to_customer: true }]
              : []),
          ],
          internal_notes: `Internal labor: ${formatCents(paintingResult.internal_labor_cost_cents)} | Gross margin: ${paintingResult.gross_margin_pct}% (${formatCents(paintingResult.gross_margin_cents)})`,
          // Shopping list priority for painting mode:
          // 1. AI draft (draftShoppingList) — user described a specific product
          // 2. Room-by-room result (roomShoppingList) — authoritative: actual gallons by grade
          // 3. Scope builder fallback (buildManualShoppingList) — for mixed flows
          ...((() => {
            const sl = draftShoppingList ?? roomShoppingList ?? buildManualShoppingList(priceBookItems, scopeResults);
            return sl ? { shopping_list_json: sl } : {};
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
        };
      } else if (mode === "multi_option") {
        const options = tiers.map((tier, ti) => {
          const items = tier.line_items.filter((r) => r.description.trim() || parseCents(r.unit_price) > 0);
          return {
            label: tier.label,
            description: tier.description || null,
            sort_order: ti,
            is_recommended: tier.is_recommended,
            line_items: items.map((row, li) => ({
              description: row.description,
              quantity: parseFloat(row.quantity) || 1,
              unit_price_cents: parseCents(row.unit_price),
              sort_order: li,
              ...(row.price_book_id ? { price_book_id: row.price_book_id } : {}),
            })),
          };
        });

        const hasAnyItems = options.some((o) => o.line_items.length > 0);
        if (!hasAnyItems) {
          setError("Add at least one line item to at least one option.");
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
          presentation_mode: "multi_option",
          options,
        };
      } else {
        // Exclude price_book_id items — those are already covered by priceBookLineItems via ScopeBuilder.
        // Including them here would double-count every price-book service in the estimate total.
        const manualItems = lineItems.filter(
          (r) => (r.description.trim() || parseCents(r.unit_price) > 0) && !r.price_book_id
        );
        const { materialLineItems } = pricing;
        const scopeMatCents = scopeMaterialsTotalCents;
        const scopeMaterialItems = priceBookItems
          .filter((item) => (scopeResults[item.instanceId]?.materialTotalCents ?? 0) > 0)
          .map((item, i) => ({
            description: `Materials — ${item.service.name}`,
            quantity: 1,
            unit_price_cents: scopeResults[item.instanceId].materialTotalCents,
            line_item_type: "materials" as const,
            visible_to_customer: true,
            sort_order: priceBookLineItems.length + manualItems.length + i,
          }));
        const totalMaterialsForHandling =
          materialLineItems.reduce((sum, row) => sum + lineTotal(row), 0) + scopeMatCents;
        const handlingLineItems =
          totalMaterialsForHandling > 0
            ? [{
                description: "Material handling (15%)",
                quantity: 1,
                unit_price_cents: Math.round(totalMaterialsForHandling * 0.15),
                line_item_type: "handling_fee" as const,
                visible_to_customer: true,
                sort_order: priceBookLineItems.length + manualItems.length + scopeMaterialItems.length,
              }]
            : [];
        const allItems = [
          ...priceBookLineItems,
          ...manualItems.map((row, i) => ({
            description: row.description,
            quantity: parseFloat(row.quantity) || 1,
            unit_price_cents: parseCents(row.unit_price),
            sort_order: priceBookLineItems.length + i,
            price_book_id: row.price_book_id,
            price_book_code: undefined as string | undefined,
          })),
          ...scopeMaterialItems,
          ...handlingLineItems,
        ];
        const scopeSnapshots = priceBookItems
          .map((item) => {
            const sr = scopeResults[item.instanceId];
            if (!sr) return null;
            return {
              price_book_id: item.service.id,
              category: item.service.category,
              components: sr.components,
              complexity: sr.complexity,
              computed_modifier: sr.multiplier,
              base_price_cents: item.service.default_price_cents ?? item.priceCents,
              adjusted_price_cents: sr.adjustedPriceCents,
            };
          })
          .filter(Boolean);
        if (allItems.length === 0) {
          setError("Add at least one line item.");
          setPending(false);
          return;
        }
        baseEngineSpec = {
          engineVersion: ENGINE_VERSION,
          type: "general",
          lineItems: allItems.map((item, i) => ({
            id: `li-${i}`,
            description: item.description,
            quantity: item.quantity,
            unit: "unit" as const,
            unitLaborCents: item.unit_price_cents,
            ...("price_book_id" in item && item.price_book_id ? { priceBookId: item.price_book_id } : {}),
            ...("price_book_code" in item && item.price_book_code ? { priceBookCode: item.price_book_code } : {}),
          })),
        };
        payload = {
          client_id: clientId,
          job_id: jobId || null,
          property_id: propertyId || null,
          notes: notes.trim() || null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          tax_rate: taxRateNum,
          line_items: allItems,
          ...(scopeMatCents > 0 ? { material_cost_cents: scopeMatCents } : {}),
          ...(scopeSnapshots.length > 0 ? { scope_snapshots: scopeSnapshots } : {}),
          ...(internalNotes.trim() ? { internal_notes: internalNotes.trim() } : {}),
          ...(parseFloat(laborHours) > 0
            ? { labor_hours_estimate: parseFloat(laborHours) }
            : {}),
        };
      }

      Object.assign(payload, {
        ...(initialVaultItemId ? { vault_item_id: initialVaultItemId } : {}),
        ...(bookingRequestId ? { booking_request_id: bookingRequestId } : {}),
        // Persist shopping list: AI draft takes priority; fall back to scope-derived list for manual estimates
        ...((() => {
          const sl = draftShoppingList ?? buildManualShoppingList(priceBookItems, scopeResults);
          return sl ? { shopping_list_json: sl } : {};
        })()),
        ...(draftSpecifiedMaterials.length > 0 ? { specified_materials_json: draftSpecifiedMaterials } : {}),
        ...(paintingMode === "room_by_room" && roomSpecs.length > 0 ? { room_specs: roomSpecs } : {}),
        trip_count: tripCount,
        requires_drying_or_curing: requiresDryingOrCuring,
        difficult_access: difficultAccess,
        old_house_risk: oldHouseRisk,
        coordination_required: coordinationRequired,
        finish_expectation: finishExpectation,
        // When a travel recommendation will be applied post-create as a separate line,
        // keep surcharge at 0 here to avoid double-counting before snapshot apply.
        travel_surcharge_cents:
          travelRecommendation?.accepted && travelRecommendation.charge_mode === "separate_line"
            ? 0
            : travelRecommendation?.accepted && travelRecommendation.charge_mode === "waive"
              ? 0
              : parseCents(travelSurcharge),
        risk_adjustment_cents: parseCents(riskAdjustment),
        minimum_service_override_reason: minimumOverrideReason || null,
        minimum_service_override_note: minimumOverrideNote.trim() || null,
        scope_assumptions: scopeAssumptions.trim() || null,
        deposit_required: depositRequired,
        deposit_type: depositRequired ? depositType : "none",
        deposit_percentage: depositRequired && depositType === "percentage" ? parseFloat(depositPercentage) || 0 : null,
        deposit_fixed_cents: depositRequired && depositType === "fixed" ? parseCents(depositFixedDollars) : null,
        deposit_due_trigger: depositDueTrigger,
        terms_scope_accepted: termsScopeAccepted,
        terms_payment_accepted: termsPaymentAccepted,
        terms_change_order_accepted: termsChangeOrderAccepted,
      });

      if (baseEngineSpec) {
        const adjustments: NonNullable<EstimateSpec["adjustments"]> = [];
        if (parseCents(travelSurcharge) > 0) {
          adjustments.push({ id: "adj-travel", type: "trip_fee", label: "Travel surcharge", amountCents: parseCents(travelSurcharge) });
        }
        if (parseCents(riskAdjustment) > 0) {
          adjustments.push({ id: "adj-risk", type: "surcharge", label: "Risk adjustment", amountCents: parseCents(riskAdjustment) });
        }
        const fullSpec: EstimateSpec = {
          ...baseEngineSpec,
          tripCount,
          requiresDryingOrCuring,
          difficultAccess,
          oldHouseRisk,
          coordinationRequired,
          finishExpectation,
          ...(adjustments.length > 0 ? { adjustments } : {}),
          ...(minimumOverrideReason ? {
            overrides: [{ rule: "minimum_service_fee", reason: minimumOverrideReason, approvedBy: "owner", approvedAt: new Date().toISOString() }],
          } : {}),
        };
        payload.engine_spec = fullSpec;
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

      // Persist full travel snapshot + line item (rates frozen at create time)
      if (travelRecommendation?.accepted) {
        const { applyTravelRecommendationToEstimate } = await import(
          "@/components/travel/TravelRecommendation"
        );
        const applied = await applyTravelRecommendationToEstimate(id, travelRecommendation);
        if (!applied.ok) {
          // Estimate exists; surface travel failure but still navigate
          setError(applied.error ?? "Estimate created but travel could not be applied.");
        }
      }

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

  return {
    // UI state
    pending, error, step, setStep,
    assessmentContext,
    inlineForm, setInlineForm,
    // Entity lists
    clientList, jobList, propertyList,
    filteredJobs, filteredProperties,
    selectedClient, selectedJob, selectedProperty,
    // Shared fields
    serviceType, setServiceType,
    clientId, setClientId,
    jobId, setJobId,
    propertyId, setPropertyId,
    expiresAt, setExpiresAt,
    notes, setNotes,
    taxRate, setTaxRate,
    sendImmediately, setSendImmediately,
    depositRequired, setDepositRequired,
    depositType, setDepositType,
    depositPercentage, setDepositPercentage,
    depositFixedDollars, setDepositFixedDollars,
    depositDueTrigger, setDepositDueTrigger,
    termsScopeAccepted, setTermsScopeAccepted,
    termsPaymentAccepted, setTermsPaymentAccepted,
    termsChangeOrderAccepted, setTermsChangeOrderAccepted,
    // Painting fields
    sqFt, setSqFt,
    prepLevel, setPrepLevel,
    includesTrim, setIncludesTrim,
    includesCeiling, setIncludesCeiling,
    materialCostDollars, setMaterialCostDollars,
    laborHours, setLaborHours,
    // Generic fields
    mode,
    lineItems,
    flatRate, setFlatRate,
    tiers,
    // Guardrails
    tripCount, setTripCount,
    requiresDryingOrCuring, setRequiresDryingOrCuring,
    difficultAccess, setDifficultAccess,
    oldHouseRisk, setOldHouseRisk,
    coordinationRequired, setCoordinationRequired,
    finishExpectation, setFinishExpectation,
    travelSurcharge, setTravelSurcharge,
    travelRecommendation, setTravelRecommendation,
    riskAdjustment, setRiskAdjustment,
    minimumOverrideReason, setMinimumOverrideReason,
    minimumOverrideNote, setMinimumOverrideNote,
    scopeAssumptions, setScopeAssumptions,
    // Price book
    priceBookItems, scopeResults,
    priceBookLineItems, scopeMaterialsTotalCents,
    pendingDraftScope,
    draftShoppingList,
    draftSpecifiedMaterials,
    roomShoppingList,
    liveIntel,
    paintingMode, setPaintingMode,
    roomSpecs, projectOptions,
    handleRoomByRoomChange,
    // Pricing (from useEstimatePricing)
    ...pricing,
    // Material tracking
    addedMaterials,
    // AI (from useEstimateAI)
    ...ai,
    // Handlers
    handleAddPriceBookItem,
    handleScopeChange,
    removePriceBookItem,
    handleClientCreated,
    handleJobCreated,
    handlePropertyCreated,
    handleModeChange,
    addLineItem, addBulkLineItems, removeLineItem, updateLineItem,
    updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem, tierSubtotalCents,
    handleAddMaterial,
    advanceStep, goBack,
    handleSubmit,
  };
}
