/**
 * T&M briefing → estimate draft
 *
 * Paste freeform notes (owner notes, other-AI writeups, walkthrough dumps).
 * Extract structured T&M fields, price with Dovetails rates (not pasted rates),
 * and produce line items + customer/internal notes without forcing price-book codes.
 */

import Anthropic from "@anthropic-ai/sdk";
import {
  LABOR_CUSTOMER_RATE_CENTS_PER_HOUR,
  MA_LABOR_RATE_DELTA,
  buildShoppingList,
  type ShoppingList,
  type SpecifiedMaterial,
} from "@ai-fsm/domain";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TmConfidence = "high" | "medium" | "low";
export type TmRecommendedMode = "time_and_materials" | "fixed_bid";

export interface TmMaterialLine {
  name: string;
  quantity: number | null;
  unit_label: string;
  unit_cost_cents: number | null;
  customer_supplied: boolean;
  notes: string | null;
  store_section: string;
}

export interface TmBriefingExtraction {
  recommended_mode: TmRecommendedMode;
  mode_rationale: string;
  location_city: string | null;
  location_state: string | null;
  location_notes: string | null;
  scope_summary: string;
  scope_items: string[];
  labor_hours_min: number;
  labor_hours_max: number;
  travel_hours_min: number;
  travel_hours_max: number;
  working_days: number | null;
  trip_count: "one_trip" | "multi_trip";
  materials: TmMaterialLine[];
  materials_policy: string;
  risks: string[];
  customer_notes: string;
  internal_notes: string;
  proposal_summary: string;
  confidence: TmConfidence;
  confidence_notes: string;
  schedule_notes: string;
  difficult_access: boolean;
  old_house_risk: boolean;
  requires_drying_or_curing: boolean;
  coordination_required: boolean;
  finish_expectation: "basic" | "clean" | "premium";
  /** Rate mentioned in the paste (cents/hr), if any — never used for pricing */
  pasted_rate_cents: number | null;
}

export interface TmDraftLineItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
  line_item_type: "labor" | "materials" | "adjustment";
}

