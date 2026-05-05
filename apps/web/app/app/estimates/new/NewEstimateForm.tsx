"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
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
import { PriceBookSelector, type PriceBookService } from "@/components/PriceBookSelector";
import {
  calculatePaintingEstimate,
  formatCents,
  getStandardEstimateTerms,
} from "@/lib/estimates/pricing";
import {
  PAINTING_RATE_STANDARD_CENTS,
  PREP_LEVEL_MULTIPLIERS,
  JOB_TYPE_MATERIALS,
  getMaterialsByCategory,
  type MaterialSuggestion,
} from "@ai-fsm/domain";
import { InlineClientForm } from "./InlineClientForm";
import { InlineJobForm } from "./InlineJobForm";
import { InlinePropertyForm } from "./InlinePropertyForm";

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

interface OptionTier {
  label: string;
  description: string;
  is_recommended: boolean;
  line_items: LineItemRow[];
}

const DEFAULT_TIERS: OptionTier[] = [
  { label: "Good", description: "Essential services to get the job done", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Better", description: "Recommended upgrade with better materials", is_recommended: true, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
  { label: "Best", description: "Premium service with full coverage", is_recommended: false, line_items: [{ description: "", quantity: "1", unit_price: "0.00" }] },
];

interface EditableSuggestion {
  code: string;
  price_book_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  reason: string;
  accepted: boolean;
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

  // Mutable entity lists — new entities added inline are appended here
  const [clientList, setClientList] = useState<Client[]>(clients);
  const [jobList, setJobList] = useState<Job[]>(jobs);
  const [propertyList, setPropertyList] = useState<Property[]>(properties);

  // Which inline quick-create form is open (at most one at a time)
  const [inlineForm, setInlineForm] = useState<"client" | "job" | "property" | null>(null);

  // Service type: painting vs generic
  const [serviceType, setServiceType] = useState<"painting" | "generic">("painting");

  // Shared fields
  const [clientId, setClientId] = useState(
    initialClientId && clientList.some((c) => c.id === initialClientId)
      ? initialClientId
      : ""
  );
  const [jobId, setJobId] = useState(
    initialJobId && jobList.some((j) => j.id === initialJobId) ? initialJobId : ""
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

  // Scope parser (painting)
  const [scopeNotes, setScopeNotes] = useState("");
  const [scopeParsing, setScopeParsing] = useState(false);
  const [scopeResult, setScopeResult] = useState<ScopeResult | null>(null);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [resolvedJobType, setResolvedJobType] = useState<string>("");
  const [addedMaterials, setAddedMaterials] = useState<Set<string>>(new Set());

  // Item suggester (generic mode)
  const [itemDescription, setItemDescription] = useState("");
  const [itemSuggesting, setItemSuggesting] = useState(false);
  const [itemSuggestError, setItemSuggestError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<EditableSuggestion[]>([]);

  // Generic fields
  const [mode, setMode] = useState<"itemized" | "flat_rate" | "multi_option">("itemized");
  const [lineItems, setLineItems] = useState<LineItemRow[]>([{ ...EMPTY_ROW }]);
  const [flatRate, setFlatRate] = useState("0.00");

  // Multi-option tiers (Good/Better/Best)
  const [tiers, setTiers] = useState<OptionTier[]>(() => DEFAULT_TIERS.map(t => ({ ...t, line_items: [{ ...EMPTY_ROW }] })));

  // Pricing guardrails
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

  // Price book line items
  const [priceBookItems, setPriceBookItems] = useState<{ service: PriceBookService; priceCents: number }[]>([]);

  function handleAddPriceBookItem(service: PriceBookService, priceCents: number) {
    setPriceBookItems((prev) => [...prev, { service, priceCents }]);

    // Auto-fill generic line items with price book data
    // Use default_price_cents if available, otherwise use provided priceCents
    const unitPrice = service.default_price_cents ?? priceCents;
    const description = `${service.code} — ${service.name}${service.description ? ` — ${service.description}` : ""}`;

    setLineItems((prev) => [
      ...prev.filter((r) => r.description.trim()),
      { description, quantity: "1", unit_price: (unitPrice / 100).toFixed(2) },
    ]);
  }

  function removePriceBookItem(index: number) {
    setPriceBookItems((prev) => prev.filter((_, i) => i !== index));
  }

  const priceBookLineItems = useMemo(
    () =>
      priceBookItems.map((item, i) => ({
        description: `${item.service.code} — ${item.service.name}`,
        quantity: 1,
        unit_price_cents: item.priceCents,
        sort_order: i,
      })),
    [priceBookItems]
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

  // Calculate material handling (15% of material line items)
  // For now, treat all line items as labor unless they contain "material" in description
  const materialLineItems = lineItems.filter((row) =>
    row.description.toLowerCase().includes("material")
  );
  const materialSubtotalCents = materialLineItems.reduce((sum, row) => sum + lineTotal(row), 0);
  const materialHandlingCents = Math.round(materialSubtotalCents * 0.15);

  const genericSubtotalCents =
    mode === "flat_rate"
      ? parseCents(flatRate)
      : lineItems.reduce((sum, row) => sum + lineTotal(row), 0) + materialHandlingCents;
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
      setTiers(DEFAULT_TIERS.map(t => ({ ...t, line_items: [{ ...EMPTY_ROW }] })));
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

  // Multi-option tier helpers
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
      })),
    ]);
    setSuggestions([]);
    setItemDescription("");
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
        const allItems = [...priceBookLineItems, ...manualItems.map((row, i) => ({
          description: row.description,
          quantity: parseFloat(row.quantity) || 1,
          unit_price_cents: parseCents(row.unit_price),
          sort_order: priceBookLineItems.length + i,
        }))];
        if (allItems.length === 0) {
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
          line_items: allItems,
        };
      }

      Object.assign(payload, {
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

      {/* Price Book Quick Add — only in generic itemized mode */}
      {serviceType === "generic" && mode === "itemized" && (
        <div>
          <SectionHeader title="Quick Add from Price Book" as="h3" />
          <PriceBookSelector onAddToEstimate={handleAddPriceBookItem} />

          {priceBookItems.length > 0 && (
            <div style={{ marginTop: "var(--space-3)" }}>
              <p style={{ fontSize: "var(--text-sm)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
                Selected Services ({priceBookItems.length})
              </p>
              {priceBookItems.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "var(--space-1) var(--space-2)",
                    background: "var(--bg-subtle)",
                    borderRadius: "var(--radius)",
                    marginBottom: "var(--space-1)",
                    fontSize: "var(--text-sm)",
                  }}
                >
                  <div>
                    <span style={{ fontFamily: "monospace", fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                      {item.service.code}
                    </span>{" "}
                    <span>{item.service.name}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                    <span style={{ fontWeight: 600 }}>{formatCents(item.priceCents)}</span>
                    <button
                      type="button"
                      onClick={() => removePriceBookItem(i)}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--color-danger)",
                        fontSize: "var(--text-sm)",
                        padding: 0,
                        lineHeight: 1,
                      }}
                      aria-label={`Remove ${item.service.name}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Details */}
      <div className="p7-form-grid p7-form-grid-2">
        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <Select
                id="client_id"
                label="Client"
                required
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setJobId("");
                  setPropertyId("");
                  setInlineForm(null);
                }}
                disabled={pending}
                options={clientList.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="Select a client"
              />
            </div>
            <button
              type="button"
              className="p7-btn p7-btn-secondary p7-btn-sm"
              onClick={() => setInlineForm(inlineForm === "client" ? null : "client")}
              disabled={pending}
              style={{ flexShrink: 0, marginBottom: "1px" }}
            >
              + New
            </button>
          </div>
          {inlineForm === "client" && (
            <InlineClientForm
              onCreated={handleClientCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
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
            </div>
            {clientId && (
              <button
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                onClick={() => setInlineForm(inlineForm === "job" ? null : "job")}
                disabled={pending}
                style={{ flexShrink: 0, marginBottom: "1px" }}
              >
                + New
              </button>
            )}
          </div>
          {inlineForm === "job" && clientId && (
            <InlineJobForm
              clientId={clientId}
              onCreated={handleJobCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

        <div>
          <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
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
            </div>
            {clientId && (
              <button
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                onClick={() => setInlineForm(inlineForm === "property" ? null : "property")}
                disabled={pending}
                style={{ flexShrink: 0, marginBottom: "1px" }}
              >
                + New
              </button>
            )}
          </div>
          {inlineForm === "property" && clientId && (
            <InlinePropertyForm
              clientId={clientId}
              onCreated={handlePropertyCreated}
              onCancel={() => setInlineForm(null)}
            />
          )}
        </div>

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

      <div>
        <SectionHeader title="Pricing Guardrails" as="h3" />
        <div className="p7-form-grid p7-form-grid-2">
          <Select
            id="trip_count"
            label="Trip Count"
            value={tripCount}
            onChange={(e) => setTripCount(e.target.value as "one_trip" | "multi_trip")}
            disabled={pending}
            options={[
              { value: "one_trip", label: "One Trip" },
              { value: "multi_trip", label: "Multi-Trip" },
            ]}
          />
          <Select
            id="finish_expectation"
            label="Finish Expectation"
            value={finishExpectation}
            onChange={(e) => setFinishExpectation(e.target.value as "basic" | "clean" | "premium")}
            disabled={pending}
            options={[
              { value: "basic", label: "Basic" },
              { value: "clean", label: "Clean" },
              { value: "premium", label: "Premium" },
            ]}
          />
          <Input
            id="travel_surcharge"
            label="Travel Surcharge ($)"
            type="number"
            min="0"
            step="0.01"
            value={travelSurcharge}
            onChange={(e) => setTravelSurcharge(e.target.value)}
            disabled={pending}
          />
          <Input
            id="risk_adjustment"
            label="Risk / Return Adjustment ($)"
            type="number"
            min="0"
            step="0.01"
            value={riskAdjustment}
            onChange={(e) => setRiskAdjustment(e.target.value)}
            disabled={pending}
          />
          <Select
            id="minimum_override_reason"
            label="Minimum Override"
            value={minimumOverrideReason}
            onChange={(e) => setMinimumOverrideReason(e.target.value)}
            disabled={pending}
            placeholder="None"
            options={[
              { value: "bundled", label: "Bundled" },
              { value: "membership_included", label: "Membership Included" },
              { value: "promo", label: "Promotion" },
              { value: "owner_approved", label: "Owner Approved" },
            ]}
          />
          <Input
            id="minimum_override_note"
            label="Override Note"
            value={minimumOverrideNote}
            onChange={(e) => setMinimumOverrideNote(e.target.value)}
            disabled={pending}
            placeholder="Internal reason"
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-3)", marginTop: "var(--space-2)" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={requiresDryingOrCuring} onChange={(e) => setRequiresDryingOrCuring(e.target.checked)} disabled={pending} />
            <span>Drying/curing required</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={difficultAccess} onChange={(e) => setDifficultAccess(e.target.checked)} disabled={pending} />
            <span>Difficult access</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={oldHouseRisk} onChange={(e) => setOldHouseRisk(e.target.checked)} disabled={pending} />
            <span>Old-house risk</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
            <input type="checkbox" checked={coordinationRequired} onChange={(e) => setCoordinationRequired(e.target.checked)} disabled={pending} />
            <span>Coordination required</span>
          </label>
        </div>
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
                {scopeResult.parsed.confidence < 60 && (
                  <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-warning)", fontWeight: 500 }}>
                    ⚠ Low confidence — review all fields carefully before submitting.
                  </p>
                )}
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

      {/* Suggested Materials — shown when scope parser resolves a job type */}
      {serviceType === "generic" && mode === "itemized" && resolvedJobType && Object.keys(getMaterialsByCategory(resolvedJobType)).length > 0 && (
        <div>
          <SectionHeader title={`Suggested Materials — ${resolvedJobType.replace("_", " ")}`} as="h3" />
          <Card padding="sm" style={{ background: "var(--bg-subtle)" }}>
            {Object.entries(getMaterialsByCategory(resolvedJobType)).map(([category, materials]) => (
              <div key={category} style={{ marginBottom: "var(--space-3)" }}>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 500, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-1)" }}>
                  {category}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                  {materials.map((mat) => {
                    const key = mat.name.toLowerCase();
                    const alreadyAdded = addedMaterials.has(key) || lineItems.some((r) => r.description.toLowerCase().includes(key));
                    return (
                      <button
                        key={mat.name}
                        type="button"
                        disabled={alreadyAdded}
                        onClick={() => handleAddMaterial(mat)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "var(--space-1)",
                          padding: "var(--space-1) var(--space-2)",
                          fontSize: "var(--text-sm)",
                          background: alreadyAdded ? "var(--color-surface-raised)" : "var(--color-surface-overlay)",
                          border: `1px solid ${alreadyAdded ? "var(--color-border)" : "var(--color-primary-alpha)"}`,
                          borderRadius: "var(--radius-sm)",
                          cursor: alreadyAdded ? "default" : "pointer",
                          color: alreadyAdded ? "var(--fg-muted)" : "var(--fg-primary)",
                        }}
                      >
                        <span>{mat.name}</span>
                        <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>
                          {mat.typicalQty} {mat.unit}
                        </span>
                        {alreadyAdded ? (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-success)" }}>✓</span>
                        ) : (
                          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-primary)" }}>+</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", margin: "var(--space-2) 0 0" }}>
              Click to add as a line item. Set prices before submitting.
            </p>
          </Card>
        </div>
      )}

      {/* Generic Pricing */}
      {serviceType === "generic" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-3)" }}>
            <SectionHeader
              title={mode === "flat_rate" ? "Flat Rate" : mode === "multi_option" ? "Good / Better / Best" : "Line Items"}
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
              {(["itemized", "flat_rate", "multi_option"] as const).map((m) => (
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
                  {m === "itemized" ? "Itemized" : m === "flat_rate" ? "Flat Rate" : "Multi-Option"}
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
          ) : mode === "multi_option" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--space-4)", marginBottom: "var(--space-3)" }}>
              {tiers.map((tier, ti) => {
                const tierSub = tierSubtotalCents(tier);
                const tierTax = Math.round((tierSub * taxRateNum) / 100);
                const tierTotal = tierSub + tierTax;
                return (
                  <Card key={ti} padding="sm" style={{
                    border: tier.is_recommended ? "2px solid var(--accent)" : "1px solid var(--border)",
                    position: "relative",
                  }}>
                    {tier.is_recommended && (
                      <div style={{
                        position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                        background: "var(--accent)", color: "#fff", padding: "2px 12px", borderRadius: 99,
                        fontSize: "var(--text-xs)", fontWeight: 600, whiteSpace: "nowrap",
                      }}>
                        Recommended
                      </div>
                    )}
                    <div style={{ marginBottom: "var(--space-2)" }}>
                      <input
                        className="p7-input"
                        type="text"
                        value={tier.label}
                        onChange={(e) => updateTier(ti, { label: e.target.value })}
                        placeholder="Option label"
                        disabled={pending}
                        style={{ fontWeight: 700, fontSize: "var(--text-lg)", marginBottom: "var(--space-1)" }}
                      />
                      <input
                        className="p7-input"
                        type="text"
                        value={tier.description}
                        onChange={(e) => updateTier(ti, { description: e.target.value })}
                        placeholder="Brief description"
                        disabled={pending}
                        style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}
                      />
                    </div>

                    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", cursor: "pointer", marginBottom: "var(--space-2)", fontSize: "var(--text-sm)" }}>
                      <input
                        type="checkbox"
                        checked={tier.is_recommended}
                        onChange={(e) => updateTier(ti, { is_recommended: e.target.checked })}
                        disabled={pending}
                      />
                      <span>Mark as recommended</span>
                    </label>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-2)" }}>
                      {tier.line_items.map((row, li) => (
                        <div key={li} style={{ marginBottom: "var(--space-2)" }}>
                          <input
                            className="p7-input"
                            type="text"
                            value={row.description}
                            onChange={(e) => updateTierLineItem(ti, li, "description", e.target.value)}
                            placeholder="Description"
                            disabled={pending}
                            style={{ marginBottom: "var(--space-1)", fontSize: "var(--text-sm)" }}
                          />
                          <div style={{ display: "flex", gap: "var(--space-2)" }}>
                            <input
                              className="p7-input"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={row.quantity}
                              onChange={(e) => updateTierLineItem(ti, li, "quantity", e.target.value)}
                              disabled={pending}
                              style={{ width: 60, fontSize: "var(--text-sm)" }}
                            />
                            <input
                              className="p7-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={row.unit_price}
                              onChange={(e) => updateTierLineItem(ti, li, "unit_price", e.target.value)}
                              disabled={pending}
                              style={{ width: 90, fontSize: "var(--text-sm)" }}
                            />
                            <span style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", lineHeight: "var(--space-5)" }}>
                              {formatCents(lineTotal(row))}
                            </span>
                            {tier.line_items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeTierLineItem(ti, li)}
                                disabled={pending}
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: "var(--text-sm)", padding: 0, lineHeight: 1 }}
                                aria-label={`Remove line item`}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => addTierLineItem(ti)}
                        disabled={pending}
                        style={{ width: "100%", marginTop: "var(--space-1)" }}
                      >
                        + Add item
                      </Button>
                    </div>

                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-2)", marginTop: "var(--space-3)", textAlign: "right" }}>
                      {tierTax > 0 && (
                        <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                          Tax: {formatCents(tierTax)}
                        </div>
                      )}
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700 }}>
                        {formatCents(tierTotal)}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          ) : (
            <>
              {/* Item Suggester */}
              <div style={{ marginBottom: "var(--space-4)", padding: "var(--space-3)", background: "var(--bg-subtle)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                <p style={{ margin: "0 0 var(--space-1)", fontSize: "var(--text-sm)", fontWeight: 600 }}>
                  Suggest from description
                </p>
                <p style={{ margin: "0 0 var(--space-2)", fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  Describe the job and Claude will match price book services automatically.
                </p>
                <Textarea
                  id="item_description"
                  label=""
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="e.g. Fix a leaky kitchen faucet, replace the shutoff valve under the sink, and patch the drywall where the pipe was leaking"
                  rows={3}
                  disabled={pending || itemSuggesting}
                />
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-2)" }}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={handleSuggestItems}
                    disabled={!itemDescription.trim() || itemSuggesting || pending}
                    loading={itemSuggesting}
                  >
                    {itemSuggesting ? "Suggesting…" : "Suggest Items"}
                  </Button>
                </div>

                {itemSuggestError && (
                  <p style={{ margin: "var(--space-2) 0 0", fontSize: "var(--text-sm)", color: "var(--status-error)" }}>
                    {itemSuggestError}
                  </p>
                )}

                {suggestions.length > 0 && (
                  <div style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--border)", paddingTop: "var(--space-3)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                      <span style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                        {suggestions.filter((s) => s.accepted).length} of {suggestions.length} selected
                      </span>
                      <div style={{ display: "flex", gap: "var(--space-2)" }}>
                        <button
                          type="button"
                          onClick={() => setSuggestions((prev) => prev.map((s) => ({ ...s, accepted: true })))}
                          style={{ background: "none", border: "none", fontSize: "var(--text-sm)", color: "var(--color-primary)", cursor: "pointer", padding: 0 }}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuggestions((prev) => prev.map((s) => ({ ...s, accepted: false })))}
                          style={{ background: "none", border: "none", fontSize: "var(--text-sm)", color: "var(--fg-muted)", cursor: "pointer", padding: 0 }}
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                      {suggestions.map((s, i) => (
                        <div
                          key={s.code}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "auto 1fr auto auto auto",
                            gap: "var(--space-2)",
                            alignItems: "start",
                            padding: "var(--space-2) var(--space-3)",
                            background: s.accepted ? "var(--color-surface-overlay)" : "transparent",
                            border: `1px solid ${s.accepted ? "var(--color-primary-alpha)" : "var(--border)"}`,
                            borderRadius: "var(--radius-sm)",
                            opacity: s.accepted ? 1 : 0.5,
                          }}
                        >
                          {/* Checkbox */}
                          <input
                            type="checkbox"
                            checked={s.accepted}
                            onChange={(e) =>
                              setSuggestions((prev) =>
                                prev.map((item, idx) =>
                                  idx === i ? { ...item, accepted: e.target.checked } : item
                                )
                              )
                            }
                            style={{ marginTop: 2 }}
                          />

                          {/* Name + reason */}
                          <div>
                            <div style={{ fontSize: "var(--text-sm)", fontWeight: 600 }}>
                              <span style={{ color: "var(--fg-muted)", fontWeight: 400, marginRight: "var(--space-1)" }}>{s.code}</span>
                              {s.name}
                            </div>
                            <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 2 }}>
                              {s.reason}
                            </div>
                          </div>

                          {/* Qty */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Qty</label>
                            <input
                              className="p7-input"
                              type="number"
                              min="1"
                              step="1"
                              value={s.quantity}
                              onChange={(e) =>
                                setSuggestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === i
                                      ? { ...item, quantity: Math.max(1, parseInt(e.target.value) || 1) }
                                      : item
                                  )
                                )
                              }
                              disabled={!s.accepted}
                              style={{ width: 56, fontSize: "var(--text-sm)" }}
                            />
                          </div>

                          {/* Unit price */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                            <label style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>Price ($)</label>
                            <input
                              className="p7-input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={(s.unit_price_cents / 100).toFixed(2)}
                              onChange={(e) =>
                                setSuggestions((prev) =>
                                  prev.map((item, idx) =>
                                    idx === i
                                      ? {
                                          ...item,
                                          unit_price_cents: Math.round(parseFloat(e.target.value || "0") * 100),
                                        }
                                      : item
                                  )
                                )
                              }
                              disabled={!s.accepted}
                              style={{ width: 80, fontSize: "var(--text-sm)" }}
                            />
                          </div>

                          {/* Line total */}
                          <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)", textAlign: "right", minWidth: 64, paddingTop: 20 }}>
                            {formatCents(s.quantity * s.unit_price_cents)}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "var(--space-3)" }}>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={handleAcceptSuggestions}
                        disabled={suggestions.filter((s) => s.accepted).length === 0 || pending}
                      >
                        Add {suggestions.filter((s) => s.accepted).length} item{suggestions.filter((s) => s.accepted).length !== 1 ? "s" : ""} to estimate
                      </Button>
                    </div>
                  </div>
                )}
              </div>

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
          {mode !== "multi_option" && (
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
                    <span data-testid="subtotal">{formatCents(genericSubtotalCents - materialHandlingCents)}</span>

                    {materialHandlingCents > 0 && (
                      <>
                        <span style={{ color: "var(--fg-muted)" }}>Material handling (15%)</span>
                        <span data-testid="material-handling">{formatCents(materialHandlingCents)}</span>
                      </>
                    )}

                    <span style={{ color: "var(--fg-muted)" }}>Subtotal with materials</span>
                    <span data-testid="subtotal-with-materials">{formatCents(genericSubtotalCents)}</span>

                    {guardrailAdjustmentCents > 0 && (
                      <>
                        <span style={{ color: "var(--fg-muted)" }}>Pricing adjustments</span>
                        <span>{formatCents(guardrailAdjustmentCents)}</span>
                      </>
                    )}

                    <span style={{ color: "var(--fg-muted)" }}>Deposit (30%)</span>
                    <span data-testid="deposit">{formatCents(depositCents)}</span>

                    <span style={{ fontWeight: "var(--font-semibold)" }}>Balance due</span>
                    <span data-testid="balance-due" style={{ fontWeight: "var(--font-semibold)" }}>{formatCents(balanceDueCents)}</span>
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

              <strong>Total (incl. tax)</strong>
              <strong data-testid="total">{formatCents(genericTotalCents)}</strong>

              {mode === "itemized" && (
                <>
                  <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
                    Balance due after deposit
                  </span>
                  <span data-testid="balance-due" style={{ fontSize: "var(--text-sm)" }}>
                    {formatCents(balanceDueCents)}
                  </span>
                </>
              )}
            </div>
          </div>
          )}
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
