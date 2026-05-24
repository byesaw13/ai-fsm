"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { PriceBookService } from "@/components/PriceBookSelector";
import type { ScopeBuilderResult } from "@/components/ScopeBuilder";
import { formatCents, getStandardEstimateTerms } from "@/lib/estimates/pricing";
import {
  JOB_TYPE_MATERIALS,
  computeEstimate,
  CURRENT_RULES,
  ENGINE_VERSION,
  type MaterialSuggestion,
  type EstimateSpec,
  type PrepLevel,
  DEPOSIT_RATE,
} from "@ai-fsm/domain";
import type { DraftEstimate } from "@/lib/estimates/ai-draft";

// ---------------------------------------------------------------------------
// Types (exported for use by the component and sub-components)
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

export interface LineItemRow {
  description: string;
  quantity: string;
  unit_price: string;
  price_book_id?: string;
}

export interface OptionTier {
  label: string;
  description: string;
  is_recommended: boolean;
  line_items: LineItemRow[];
}

export interface EditableSuggestion {
  code: string;
  price_book_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  reason: string;
  accepted: boolean;
  labor_hours_typical: number | null;
  legal_flag: "gray" | "restricted" | null;
}

export interface ParsedScope {
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

export interface ScopeResult {
  parsed: ParsedScope;
  estimate_preview: Record<string, string> | null;
}

export interface NewEstimateFormProps {
  clients: Client[];
  jobs: Job[];
  properties: Property[];
  initialClientId?: string;
  initialJobId?: string;
  initialPropertyId?: string;
  initialVaultItemId?: string;
  vaultItemContext?: { name: string; category: string; location: string | null } | null;
}

// ---------------------------------------------------------------------------
// Helpers (exported for use in JSX)
// ---------------------------------------------------------------------------

export function parseCents(dollars: string): number {
  const n = parseFloat(dollars);
  if (isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function lineTotal(row: LineItemRow): number {
  const qty = parseFloat(row.quantity);
  if (isNaN(qty) || qty <= 0) return 0;
  return Math.round(qty * parseCents(row.unit_price));
}

export const EMPTY_ROW: LineItemRow = { description: "", quantity: "1", unit_price: "0.00" };

export const PREP_LEVEL_LABELS: Record<number, string> = {
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

export const STEP_LABELS = ["Who & What", "Pricing", "Adjustments", "Review & Send"] as const;

export const DEFAULT_TIERS: OptionTier[] = [
  { label: "Good", description: "Essential services to get the job done", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Better", description: "Recommended upgrade with better materials", is_recommended: true, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Best", description: "Premium service with full coverage", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
];

export function mapPrepLevel(level: number): PrepLevel {
  if (level <= 3) return "none";
  if (level <= 5) return "minor";
  if (level <= 7) return "moderate";
  return "major";
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
}: NewEstimateFormProps) {
  const router = useRouter();
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
    vaultItemContext
      ? `Service for ${vaultItemContext.name}${vaultItemContext.location ? ` (${vaultItemContext.location})` : ""} — ${vaultItemContext.category}.`
      : ""
  );
  const [taxRate, setTaxRate] = useState("0");
  const [sendImmediately, setSendImmediately] = useState(false);

  const [sqFt, setSqFt] = useState("");
  const [prepLevel, setPrepLevel] = useState(5);
  const [includesTrim, setIncludesTrim] = useState(true);
  const [includesCeiling, setIncludesCeiling] = useState(false);
  const [materialCostDollars, setMaterialCostDollars] = useState("");
  const [laborHours, setLaborHours] = useState("");

  const [scopeNotes, setScopeNotes] = useState("");
  const [scopeParsing, setScopeParsing] = useState(false);
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [resolvedJobType, setResolvedJobType] = useState<string>("");
  const [addedMaterials, setAddedMaterials] = useState<Set<string>>(new Set());

  const [itemDescription, setItemDescription] = useState("");
  const [itemSuggesting, setItemSuggesting] = useState(false);
  const [itemSuggestError, setItemSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);

  const [mode, setMode] = useState<"itemized" | "flat_rate" | "multi_option">("itemized");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([{ ...EMPTY_ROW }]);
  const [flatRate, setFlatRate] = useState("0.00");

  const [tiers, setTiers] = useState<OptionTier[]>(() =>
    DEFAULT_TIERS.map((t) => ({ ...t, line_items: [{ ...EMPTY_ROW }] }))
  );

  const [tripCount, setTripCount] = useState<"one_trip" | "multi_trip">("one_trip");
  const [requiresDryingOrCuring, setRequiresDryingOrCuring] = useState(false);
  const [difficultAccess, setDifficultAccess] = useState(false);
  const [oldHouseRisk, setOldHouseRisk] = useState(false);
  const [coordinationRequired, setCoordinationRequired] = useState(false);
  const [finishExpectation, setFinishExpectation] = useState<"basic" | "clean" | "premium">("clean");
  const [travelSurcharge, setTravelSurcharge] = useState("0.00");
  const [riskAdjustment, setRiskAdjustment] = useState("0.00");
  const [minimumOverrideReason, setMinimumOverrideReason] = useState("");
  const [minimumOverrideNote, setMinimumOverrideNote] = useState("");

  const [priceBookItems, setPriceBookItems] = useState<
    { service: PriceBookService; priceCents: number; instanceId: string }[]
  >([]);
  const [scopeResults, setScopeResults] = useState<Record<string, ScopeBuilderResult>>({});

  const [aiDraftMode, setAiDraftMode] = useState<"idle" | "input" | "loading" | "applied">("idle");
  const [aiDescription, setAiDescription] = useState<string>("");
  const [aiConfidenceNotes, setAiConfidenceNotes] = useState<string>("");
  const [aiConfidenceDismissed, setAiConfidenceDismissed] = useState<boolean>(false);
  const [pendingDraftScope, setPendingDraftScope] = useState<
    Record<string, { scopeValues: Record<string, number | string>; complexityFactors: string[] }>
  >({});

  function handleAddPriceBookItem(service: PriceBookService, priceCents: number) {
    const instanceId = `${service.id}-${Date.now()}`;
    setPriceBookItems((prev) => [...prev, { service, priceCents, instanceId }]);
    const unitPrice = service.default_price_cents ?? priceCents;
    const description = `${service.code} — ${service.name}${service.description ? ` — ${service.description}` : ""}`;
    setLineItems((prev) => [
      ...prev.filter((r) => r.description.trim()),
      { description, quantity: "1", unit_price: (unitPrice / 100).toFixed(2), price_book_id: service.id },
    ]);
  }

  function handleScopeChange(instanceId: string, result: ScopeBuilderResult) {
    setScopeResults((prev) => ({ ...prev, [instanceId]: result }));
  }

  function removePriceBookItem(instanceId: string) {
    setPriceBookItems((prev) => prev.filter((item) => item.instanceId !== instanceId));
    setScopeResults((prev) => {
      const next = { ...prev };
      delete next[instanceId];
      return next;
    });
  }

  async function applyDraft() {
    if (!aiDescription.trim()) return;
    setAiDraftMode("loading");
    try {
      const res = await fetch("/api/v1/estimates/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescription, job_id: jobId || undefined }),
      });
      const { draft }: { draft: DraftEstimate | null } = await res.json();
      if (!draft || draft.services.length === 0) {
        setAiDraftMode("input");
        return;
      }

      setPriceBookItems([]);
      setScopeResults({});

      const newItems: { service: PriceBookService; priceCents: number; instanceId: string }[] = [];
      const newLineItems: LineItemRow[] = [];
      const scopeMap: Record<string, { scopeValues: Record<string, number | string>; complexityFactors: string[] }> = {};

      for (const svc of draft.services) {
        const instanceId = `${svc.service_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const service: PriceBookService = {
          id: svc.service_id,
          code: svc.service_code,
          name: svc.service_name,
          category: svc.service_category,
          tier: "core",
          default_price_cents: svc.base_price_cents,
          price_min_cents: svc.base_price_cents,
          price_max_cents: null,
          add_on_price_cents: null,
          unit_type: null,
          description: null,
          notes: null,
          default_labor_hours: null,
          requires_materials: false,
          upsell_codes: [],
          is_active: true,
        };
        newItems.push({ service, priceCents: svc.base_price_cents, instanceId });
        newLineItems.push({
          description: `${svc.service_code} — ${svc.service_name}`,
          quantity: "1",
          unit_price: (svc.base_price_cents / 100).toFixed(2),
          price_book_id: svc.service_id,
        });
        scopeMap[instanceId] = {
          scopeValues: svc.scope_values,
          complexityFactors: svc.complexity_factor_keys,
        };
      }

      setPriceBookItems(newItems);
      setLineItems((prev) => {
        const manual = prev.filter((r) => r.description.trim() && !r.price_book_id);
        return [...newLineItems, ...manual];
      });
      setPendingDraftScope(scopeMap);

      if (draft.notes) setNotes(draft.notes);
      setTripCount(draft.guardrails.trip_count);
      setDifficultAccess(draft.guardrails.difficult_access);
      setOldHouseRisk(draft.guardrails.old_house_risk);
      setRequiresDryingOrCuring(draft.guardrails.requires_drying_or_curing);
      setCoordinationRequired(draft.guardrails.coordination_required);
      setFinishExpectation(draft.guardrails.finish_expectation);

      setAiConfidenceNotes(draft.confidence_notes);
      setAiConfidenceDismissed(false);
      setAiDraftMode("applied");
    } catch {
      setAiDraftMode("input");
    }
  }

  const priceBookLineItems = useMemo(
    () =>
      priceBookItems.map((item, i) => ({
        description: `${item.service.code} — ${item.service.name}`,
        quantity: 1,
        unit_price_cents: scopeResults[item.instanceId]?.adjustedPriceCents ?? item.priceCents,
        sort_order: i,
        price_book_id: item.service.id,
        price_book_code: item.service.code,
      })),
    [priceBookItems, scopeResults]
  );

  const scopeMaterialsTotalCents = useMemo(
    () => priceBookItems.reduce((sum, item) => sum + (scopeResults[item.instanceId]?.materialTotalCents ?? 0), 0),
    [priceBookItems, scopeResults]
  );

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

  const scopeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!scopeNotes.trim() || scopeParsing || pending) return;
    if (scopeDebounceRef.current) clearTimeout(scopeDebounceRef.current);
    scopeDebounceRef.current = setTimeout(() => {
      void handleParseScope();
    }, 1500);
    return () => {
      if (scopeDebounceRef.current) clearTimeout(scopeDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeNotes]);

  const itemDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!itemDescription.trim() || itemSuggesting || pending) return;
    if (itemDebounceRef.current) clearTimeout(itemDebounceRef.current);
    itemDebounceRef.current = setTimeout(() => {
      void handleSuggestItems();
    }, 2000);
    return () => {
      if (itemDebounceRef.current) clearTimeout(itemDebounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemDescription]);

  function handleAddSuggestion(index: number) {
    const s = suggestions[index];
    if (!s) return;
    setLineItems((prev) => [
      ...prev.filter((r) => r.description.trim()),
      {
        description: `${s.code} — ${s.name}`,
        quantity: s.quantity.toString(),
        unit_price: (s.unit_price_cents / 100).toFixed(2),
      },
    ]);
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSkipSuggestion(index: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  const bundleCategories = useMemo(() => {
    const prefixes = new Set(suggestions.map((s) => s.code.split("-")[0]).filter(Boolean));
    return prefixes.size;
  }, [suggestions]);

  const hasLegalFlagSuggestions = useMemo(
    () => suggestions.some((s) => s.legal_flag !== null),
    [suggestions]
  );

  const paintingResult = useMemo(() => {
    if (serviceType !== "painting") return null;
    const sq = parseFloat(sqFt);
    if (isNaN(sq) || sq <= 0) return null;
    const prep = mapPrepLevel(prepLevel);
    const matCents = parseCents(materialCostDollars);
    const surfaces = [
      { type: "walls" as const, sqft: sq, condition: "good" as const, prep, prime: false, textureMatch: false },
      ...(includesCeiling ? [{ type: "ceiling" as const, sqft: Math.round(sq * 0.35), condition: "good" as const, prep, prime: false, textureMatch: false }] : []),
      ...(includesTrim ? [{ type: "trim" as const, linearFt: Math.round(sq / 8), condition: "good" as const, prep, prime: false, textureMatch: false }] : []),
    ];
    const spec: EstimateSpec = {
      engineVersion: ENGINE_VERSION,
      type: "painting",
      paintQuality: "standard",
      rooms: [{ id: "r1", name: "Main area", coats: 2, surfaces }],
    };
    if (matCents > 0) {
      spec.lineItems = [{
        id: "mat-user",
        description: "Materials & supplies",
        quantity: 1,
        unit: "flat",
        unitLaborCents: 0,
        materialCents: matCents,
      }];
    }
    const r = computeEstimate(spec, CURRENT_RULES);
    return {
      labor_flat_rate_cents: r.summary.laborCents,
      material_cents: r.summary.materialCents,
      material_handling_cents: r.summary.handlingCents,
      total_cents: r.summary.totalCents,
      deposit_cents: r.summary.depositCents,
      balance_cents: r.summary.balanceDueCents,
      internal_labor_cost_cents: r.internalSummary.estimatedCostCents,
      gross_margin_pct: Math.round(r.internalSummary.grossMarginPct * 100),
      gross_margin_cents: r.internalSummary.grossMarginCents,
      effective_sq_ft_rate_cents: sq > 0 ? Math.round(r.summary.laborCents / sq) : 0,
      _spec: spec,
    };
  }, [serviceType, sqFt, prepLevel, includesTrim, includesCeiling, materialCostDollars]);

  const taxRateNum = parseFloat(taxRate) || 0;

  const materialLineItems = lineItems.filter((row) =>
    row.description.toLowerCase().includes("material")
  );
  const materialSubtotalCents =
    materialLineItems.reduce((sum, row) => sum + lineTotal(row), 0) + scopeMaterialsTotalCents;
  const materialHandlingCents = Math.round(materialSubtotalCents * 0.15);

  const genericSubtotalCents =
    mode === "flat_rate"
      ? parseCents(flatRate)
      : lineItems.reduce((sum, row) => sum + lineTotal(row), 0) +
        scopeMaterialsTotalCents +
        materialHandlingCents;
  const guardrailAdjustmentCents = parseCents(travelSurcharge) + parseCents(riskAdjustment);
  const adjustedGenericSubtotalCents = genericSubtotalCents + guardrailAdjustmentCents;
  const genericTaxCents = Math.round((adjustedGenericSubtotalCents * taxRateNum) / 100);
  const genericTotalCents = adjustedGenericSubtotalCents + genericTaxCents;
  const depositCents = Math.round(genericTotalCents * 0.30);
  const balanceDueCents = genericTotalCents - depositCents;

  function handleModeChange(newMode: "itemized" | "flat_rate" | "multi_option") {
    if (newMode === "flat_rate") {
      const current = lineItems.reduce((sum, row) => sum + lineTotal(row), 0);
      setFlatRate((current / 100).toFixed(2));
    } else if (newMode === "itemized") {
      if (lineItems.length === 0) setLineItems([{ ...EMPTY_ROW }]);
    } else if (newMode === "multi_option") {
      setTiers(DEFAULT_TIERS.map((t) => ({ ...t, line_items: [{ ...EMPTY_ROW }] })));
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

  function updateTier(tierIndex: number, updates: Partial<OptionTier>) {
    setTiers((prev) =>
      prev.map((t, i) => (i === tierIndex ? { ...t, ...updates } : t))
    );
  }

  function addTierLineItem(tierIndex: number) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex ? { ...t, line_items: [...t.line_items, { ...EMPTY_ROW }] } : t
      )
    );
  }

  function removeTierLineItem(tierIndex: number, lineIndex: number) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex
          ? { ...t, line_items: t.line_items.filter((_, li) => li !== lineIndex) }
          : t
      )
    );
  }

  function updateTierLineItem(tierIndex: number, lineIndex: number, field: keyof LineItemRow, value: string) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIndex
          ? {
              ...t,
              line_items: t.line_items.map((row, li) =>
                li === lineIndex ? { ...row, [field]: value } : row
              ),
            }
          : t
      )
    );
  }

  function tierSubtotalCents(tier: OptionTier): number {
    return tier.line_items.reduce((sum, row) => sum + lineTotal(row), 0);
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
      else if (parsed.suggested_job_type && JOB_TYPE_MATERIALS[parsed.suggested_job_type]) {
        setResolvedJobType(parsed.suggested_job_type);
      }
    } catch {
      setScopeError("Network error — could not parse notes.");
    } finally {
      setScopeParsing(false);
    }
  }

  async function handleSuggestItems() {
    setItemSuggesting(true);
    setItemSuggestError(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/v1/estimates/ai-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: itemDescription }),
      });
      const json = await res.json() as { suggestions?: unknown[]; error?: { message?: string } };
      if (!res.ok) {
        setItemSuggestError(json.error?.message ?? "Failed to get suggestions.");
        return;
      }
      const raw = (json.suggestions ?? []) as Array<{
        code: string; price_book_id: string; name: string; description: string | null;
        quantity: number; unit_price_cents: number; reason: string;
        labor_hours_typical: number | null; legal_flag: "gray" | "restricted" | null;
      }>;
      setSuggestions(raw.map((s) => ({ ...s, accepted: true })));
    } catch {
      setItemSuggestError("Network error — could not get suggestions.");
    } finally {
      setItemSuggesting(false);
    }
  }

  function handleAcceptSuggestions() {
    const toAdd = suggestions.filter((s) => s.accepted);
    if (toAdd.length === 0) return;
    setLineItems((prev) => [
      ...prev.filter((r) => r.description.trim()),
      ...toAdd.map((s) => ({
        description: `${s.code} — ${s.name}`,
        quantity: s.quantity.toString(),
        unit_price: (s.unit_price_cents / 100).toFixed(2),
        price_book_id: s.price_book_id,
      })),
    ]);
    setSuggestions([]);
    setItemDescription("");
  }

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

  function reviewTotal(): string {
    if (serviceType === "painting" && paintingResult) {
      return formatCents(paintingResult.total_cents);
    }
    if (serviceType === "generic") {
      if (mode === "flat_rate") return formatCents(parseCents(flatRate));
      if (mode === "multi_option") {
        const maxTier = Math.max(...tiers.map(tierSubtotalCents));
        return maxTier > 0 ? `up to ${formatCents(maxTier)}` : "—";
      }
      return formatCents(genericTotalCents);
    }
    return "—";
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) return;
    if (!clientId) {
      setError("Please select a client.");
      return;
    }

    setPending(true);
    setError(null);

    try {
      let payload: Record<string, unknown>;
      let baseEngineSpec: EstimateSpec | null = null;

      if (serviceType === "painting") {
        if (!paintingResult) {
          setError("Enter the square footage to create a painting estimate.");
          setPending(false);
          return;
        }
        baseEngineSpec = paintingResult._spec;
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
        const manualItems = lineItems.filter((r) => r.description.trim() || parseCents(r.unit_price) > 0);
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
          materialLineItems.reduce((sum, row) => sum + lineTotal(row), 0) + scopeMaterialsTotalCents;
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
          ...(scopeMaterialsTotalCents > 0 ? { material_cost_cents: scopeMaterialsTotalCents } : {}),
          ...(scopeSnapshots.length > 0 ? { scope_snapshots: scopeSnapshots } : {}),
        };
      }

      Object.assign(payload, {
        ...(initialVaultItemId ? { vault_item_id: initialVaultItemId } : {}),
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
    taxRateNum,
    sendImmediately, setSendImmediately,
    // Painting fields
    sqFt, setSqFt,
    prepLevel, setPrepLevel,
    includesTrim, setIncludesTrim,
    includesCeiling, setIncludesCeiling,
    materialCostDollars, setMaterialCostDollars,
    laborHours, setLaborHours,
    // Scope parser
    scopeNotes, setScopeNotes,
    scopeParsing, scopeResult, scopeError,
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
    riskAdjustment, setRiskAdjustment,
    minimumOverrideReason, setMinimumOverrideReason,
    minimumOverrideNote, setMinimumOverrideNote,
    // Price book
    priceBookItems, scopeResults,
    priceBookLineItems, scopeMaterialsTotalCents,
    pendingDraftScope,
    // AI draft
    aiDraftMode, setAiDraftMode,
    aiDescription, setAiDescription,
    aiConfidenceNotes, aiConfidenceDismissed, setAiConfidenceDismissed,
    // Item suggester
    itemDescription, setItemDescription,
    itemSuggesting, itemSuggestError,
    suggestions, setSuggestions,
    bundleCategories, hasLegalFlagSuggestions,
    // Computed totals
    paintingResult,
    materialLineItems, materialSubtotalCents, materialHandlingCents,
    genericSubtotalCents, guardrailAdjustmentCents,
    adjustedGenericSubtotalCents, genericTaxCents, genericTotalCents,
    depositCents, balanceDueCents,
    // Item state
    resolvedJobType, addedMaterials,
    // Handlers
    handleAddPriceBookItem,
    handleScopeChange,
    removePriceBookItem,
    applyDraft,
    handleClientCreated,
    handleJobCreated,
    handlePropertyCreated,
    handleAddSuggestion,
    handleSkipSuggestion,
    handleAcceptSuggestions,
    handleModeChange,
    addLineItem, removeLineItem, updateLineItem,
    updateTier, addTierLineItem, removeTierLineItem, updateTierLineItem,
    tierSubtotalCents,
    handleAddMaterial,
    advanceStep, goBack,
    reviewTotal,
    handleSubmit,
  };
}