export interface TmEstimateDraft {
  extraction: TmBriefingExtraction;
  labor_rate_cents: number;
  travel_rate_cents: number;
  is_ma: boolean;
  labor_mid_hours: number;
  travel_mid_hours: number;
  labor_total_cents_min: number;
  labor_total_cents_max: number;
  travel_total_cents_min: number;
  travel_total_cents_max: number;
  materials_estimate_cents: number;
  total_estimate_cents_min: number;
  total_estimate_cents_max: number;
  line_items: TmDraftLineItem[];
  notes: string;
  internal_notes: string;
  shopping_list: ShoppingList | null;
  specified_materials: SpecifiedMaterial[];
  guardrails: {
    trip_count: "one_trip" | "multi_trip";
    difficult_access: boolean;
    old_house_risk: boolean;
    requires_drying_or_curing: boolean;
    coordination_required: boolean;
    finish_expectation: "basic" | "clean" | "premium";
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (no I/O)
// ---------------------------------------------------------------------------

export function midHours(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;
  const lo = Math.max(0, Math.min(min, max));
  const hi = Math.max(0, Math.max(min, max));
  return Math.round(((lo + hi) / 2) * 4) / 4; // nearest 0.25h
}

export function resolveLaborRateCents(state: string | null | undefined): {
  labor_rate_cents: number;
  travel_rate_cents: number;
  is_ma: boolean;
} {
  const st = (state ?? "").trim().toUpperCase();
  const is_ma = st === "MA" || st === "MASSACHUSETTS";
  const base = LABOR_CUSTOMER_RATE_CENTS_PER_HOUR;
  const labor_rate_cents = is_ma
    ? Math.round(base * (1 + MA_LABOR_RATE_DELTA))
    : base;
  // T&M briefings bill travel time at the same customer labor rate so the
  // hour band is easy to explain. Dedicated mileage/zone travel still lives
  // on the travel recommendation widget after create.
  const travel_rate_cents = labor_rate_cents;
  return { labor_rate_cents, travel_rate_cents, is_ma };
}

function formatHourRange(min: number, max: number): string {
  if (min === max) return `${min}`;
  return `${min}–${max}`;
}

function formatMoneyRange(minCents: number, maxCents: number): string {
  const fmt = (c: number) =>
    `$${(c / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (minCents === maxCents) return fmt(minCents);
  return `${fmt(minCents)}–${fmt(maxCents)}`;
}

function dollarsFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Build customer-facing T&M notes. Uses Dovetails rates, never the pasted rate.
 */
export function buildTmCustomerNotes(
  extraction: TmBriefingExtraction,
  laborRateCents: number,
  totals: {
    laborMin: number;
    laborMax: number;
    travelMin: number;
    travelMax: number;
    materials: number;
    totalMin: number;
    totalMax: number;
  }
): string {
  const rate = dollarsFromCents(laborRateCents);
  const location =
    extraction.location_city && extraction.location_state
      ? `${extraction.location_city}, ${extraction.location_state}`
      : extraction.location_city || extraction.location_state || "the job site";

  const days =
    extraction.working_days != null
      ? `approximately ${extraction.working_days} working day${extraction.working_days === 1 ? "" : "s"}`
      : "the hours listed below";

  const parts: string[] = [];

  parts.push(
    `This is a time-and-materials (T&M) project, not a fixed bid. Based on current scope I expect ${days} of on-site work` +
      (extraction.travel_hours_max > 0 ? ` plus travel to ${location}` : "") +
      `. Final invoice is actual labor hours at $${rate}/hr, plus materials at cost.`
  );

  parts.push(
    `Estimated billable time: on-site ${formatHourRange(extraction.labor_hours_min, extraction.labor_hours_max)} hrs` +
      (extraction.travel_hours_max > 0
        ? `; travel ${formatHourRange(extraction.travel_hours_min, extraction.travel_hours_max)} hrs`
        : "") +
      `. Labor + travel range: ${formatMoneyRange(totals.laborMin + totals.travelMin, totals.laborMax + totals.travelMax)}.` +
      (totals.materials > 0
        ? ` Materials allowance (at cost): ~$${(totals.materials / 100).toFixed(0)}.`
        : " Materials billed at cost.") +
      ` Overall expectation: ${formatMoneyRange(totals.totalMin, totals.totalMax)} if the job stays in this range.`
  );

  if (extraction.materials_policy?.trim()) {
    parts.push(extraction.materials_policy.trim());
  } else if (extraction.materials.some((m) => m.customer_supplied)) {
    parts.push(
      "Customer has provided existing materials/paint. If aged, separated, or no longer matching, additional materials may need to be purchased. Any additional materials will be approved by the homeowner before purchase."
    );
  }

  parts.push(
    "Hidden repairs or additional work discovered once preparation begins will be discussed before proceeding."
  );

  if (extraction.customer_notes?.trim()) {
    // Prefer model language when it already covers T&M — still keep our rate/range block first
    const extra = extraction.customer_notes.trim();
    if (!extra.toLowerCase().includes("time-and-materials") && !extra.toLowerCase().includes("t&m")) {
      parts.push(extra);
    }
  }

  return parts.join("\n\n");
}

export function buildTmInternalNotes(
  extraction: TmBriefingExtraction,
  laborRateCents: number,
  pastedRateCents: number | null
): string {
  const lines: string[] = [
    "T&M estimate from pasted briefing.",
    `Recommended mode: ${extraction.recommended_mode} — ${extraction.mode_rationale}`,
    `Dovetails bill rate: $${dollarsFromCents(laborRateCents)}/hr` +
      (pastedRateCents != null
        ? ` (paste mentioned $${dollarsFromCents(pastedRateCents)}/hr — ignored for pricing)`
        : ""),
    `Labor: ${formatHourRange(extraction.labor_hours_min, extraction.labor_hours_max)} hrs; travel: ${formatHourRange(extraction.travel_hours_min, extraction.travel_hours_max)} hrs.`,
  ];

  if (extraction.scope_items.length > 0) {
    lines.push(`Scope: ${extraction.scope_items.join("; ")}`);
  }
  if (extraction.risks.length > 0) {
    lines.push(`Risks: ${extraction.risks.join("; ")}`);
  }
  if (extraction.confidence_notes?.trim()) {
    lines.push(`Confidence (${extraction.confidence}): ${extraction.confidence_notes.trim()}`);
  }
  if (extraction.schedule_notes?.trim()) {
    lines.push(`Schedule: ${extraction.schedule_notes.trim()}`);
  }
  if (extraction.internal_notes?.trim()) {
    lines.push(extraction.internal_notes.trim());
  }
  return lines.join("\n");
}

export function materialsEstimateCents(materials: TmMaterialLine[]): number {
  return materials.reduce((sum, m) => {
    if (m.customer_supplied) return sum;
    if (m.unit_cost_cents == null || m.unit_cost_cents <= 0) return sum;
    const qty = m.quantity != null && m.quantity > 0 ? m.quantity : 1;
    return sum + Math.round(qty * m.unit_cost_cents);
  }, 0);
}

export function toSpecifiedMaterials(materials: TmMaterialLine[]): SpecifiedMaterial[] {
  return materials
    .filter((m) => !m.customer_supplied)
    .map((m) => {
      const qty = m.quantity != null && m.quantity > 0 ? m.quantity : 1;
      return {
        name: m.name,
        sku: null,
        coverage_per_unit: null,
        unit_label: m.unit_label || "each",
        unit_cost_cents: m.unit_cost_cents,
        quantity_needed: qty,
        waste_factor: 1,
        units_to_order: Math.ceil(qty),
        store_section: m.store_section || "Paint & Supplies",
        service_code: "T&M",
        notes: m.notes,
      };
    });
}

export function buildTmShoppingList(materials: TmMaterialLine[]): ShoppingList | null {
  const specified = toSpecifiedMaterials(materials);
  if (specified.length === 0) {
    // Still list customer-supplied items as notes-only specified entries so the tech sees them
    const customerSupplied = materials.filter((m) => m.customer_supplied);
    if (customerSupplied.length === 0) return null;
    const specs: SpecifiedMaterial[] = customerSupplied.map((m) => ({
      name: `${m.name} (customer-supplied)`,
      sku: null,
      coverage_per_unit: null,
      unit_label: m.unit_label || "each",
      unit_cost_cents: null,
      quantity_needed: m.quantity ?? 1,
      waste_factor: 1,
      units_to_order: Math.max(1, Math.ceil(m.quantity ?? 1)),
      store_section: m.store_section || "Paint & Supplies",
      service_code: "T&M",
      notes: m.notes ?? "Verify condition before relying on this material",
    }));
    return buildShoppingList([], specs);
  }
  const customerSpecs = materials
    .filter((m) => m.customer_supplied)
    .map(
      (m): SpecifiedMaterial => ({
        name: `${m.name} (customer-supplied)`,
        sku: null,
        coverage_per_unit: null,
        unit_label: m.unit_label || "each",
        unit_cost_cents: null,
        quantity_needed: m.quantity ?? 1,
        waste_factor: 1,
        units_to_order: Math.max(1, Math.ceil(m.quantity ?? 1)),
        store_section: m.store_section || "Paint & Supplies",
        service_code: "T&M",
        notes: m.notes ?? "Verify condition before relying on this material",
      })
    );
  return buildShoppingList([], [...specified, ...customerSpecs]);
}

/**
 * Pure: turn extraction + rates into a full T&M draft ready for the estimate form.
 */
export function finalizeTmDraft(extraction: TmBriefingExtraction): TmEstimateDraft {
  const { labor_rate_cents, travel_rate_cents, is_ma } = resolveLaborRateCents(
    extraction.location_state
  );

  const labor_mid_hours = midHours(extraction.labor_hours_min, extraction.labor_hours_max);
  const travel_mid_hours = midHours(extraction.travel_hours_min, extraction.travel_hours_max);

  const labor_total_cents_min = Math.round(extraction.labor_hours_min * labor_rate_cents);
  const labor_total_cents_max = Math.round(extraction.labor_hours_max * labor_rate_cents);
  const travel_total_cents_min = Math.round(extraction.travel_hours_min * travel_rate_cents);
  const travel_total_cents_max = Math.round(extraction.travel_hours_max * travel_rate_cents);
  const materials_estimate_cents = materialsEstimateCents(extraction.materials);

  const total_estimate_cents_min =
    labor_total_cents_min + travel_total_cents_min + materials_estimate_cents;
  const total_estimate_cents_max =
    labor_total_cents_max + travel_total_cents_max + materials_estimate_cents;

  const line_items: TmDraftLineItem[] = [];

  if (labor_mid_hours > 0) {
    line_items.push({
      description: `Estimated on-site labor (T&M) — ${formatHourRange(
        extraction.labor_hours_min,
        extraction.labor_hours_max
      )} hrs @ $${dollarsFromCents(labor_rate_cents)}/hr. Final bill = actual hours.`,
      quantity: labor_mid_hours,
      unit_price_cents: labor_rate_cents,
      line_item_type: "labor",
    });
  }

  if (travel_mid_hours > 0) {
    const loc =
      extraction.location_city && extraction.location_state
        ? `${extraction.location_city}, ${extraction.location_state}`
        : extraction.location_city || "job site";
    line_items.push({
      description: `Estimated travel (T&M) — ${formatHourRange(
        extraction.travel_hours_min,
        extraction.travel_hours_max
      )} hrs to ${loc}. Final bill = actual travel time.`,
      quantity: travel_mid_hours,
      unit_price_cents: travel_rate_cents,
      line_item_type: "labor",
    });
  }

  if (materials_estimate_cents > 0) {
    line_items.push({
      description:
        "Materials allowance (billed at cost — estimate only; replace with actuals on invoice)",
      quantity: 1,
      unit_price_cents: materials_estimate_cents,
      line_item_type: "materials",
    });
  }

  const notes = buildTmCustomerNotes(extraction, labor_rate_cents, {
    laborMin: labor_total_cents_min,
    laborMax: labor_total_cents_max,
    travelMin: travel_total_cents_min,
    travelMax: travel_total_cents_max,
    materials: materials_estimate_cents,
    totalMin: total_estimate_cents_min,
    totalMax: total_estimate_cents_max,
  });

  const internal_notes = buildTmInternalNotes(
    extraction,
    labor_rate_cents,
    extraction.pasted_rate_cents
  );

  return {
    extraction,
    labor_rate_cents,
    travel_rate_cents,
    is_ma,
    labor_mid_hours,
    travel_mid_hours,
    labor_total_cents_min,
    labor_total_cents_max,
    travel_total_cents_min,
    travel_total_cents_max,
    materials_estimate_cents,
    total_estimate_cents_min,
    total_estimate_cents_max,
    line_items,
    notes,
    internal_notes,
    shopping_list: buildTmShoppingList(extraction.materials),
    specified_materials: toSpecifiedMaterials(extraction.materials),
    guardrails: {
      trip_count: extraction.trip_count,
      difficult_access: extraction.difficult_access,
      old_house_risk: extraction.old_house_risk,
      requires_drying_or_curing: extraction.requires_drying_or_curing,
      coordination_required: extraction.coordination_required,
      finish_expectation: extraction.finish_expectation,
    },
  };
}

// ---------------------------------------------------------------------------
// AI extraction
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You extract a time-and-materials (T&M) estimate briefing for Dovetails Services LLC (handyman / painting, based in Derry NH, serves southern NH + Merrimack Valley MA).

The input is freeform owner notes — often pasted from another AI conversation, walkthrough notes, or customer discussion. Extract facts; do NOT invent catalog service codes or fixed-bid price-book lines.

## Rules
- Prefer recommended_mode = "time_and_materials" when the paste says T&M, has many unknowns, punch-list / mixed small tasks, unknown paint condition, variable patch sizes, or travel + multi-day uncertainty.
- Use "fixed_bid" only when the paste clearly wants a fixed price AND scope is fully measured with low uncertainty.
- Labor/travel hours: use numbers from the paste when present. If only "2 days" is given, map to labor_hours_min=14, labor_hours_max=16 (solo field days) unless more detail is given. Travel is separate — do not fold travel into labor.
- If travel is mentioned but hours are not: for Maynard MA / 30–45 min one-way corridor from Derry, use travel_hours_min=3, travel_hours_max=4 for a 2-day job; scale roughly with working_days.
- Never copy a pasted hourly rate into pricing decisions — record it only in pasted_rate_cents (dollars → cents, e.g. $85 → 8500). Dovetails rates are applied server-side.
- materials: list products to buy or carry. Mark customer_supplied=true when HO provides paint/materials. Estimate unit_cost_cents only when you can reasonably ballpark (e.g. quart trim enamel ~2500–3500); else null.
- materials_policy: short paragraph about at-cost materials and HO paint risk when relevant.
- customer_notes: homeowner-facing language about T&M, unknowns, and approval for extra materials — no dollar amounts required (server adds rate ranges).
- internal_notes: estimator-only risks and assumptions.
- scope_items: concise work list (molding, patch/paint, cabinets, etc.).
- confidence: high if hours + location + supply decisions clear; medium if some heuristics; low if vague.
- Guardrails: multi_trip if 2+ days or drying cycles; requires_drying_or_curing for paint/patch multi-coat work.

Call the extract_tm_briefing tool with the structured result.`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_tm_briefing",
  description: "Extract structured T&M briefing fields from freeform estimate notes.",
  input_schema: {
    type: "object" as const,
    properties: {
      recommended_mode: {
        type: "string",
        enum: ["time_and_materials", "fixed_bid"],
      },
      mode_rationale: { type: "string" },
      location_city: { type: ["string", "null"] },
      location_state: { type: ["string", "null"], description: "2-letter state if known, e.g. MA" },
      location_notes: { type: ["string", "null"] },
      scope_summary: { type: "string" },
      scope_items: { type: "array", items: { type: "string" } },
      labor_hours_min: { type: "number" },
      labor_hours_max: { type: "number" },
      travel_hours_min: { type: "number" },
      travel_hours_max: { type: "number" },
      working_days: { type: ["number", "null"] },
      trip_count: { type: "string", enum: ["one_trip", "multi_trip"] },
      materials: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            quantity: { type: ["number", "null"] },
            unit_label: { type: "string" },
            unit_cost_cents: { type: ["integer", "null"] },
            customer_supplied: { type: "boolean" },
            notes: { type: ["string", "null"] },
            store_section: { type: "string" },
          },
          required: [
            "name",
            "quantity",
            "unit_label",
            "unit_cost_cents",
            "customer_supplied",
            "notes",
            "store_section",
          ],
          additionalProperties: false,
        },
      },
      materials_policy: { type: "string" },
      risks: { type: "array", items: { type: "string" } },
      customer_notes: { type: "string" },
      internal_notes: { type: "string" },
      proposal_summary: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      confidence_notes: { type: "string" },
      schedule_notes: { type: "string" },
      difficult_access: { type: "boolean" },
      old_house_risk: { type: "boolean" },
      requires_drying_or_curing: { type: "boolean" },
      coordination_required: { type: "boolean" },
      finish_expectation: { type: "string", enum: ["basic", "clean", "premium"] },
      pasted_rate_cents: {
        type: ["integer", "null"],
        description: "Hourly rate mentioned in paste, in cents (e.g. 8500 for $85). Null if none.",
      },
    },
    required: [
      "recommended_mode",
      "mode_rationale",
      "location_city",
      "location_state",
      "location_notes",
      "scope_summary",
      "scope_items",
      "labor_hours_min",
      "labor_hours_max",
      "travel_hours_min",
      "travel_hours_max",
      "working_days",
      "trip_count",
      "materials",
      "materials_policy",
      "risks",
      "customer_notes",
      "internal_notes",
      "proposal_summary",
      "confidence",
      "confidence_notes",
      "schedule_notes",
      "difficult_access",
      "old_house_risk",
      "requires_drying_or_curing",
      "coordination_required",
      "finish_expectation",
      "pasted_rate_cents",
    ],
    additionalProperties: false,
  },
};

