"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { JOB_TYPE_MATERIALS } from "@ai-fsm/domain";
import type { ShoppingList, SpecifiedMaterial } from "@ai-fsm/domain";
import type { PriceBookService } from "@/components/PriceBookSelector";
import type { DraftEstimate, DraftConfidence } from "@/lib/estimates/ai-draft";
import type { LineItemRow, OptionTier } from "@/lib/estimates/form-helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

export interface DraftPriceBookItem {
  service: PriceBookService;
  priceCents: number;
  instanceId: string;
}

export interface DraftScopeMap {
  [instanceId: string]: { scopeValues: Record<string, number | string>; complexityFactors: string[] };
}

interface UseEstimateAIParams {
  jobId: string;
  pending: boolean;
  // Callbacks to apply AI results to orchestration-layer state
  onScopeParsed: (parsed: ParsedScope) => void;
  onAddLineItems: (rows: LineItemRow[]) => void;
  onApplyDraft: (params: {
    priceBookItems: DraftPriceBookItem[];
    lineItems: LineItemRow[];
    scopeMap: DraftScopeMap;
    notes: string | null;
    guardrails: DraftEstimate["guardrails"];
    shoppingList: ShoppingList | null;
    specifiedMaterials: SpecifiedMaterial[];
  }) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useEstimateAI({
  jobId,
  pending,
  onScopeParsed,
  onAddLineItems,
  onApplyDraft,
}: UseEstimateAIParams) {
  const [scopeNotes, setScopeNotes] = useState("");
  const [scopeParsing, setScopeParsing] = useState(false);
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [resolvedJobType, setResolvedJobType] = useState<string>("");

  const [itemDescription, setItemDescription] = useState("");
  const [itemSuggesting, setItemSuggesting] = useState(false);
  const [itemSuggestError, setItemSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);

  const [aiDraftMode, setAiDraftMode] = useState<"idle" | "input" | "loading" | "review" | "applied">("idle");
  const [aiDescription, setAiDescription] = useState<string>("");
  const [aiConfidenceNotes, setAiConfidenceNotes] = useState<string>("");
  const [aiConfidenceDismissed, setAiConfidenceDismissed] = useState<boolean>(false);
  const [pendingDraft, setPendingDraft] = useState<DraftEstimate | null>(null);
  const [pendingShoppingList, setPendingShoppingList] = useState<ShoppingList | null>(null);

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

  const bundleCategories = useMemo(() => {
    const prefixes = new Set(suggestions.map((s) => s.code.split("-")[0]).filter(Boolean));
    return prefixes.size;
  }, [suggestions]);

  const hasLegalFlagSuggestions = useMemo(
    () => suggestions.some((s) => s.legal_flag !== null),
    [suggestions]
  );

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
      setScopeResult(json);
      const { parsed } = json;
      if (parsed.suggested_job_type && JOB_TYPE_MATERIALS[parsed.suggested_job_type]) {
        setResolvedJobType(parsed.suggested_job_type);
      }
      onScopeParsed(parsed);
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

  function handleAddSuggestion(index: number) {
    const s = suggestions[index];
    if (!s) return;
    onAddLineItems([{
      description: `${s.code} — ${s.name}`,
      quantity: s.quantity.toString(),
      unit_price: (s.unit_price_cents / 100).toFixed(2),
    }]);
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSkipSuggestion(index: number) {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }

  function handleAcceptSuggestions() {
    const toAdd = suggestions.filter((s) => s.accepted);
    if (toAdd.length === 0) return;
    onAddLineItems(toAdd.map((s) => ({
      description: `${s.code} — ${s.name}`,
      quantity: s.quantity.toString(),
      unit_price: (s.unit_price_cents / 100).toFixed(2),
      price_book_id: s.price_book_id,
    })));
    setSuggestions([]);
    setItemDescription("");
  }

  function _buildApplyParams(draft: DraftEstimate, shoppingList: ShoppingList | null): Parameters<typeof onApplyDraft>[0] {
    const priceBookItems: DraftPriceBookItem[] = [];
    const lineItems: LineItemRow[] = [];
    const scopeMap: DraftScopeMap = {};

    for (const svc of draft.services) {
      const instanceId = `${svc.service_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // Always pass base_price_cents to ScopeBuilder — it recomputes adjusted price
      // from the prefilled scope values + complexity factors. Passing adjusted_price_cents
      // would cause a second multiplication (e.g. base×sqft done twice for per_sqft services).
      const service: PriceBookService = {
        id: svc.service_id,
        code: svc.service_code,
        name: svc.service_name,
        category: svc.service_category,
        tier: "core",
        default_price_cents: svc.base_price_cents,
        price_min_cents: svc.base_price_cents,
        price_max_cents: null,
        add_on_price_cents: svc.add_on_price_cents ?? null,
        unit_type: svc.unit_type ?? "flat",
        description: null,
        notes: null,
        default_labor_hours: null,
        requires_materials: false,
        upsell_codes: [],
        is_active: true,
      };
      priceBookItems.push({ service, priceCents: svc.base_price_cents, instanceId });
      // price_book_id tags this so handleSubmit excludes it from manualItems
      // (priceBookLineItems handles the actual submission price via ScopeBuilder)
      lineItems.push({
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

    // Add specified materials (products named in description) as material line items.
    // No price_book_id → goes through manualItems → included in estimate total.
    // The customer sees the material cost; the shopping list tells us exactly what to order.
    for (const mat of draft.specified_materials ?? []) {
      if (!mat.unit_cost_cents) continue;
      const totalCents = mat.units_to_order * mat.unit_cost_cents;
      lineItems.push({
        description: `Materials — ${mat.name} (${mat.units_to_order} ${mat.unit_label}${mat.units_to_order !== 1 ? "s" : ""})`,
        quantity: "1",
        unit_price: (totalCents / 100).toFixed(2),
      });
    }

    return {
      priceBookItems,
      lineItems,
      scopeMap,
      notes: draft.notes ?? null,
      guardrails: draft.guardrails,
      shoppingList,
      specifiedMaterials: draft.specified_materials ?? [],
    };
  }

  async function fetchDraft() {
    if (!aiDescription.trim()) return;
    setAiDraftMode("loading");
    try {
      const res = await fetch("/api/v1/estimates/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: aiDescription, job_id: jobId || undefined }),
      });
      const json = await res.json() as { draft: DraftEstimate | null; shopping_list?: ShoppingList | null };
      const { draft } = json;
      if (!draft || draft.services.length === 0) {
        setAiDraftMode("input");
        return;
      }

      setAiConfidenceNotes(draft.confidence_notes);
      setAiConfidenceDismissed(false);
      setPendingShoppingList(json.shopping_list ?? null);

      // Always show review panel — high-confidence drafts go straight through only if
      // there are NO estimated measurements requiring confirmation
      const needsReview = draft.confidence !== "high" || (draft.estimated_measurements?.length ?? 0) > 0;
      if (!needsReview) {
        onApplyDraft(_buildApplyParams(draft, json.shopping_list ?? null));
        setAiDraftMode("applied");
      } else {
        setPendingDraft(draft);
        setAiDraftMode("review");
      }
    } catch {
      setAiDraftMode("input");
    }
  }

  function applyPendingDraft() {
    if (!pendingDraft) return;
    onApplyDraft(_buildApplyParams(pendingDraft, pendingShoppingList));
    setAiDraftMode("applied");
    setPendingDraft(null);
    setPendingShoppingList(null);
  }

  function discardPendingDraft() {
    setPendingDraft(null);
    setAiDraftMode("input");
  }

  /** Called from useEstimateForm when an interview draft is applied on mount */
  function applyPendingDraftFromExternal(draft: DraftEstimate, shoppingList: ShoppingList | null) {
    onApplyDraft(_buildApplyParams(draft, shoppingList));
    setAiDraftMode("applied");
  }

  // Keep backward-compat alias so existing callers don't break during migration
  const applyDraft = fetchDraft;

  return {
    scopeNotes, setScopeNotes,
    scopeParsing, scopeResult, scopeError,
    resolvedJobType,
    itemDescription, setItemDescription,
    itemSuggesting, itemSuggestError,
    suggestions, setSuggestions,
    bundleCategories, hasLegalFlagSuggestions,
    aiDraftMode, setAiDraftMode,
    aiDescription, setAiDescription,
    aiConfidenceNotes, aiConfidenceDismissed, setAiConfidenceDismissed,
    pendingDraft,
    pendingShoppingList,
    handleParseScope,
    handleSuggestItems,
    handleAddSuggestion,
    handleSkipSuggestion,
    handleAcceptSuggestions,
    applyDraft,
    fetchDraft,
    applyPendingDraft,
    discardPendingDraft,
    applyPendingDraftFromExternal,
  };
}