function clampHours(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return fallback;
  return Math.round(v * 4) / 4;
}

function normalizeExtraction(raw: Record<string, unknown>): TmBriefingExtraction {
  const materialsRaw = Array.isArray(raw.materials) ? raw.materials : [];
  const materials: TmMaterialLine[] = materialsRaw.map((m) => {
    const row = (m ?? {}) as Record<string, unknown>;
    return {
      name: String(row.name ?? "Material"),
      quantity: row.quantity == null ? null : Number(row.quantity),
      unit_label: String(row.unit_label ?? "each"),
      unit_cost_cents:
        row.unit_cost_cents == null || row.unit_cost_cents === ""
          ? null
          : Math.round(Number(row.unit_cost_cents)),
      customer_supplied: Boolean(row.customer_supplied),
      notes: row.notes == null ? null : String(row.notes),
      store_section: String(row.store_section ?? "Paint & Supplies"),
    };
  });

  let labor_min = clampHours(raw.labor_hours_min, 0);
  let labor_max = clampHours(raw.labor_hours_max, labor_min);
  if (labor_max < labor_min) [labor_min, labor_max] = [labor_max, labor_min];

  let travel_min = clampHours(raw.travel_hours_min, 0);
  let travel_max = clampHours(raw.travel_hours_max, travel_min);
  if (travel_max < travel_min) [travel_min, travel_max] = [travel_max, travel_min];

  const mode =
    raw.recommended_mode === "fixed_bid" ? "fixed_bid" : "time_and_materials";

  return {
    recommended_mode: mode,
    mode_rationale: String(raw.mode_rationale ?? ""),
    location_city: raw.location_city == null ? null : String(raw.location_city),
    location_state: raw.location_state == null ? null : String(raw.location_state),
    location_notes: raw.location_notes == null ? null : String(raw.location_notes),
    scope_summary: String(raw.scope_summary ?? ""),
    scope_items: Array.isArray(raw.scope_items)
      ? raw.scope_items.map((s) => String(s))
      : [],
    labor_hours_min: labor_min,
    labor_hours_max: labor_max,
    travel_hours_min: travel_min,
    travel_hours_max: travel_max,
    working_days:
      raw.working_days == null || raw.working_days === ""
        ? null
        : Number(raw.working_days),
    trip_count: raw.trip_count === "one_trip" ? "one_trip" : "multi_trip",
    materials,
    materials_policy: String(raw.materials_policy ?? ""),
    risks: Array.isArray(raw.risks) ? raw.risks.map((r) => String(r)) : [],
    customer_notes: String(raw.customer_notes ?? ""),
    internal_notes: String(raw.internal_notes ?? ""),
    proposal_summary: String(raw.proposal_summary ?? ""),
    confidence:
      raw.confidence === "high" || raw.confidence === "low"
        ? raw.confidence
        : "medium",
    confidence_notes: String(raw.confidence_notes ?? ""),
    schedule_notes: String(raw.schedule_notes ?? ""),
    difficult_access: Boolean(raw.difficult_access),
    old_house_risk: Boolean(raw.old_house_risk),
    requires_drying_or_curing: Boolean(raw.requires_drying_or_curing),
    coordination_required: Boolean(raw.coordination_required),
    finish_expectation:
      raw.finish_expectation === "basic" || raw.finish_expectation === "premium"
        ? raw.finish_expectation
        : "clean",
    pasted_rate_cents:
      raw.pasted_rate_cents == null || raw.pasted_rate_cents === ""
        ? null
        : Math.round(Number(raw.pasted_rate_cents)),
  };
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

export async function extractTmBriefing(
  briefingText: string,
  jobContext?: string
): Promise<TmEstimateDraft | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!briefingText.trim()) return null;

  const userContent = jobContext
    ? `## Job context\n${jobContext}\n\n## Pasted briefing\n${briefingText}`
    : `## Pasted briefing\n${briefingText}`;

  const client = getClient();
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ] as Anthropic.TextBlockParam[],
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_tm_briefing" },
    messages: [{ role: "user", content: userContent }],
  });

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
  );
  if (!toolUse) return null;

  const extraction = normalizeExtraction(toolUse.input as Record<string, unknown>);
  if (extraction.labor_hours_max <= 0 && extraction.travel_hours_max <= 0) {
    return null;
  }
  return finalizeTmDraft(extraction);
}
