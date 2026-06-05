import Anthropic from "@anthropic-ai/sdk";
import type { ScopeTemplate, ScopeComponentValues, ComputedMaterial, SpecifiedMaterial } from "@ai-fsm/domain";
import type { PriceBookEntry } from "./item-suggester";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoutingRule {
  signal: string;  // descriptive phrase(s) that trigger this service selection
  code: string;    // price book code to use
}

export interface DisambiguationRule {
  trigger: string;   // ambiguous keyword
  map_to: string;    // correct code for this trade
  not_when: string;  // context that indicates the OTHER meaning
  reason: string;    // explanation shown in prompt
}

export interface TradeDefinition {
  trade_key: string;
  display_name: string;
  scope_template_category: string | null;
  service_code_range_start: string;
  service_code_range_end: string;
  extra_code_notes: string | null;
  detection_keywords: string[];
  routing_rules: RoutingRule[];
  disambiguation_rules: DisambiguationRule[];
  scope_values_guidance: string | null;
  complexity_guidance: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface DraftService {
  service_code: string;
  service_id: string;
  service_name: string;
  service_category: string;
  base_price_cents: number;
  unit_type: string;
  add_on_price_cents: number | null;
  scope_values: Record<string, number | string>;
  complexity_factor_keys: string[];
  trade_detected: string;
  detection_reasons: string[];
  // Populated by the API route after the AI call
  computed_materials?: ComputedMaterial[];
  material_total_cents?: number;
  adjusted_price_cents?: number;   // base × sqft (if per_sqft) × scope modifier
}

export interface EstimatedMeasurement {
  scope_key: string;    // e.g. "wall_sqft"
  scope_label: string;  // e.g. "Wall area (living room)"
  value: number;        // estimated value
  basis: string;        // e.g. "standard living room heuristic (450 sqft)"
}

export type DraftConfidence = "high" | "medium" | "low";

export interface DraftGuardrails {
  trip_count: "one_trip" | "multi_trip";
  difficult_access: boolean;
  old_house_risk: boolean;
  requires_drying_or_curing: boolean;
  coordination_required: boolean;
  finish_expectation: "basic" | "clean" | "premium";
}

export interface DraftEstimate {
  services: DraftService[];
  notes: string;
  guardrails: DraftGuardrails;
  confidence_notes: string;
  confidence: DraftConfidence;
  schedule_notes: string;
  proposal_summary: string;
  estimated_measurements: EstimatedMeasurement[];  // measurements the AI guessed (not given)
  specified_materials: SpecifiedMaterial[];          // products mentioned by name in the description
}

// ---------------------------------------------------------------------------
// Prompt & tool
// ---------------------------------------------------------------------------

function buildTradeContextBlocks(trades: TradeDefinition[]): string {
  const active = trades.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order);
  return active
    .map((t) => {
      const keywords = t.detection_keywords.join(", ");
      const routes = t.routing_rules
        .map((r) => `- ${r.signal} → use ${r.code}`)
        .join("\n");
      const disambigs = t.disambiguation_rules
        .map(
          (d) =>
            `- Only map "${d.trigger}" to ${d.map_to} when NOT in: ${d.not_when}. Reason: ${d.reason}`
        )
        .join("\n");

      const lines: string[] = [];
      lines.push(
        `**${t.display_name.toUpperCase()} trade**: Any mention of: ${keywords}. When this trade is detected:`
      );
      if (routes) lines.push(routes);
      if (disambigs) lines.push(disambigs);
      if (t.scope_values_guidance) lines.push(t.scope_values_guidance);
      if (t.complexity_guidance) lines.push(t.complexity_guidance);
      return lines.join("\n");
    })
    .join("\n\n");
}

function buildRangeLocks(trades: TradeDefinition[]): string {
  const active = trades.filter((t) => t.is_active).sort((a, b) => a.sort_order - b.sort_order);
  return active
    .map((t) => {
      const range = `${t.service_code_range_start}–${t.service_code_range_end}`;
      const extra = t.extra_code_notes ? ` ${t.extra_code_notes}` : "";
      return `- ${t.trade_key}: ${range}${extra}`;
    })
    .join("\n");
}

function buildScopeValueRules(trades: TradeDefinition[]): string {
  const active = trades
    .filter((t) => t.is_active && t.scope_values_guidance)
    .sort((a, b) => a.sort_order - b.sort_order);
  return active.map((t) => `- ${t.display_name}: ${t.scope_values_guidance}`).join("\n");
}

function buildSystemPrompt(trades: TradeDefinition[]): string {
  const tradeContextBlocks = buildTradeContextBlocks(trades);
  const rangeLocks = buildRangeLocks(trades);
  const scopeValueRules = buildScopeValueRules(trades);

  return `You are an estimating assistant for Dovetails Services LLC, a handyman and woodworking company serving southern New Hampshire and the Merrimack Valley in Massachusetts. Given a job description, produce a complete estimate draft using the price book catalog and scope templates provided.

## Business context
- Owner-operated, solo or with a helper — no large crews
- Services range from minor repairs to full-room paint, carpentry installs, and light plumbing/electrical
- Licensing: MA requires licensed trades for certain work; items marked [MA:gray] or [MA:restricted] should be noted in confidence_notes
- Items marked [QUOTE] require an on-site assessment — include them in services but note this in confidence_notes

## Trade context — detect primary trade before selecting services
Before selecting services, identify the primary trade category from the description:

${tradeContextBlocks}

**UNKNOWN trade**: If the job does not match any catalog service:
- Use code 9099 (Custom / uncatalogued service)
- In the estimate notes, write a detailed description of what the work involves
- In confidence_notes, describe the trade steps, estimated materials and quantities, and why no catalog code fits — this is the estimator's review guide
- Flag: "Recommend adding this to the price book if the service type will recur"
- Never use 9099 when a catalog code reasonably fits — it's a fallback, not a shortcut

## Rules for service selection
- Only use codes that appear in the price book catalog — never invent codes
- For flooring work, always use the flooring catalog codes (9010–9013) — do NOT fall back to general_repairs or specialty_expansion codes for subfloor prep or LVP installation
- For all other trades, choose the most specific match; avoid 9000-series codes unless nothing else fits
- Prefer core and standard tier items over specialty
- Maximum 6 services — quality over quantity
- If 4+ services, note in confidence_notes whether a half-day block ($515) or full-day block ($980) may be worth considering

**CRITICAL — Unit count and add-on pricing:**
When one catalog service covers the first unit and lists an add-on price for additional units, return ONE service with the total count in the correct scope value rather than duplicating the service. Examples: 2 ceiling fans → service 3002 with fixture_count: 2; 3 light fixtures → service 3001 with fixture_count: 3. The pricing engine will calculate first unit at base price plus discounted add-ons.

**CRITICAL — Painting trim deduplication:**
Service 5012 (Interior room painting) already includes trim/baseboard pricing within its scope when trim_linear_ft is set. Do NOT also select service 5003 (Trim/baseboard painting) as a separate line when 5012 is present — this double-counts trim labor and materials. Only select 5003 as a standalone service when ONLY trim is being painted (not walls). If both walls and trim are included, use 5012 alone with trim_linear_ft in scope_values.

## Rules for scope values
- Fill scope_values with the component keys from the scope template for that service's category
- Use the exact key names shown in the Scope Templates section
${scopeValueRules}
- When measurements are not given, estimate from these heuristics and record every estimate in confidence_notes:
  - Bedroom → ~250 sqft walls (~180 sqft floor)
  - Master bedroom → ~320 sqft walls (~220 sqft floor)
  - Living room / family room → ~450 sqft walls (~280 sqft floor)
  - Bathroom (standard) → ~120 sqft walls (~50 sqft floor)
  - Kitchen → ~180 sqft walls (~120 sqft floor)
  - Hallway → ~80 sqft walls per 10 linear feet
  - "Two coats" is implied unless client says "one coat" or "touch-up"
- Only set numeric scope values — do not include null or empty values
- For select-type components (e.g. paint_finish), use the most common default: "eggshell" for walls, "semi_gloss" for trim

## Rules for complexity factors
- Apply factors conservatively — only check a factor if the description clearly implies it
- Never check more than 2 factors per service unless the description explicitly calls for it

**CRITICAL — Painting complexity factor rules:**
- dark_to_light: ONLY when the description explicitly mentions going from a dark color to a light one, or the current color is described as dark/bold
- nicotine_staining: ONLY when smoke, cigarette, or nicotine staining is explicitly mentioned — this is the ONLY trigger for full-wall BIN/shellac primer
- difficult_masking: ONLY when crown molding, chair rail, built-ins, or complex trim profiles are mentioned
- texture_match: ONLY when matching existing texture on patches is explicitly required
- Do NOT apply dark_to_light or nicotine_staining for standard repaints, minor patching, or touch-up work — these factors trigger full primer coats and significantly inflate cost
- "Minor patching" = light prep (small nail holes, minor dings) — does NOT require primer complexity factors

## Rules for guardrails
- trip_count: use "multi_trip" if the job clearly requires drying/curing between visits or separate site visits
- difficult_access: true only if the description mentions height, tight spaces, or access challenges
- old_house_risk: true if pre-1978 construction is mentioned or implied
- finish_expectation: use "premium" only if the client explicitly asks for high-end finish quality

## Trade service range locks
When a primary trade is detected, restrict service selection to that trade's catalog range. Only mix ranges when the description explicitly describes multi-trade work (e.g. "paint walls and install LVP flooring").
${rangeLocks}
- uncatalogued fallback: 9099

## Rules for trade_detected and detection_reasons
For every service, set trade_detected to the primary trade identified (e.g. "flooring", "painting", "carpentry"). Set detection_reasons to a short list of phrases extracted from the description that led to that classification — these are shown to the estimator as a reasoning preview. Examples: ["LVP mentioned", "concrete slab mentioned", "skim coat in flooring context"].

## Rules for confidence scoring
Set the top-level confidence field based on how certain the classification is:
- "high": all services came from the catalog with specific codes (no 9099), all measurements were explicitly given in the description (not estimated from heuristics), trade is unambiguous
- "medium": one or more measurements were estimated using heuristics (not given), or one 9099 service used, or trade detection had minor ambiguity
- "low": multiple 9099 services, primary trade is unclear, conflicting signals, or the description lacks enough information to price confidently

## Production anchor guidance
When sqft or unit counts are known (given or estimated), include a labor sanity check in confidence_notes using these production benchmarks:

| Service | Baseline | Key modifiers |
|---------|----------|---------------|
| 9010 LVP install | 175 sqft/day | complex_layout −15%, furnished_room −20%, demo_included −25% |
| 9011 Concrete skim coat | 100 sqft/day | complex_layout −10% |
| 9012 Self-leveling compound | 200 sqft/day | — |
| 9013 Flooring removal | 300 sqft/day | complex_layout −15% |
| 5012 Interior room painting | 200 sqft/day (wall_sqft) | dark_to_light −20%, nicotine_staining −30%, occupied_home −10%, vaulted_ceilings −15%, difficult_masking −15% |
| 5003 Trim/baseboard painting | 120 LF/day | difficult_masking −20% |
| 5002 Door painting | 6 doors/day | — |
| 2001 Faucet replacement | 6 fixtures/day | difficult_access −25% |
| 2005 Full toilet swap | 3 fixtures/day | difficult_access −20% |
| 2007 Garbage disposal | 4 fixtures/day | difficult_access −20% |
| 4001 Furniture assembly | 7 pieces/day | — |
| 4004 Closet organizer | 4 units/day | custom_fit −25% |
| 4009 Stair repair | 4 steps/day | difficult_access −20% |

Example flooring: "400 sqft LVP with complex_layout → 400 ÷ (175 × 0.85) ≈ 2.7 days. Pricing should reflect 3 field days minimum."
Example painting: "450 sqft walls (living room + hallway) with dark_to_light → 450 ÷ (200 × 0.80) ≈ 2.8 days. Budget 3 field days."
Example plumbing: "3 faucets at 6/day → 0.5 day. Price check: 3 × $175 = $525 minimum."
Apply the same reasoning to any service where a rate is listed. Do NOT fabricate rates for services not in this table.

## Estimate sanity check (pricing ranges)

After computing services, verify the total against these Dovetails benchmark ranges. Flag in confidence_notes if the estimate is MORE than 25% above the top of the range — this indicates double-counting or over-application of complexity factors.

| Job type | Expected range |
|---|---|
| Single room, standard repaint, walls only, clean prep | $350–$600 |
| Single room, walls + baseboard, minor prep | $450–$750 |
| Single room, walls + ceiling + baseboard, moderate prep | $600–$950 |
| Single room, heavy prep / dark-to-light | $800–$1,200 |
| 2-room repaint (avg bedroom size), standard | $700–$1,100 |
| Whole house repaint (3br/2ba), standard | $2,500–$4,500 |
| Ceiling fan swap (standard, existing box) | $150–$250 each |
| Faucet replacement | $175–$300 each |
| LVP flooring install (no demo) | $3.25–$5.00/sqft |

Sanity check example: "8×10 room with minor prep and baseboard = ~253 sqft walls + 33 LF trim. Expected: $450–$750. Generated total: $X. [Flag if > $937]"

If the generated estimate exceeds a benchmark by >25%, include in confidence_notes: "⚠ Estimate may be inflated — review service selection and complexity factors."

## Rules for specified_materials (products named in the description)
When the description mentions a specific product by name — especially one with coverage specs (e.g. "Pergo XP 20mil, box covers 19.63 sqft, $52/box") — you MUST:
1. Add it to specified_materials with the exact product name, coverage_per_unit, unit_label, unit_cost_cents, and units_to_order
2. Calculate units_to_order as: ceil((quantity_needed / coverage_per_unit) × waste_factor) where waste_factor is 1.10 for flooring, 1.10 for paint, 1.15 for drywall
3. Set quantity_needed from the relevant scope_value (e.g. floor_sqft for LVP)
4. Set store_section to the appropriate store aisle (e.g. "Flooring & Tile", "Paint & Supplies")
5. NEVER describe this material as "client-supplied" — Dovetails purchases the material UNLESS the description explicitly says "client is providing" or "owner-supplied"

**CRITICAL RULE**: Never use the phrase "client-supplied", "customer-supplied", "owner-supplied", or "client will provide" in any output unless the description literally states the client is bringing the materials. Mentioning a specific product name or brand does NOT mean the client is supplying it.

## Rules for estimated_measurements
For every measurement that was NOT explicitly given in the description (i.e., you used a room-type heuristic), add an entry to estimated_measurements:
- scope_key: the scope component key (e.g. "wall_sqft", "floor_sqft", "linear_feet")
- scope_label: a plain English description including the room/area (e.g. "Wall area — living room")
- value: the number you used
- basis: one sentence explaining the heuristic (e.g. "Standard living room heuristic: 450 sqft walls")
These are shown to the estimator as a required review step before they can send the estimate.
If all measurements were given explicitly, return an empty array.

## Rules for schedule_notes
Write this for the estimator, not the customer. Be specific about sequencing:
- If multi-trip: describe each visit with Day 1 / Day 2 labels, what happens each day, and the wait period between
- If cure time required: state the minimum cure window explicitly (e.g. "24–48h cure before next step")
- If single-trip: estimate total field hours and note any sequencing within the visit
- Mention any materials that need to be on-site or ordered before the visit

## Rules for proposal_summary
Write this for the customer. 2-3 sentences maximum. Rules:
- No service codes, no technical jargon, no price breakdowns — just plain English scope
- State WHAT we're doing, any key conditions (multi-trip, cure time), and one notable exclusion if relevant
- Tone: professional contractor writing to a homeowner who values clear communication
- DO NOT mention specific prices — pricing appears elsewhere in the proposal
- DO NOT say materials are "client-supplied" unless the description explicitly says so
- Example good: "We'll prepare your concrete slab and install new LVP flooring throughout the living room. Work is scheduled over two visits with a 24-hour cure between steps."
- Example bad: "Service 5009: touch-up painting with 9002 specialty skim coat ×1.20 modifier, $295 base"
- Example bad: "Client-supplied flooring will be installed." (unless the description literally said the client is providing the flooring)`;
}

const DRAFT_TOOL: Anthropic.Tool = {
  name: "draft_estimate",
  description:
    "Draft a complete estimate using services from the price book and scope values from the templates.",
  input_schema: {
    type: "object" as const,
    properties: {
      services: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          properties: {
            service_code: {
              type: "string",
              description: "Exact price book code (e.g. '1001')",
            },
            scope_values: {
              type: "object",
              description:
                "Scope component key → value pairs for this service's category template. Numeric for measurements; string for select-type components (e.g. floor_type, subfloor_condition, paint_finish).",
              additionalProperties: { oneOf: [{ type: "number" }, { type: "string" }] },
            },
            complexity_factor_keys: {
              type: "array",
              items: { type: "string" },
              description: "Keys of complexity factors to pre-check for this service",
            },
            trade_detected: {
              type: "string",
              description: "Primary trade identified for this service (e.g. 'flooring', 'painting', 'carpentry')",
            },
            detection_reasons: {
              type: "array",
              items: { type: "string" },
              description: "Short phrases from the description that led to this trade classification",
            },
          },
          required: ["service_code", "scope_values", "complexity_factor_keys", "trade_detected", "detection_reasons"],
          additionalProperties: false,
        },
      },
      notes: {
        type: "string",
        description: "Estimate-level notes to include on the estimate",
      },
      guardrails: {
        type: "object",
        properties: {
          trip_count: { type: "string", enum: ["one_trip", "multi_trip"] },
          difficult_access: { type: "boolean" },
          old_house_risk: { type: "boolean" },
          requires_drying_or_curing: { type: "boolean" },
          coordination_required: { type: "boolean" },
          finish_expectation: { type: "string", enum: ["basic", "clean", "premium"] },
        },
        required: [
          "trip_count",
          "difficult_access",
          "old_house_risk",
          "requires_drying_or_curing",
          "coordination_required",
          "finish_expectation",
        ],
        additionalProperties: false,
      },
      confidence_notes: {
        type: "string",
        description:
          "One paragraph summarizing every measurement estimated (not given), any legal flags, quote-trigger items, or bundle pricing notes. Shown to the estimator as a review prompt.",
      },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "Overall confidence tier: high = all catalog codes + all measurements given; medium = heuristic measurements or one 9099; low = multiple 9099 or ambiguous trade",
      },
      schedule_notes: {
        type: "string",
        description: "Estimator-facing schedule summary. Describe the visit sequence, timing, and any scheduling constraints. Use Day 1 / Day 2 framing when multi-trip. Example: 'Day 1 (Friday): Concrete skim coat + bonding primer — allow 24–48h cure time. Day 2 (Monday/Tuesday): LVP installation and transitions.' For single-trip: 'Single visit, estimated X hours.'",
      },
      proposal_summary: {
        type: "string",
        description: "2-3 sentences of customer-facing proposal language describing what we're doing, why, and any key conditions or exclusions. Plain English, no service codes. Professional but conversational — like a contractor writing to a homeowner. NEVER say materials are 'client-supplied' unless the description explicitly states the client is providing them.",
      },
      estimated_measurements: {
        type: "array",
        description: "List of measurements that were NOT given in the description — only those estimated using room-type heuristics. Empty if all measurements were explicitly stated.",
        items: {
          type: "object",
          properties: {
            scope_key:   { type: "string", description: "Scope component key used (e.g. 'wall_sqft', 'floor_sqft')" },
            scope_label: { type: "string", description: "Plain English label including the room (e.g. 'Wall area — living room')" },
            value:       { type: "number", description: "The estimated value you used" },
            basis:       { type: "string", description: "One sentence explaining the heuristic used" },
          },
          required: ["scope_key", "scope_label", "value", "basis"],
          additionalProperties: false,
        },
      },
      specified_materials: {
        type: "array",
        description: "Products explicitly named in the description with coverage or unit specs. Use to calculate how many boxes/units to order. Leave empty if no specific products are named.",
        items: {
          type: "object",
          properties: {
            name:              { type: "string", description: "Product name as mentioned (e.g. 'Pergo XP 20mil LVP')" },
            sku:               { type: ["string", "null"], description: "SKU or model number if mentioned" },
            coverage_per_unit: { type: ["number", "null"], description: "Sqft or LF covered per box/unit" },
            unit_label:        { type: "string", description: "Unit name: 'box', 'gallon', 'sheet', 'roll', etc." },
            unit_cost_cents:   { type: ["integer", "null"], description: "Price per unit in cents if mentioned (e.g. $52.00 → 5200)" },
            quantity_needed:   { type: "number", description: "Raw measurement from scope (sqft, LF, etc.)" },
            waste_factor:      { type: "number", description: "Waste factor: 1.10 for flooring/paint, 1.15 for drywall" },
            units_to_order:    { type: "integer", description: "ceil(quantity_needed / coverage_per_unit * waste_factor)" },
            store_section:     { type: "string", description: "Store aisle (e.g. 'Flooring & Tile', 'Paint & Supplies')" },
            service_code:      { type: "string", description: "Price book code for the service this material belongs to" },
            notes:             { type: ["string", "null"], description: "Any relevant notes about the product or order" },
          },
          required: ["name", "sku", "coverage_per_unit", "unit_label", "unit_cost_cents", "quantity_needed", "waste_factor", "units_to_order", "store_section", "service_code", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["services", "notes", "guardrails", "confidence_notes", "confidence", "schedule_notes", "proposal_summary", "estimated_measurements", "specified_materials"],
    additionalProperties: false,
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCatalogText(items: PriceBookEntry[]): string {
  return items
    .map((item) => {
      const priceRange = item.price_max_cents
        ? `$${(item.price_min_cents / 100).toFixed(0)}–$${(item.price_max_cents / 100).toFixed(0)}`
        : `$${(item.price_min_cents / 100).toFixed(0)}+`;
      const hours = item.labor_hours_typical
        ? ` | ${item.labor_hours_typical}h typical`
        : item.default_labor_hours
          ? ` | ${item.default_labor_hours}h labor`
          : "";
      const scope = item.scope_description ? ` | scope: ${item.scope_description}` : "";
      const excl = item.excluded_items ? ` | excl: ${item.excluded_items}` : "";
      const mats = item.requires_materials ? " | needs materials" : "";
      const addOn = item.add_on_price_cents ? " | add-on $" + (item.add_on_price_cents / 100).toFixed(0) : "";
      const legalMa = item.legal_status_ma !== "legal" ? ` | [MA:${item.legal_status_ma}]` : "";
      const qt = item.quote_trigger ? " | [QUOTE]" : "";
      const desc = item.description ? ` — ${item.description}` : "";
      return `${item.code} | ${item.category} | ${item.name}${desc} | ${priceRange}${hours}${addOn}${scope}${excl}${mats}${legalMa}${qt}`;
    })
    .join("\n");
}

function buildTemplatesText(templates: ScopeTemplate[]): string {
  return templates
    .map((t) => {
      const comps = t.components
        .map((c) => `${c.key} [${c.unit ?? c.input_type}]${c.required ? "*" : ""}`)
        .join(", ");
      const factors = t.complexity_factors
        .map((f) =>
          f.factor_type === "multiplier"
            ? `${f.key} (×${f.default_value.toFixed(2)})`
            : `${f.key} (+$${(f.default_value / 100).toFixed(0)})`
        )
        .join(", ");
      return `${t.category}: components: ${comps}${factors ? ` | factors: ${factors}` : ""}`;
    })
    .join("\n");
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function draftEstimate(
  description: string,
  priceBook: PriceBookEntry[],
  templates: ScopeTemplate[],
  trades: TradeDefinition[],
  jobContext?: string
): Promise<DraftEstimate | null> {
  if (!process.env.ANTHROPIC_API_KEY || priceBook.length === 0) return null;

  const byCode = new Map(priceBook.map((p) => [p.code, p]));
  const catalogText = buildCatalogText(priceBook);
  const templatesText = buildTemplatesText(templates);
  const systemPrompt = buildSystemPrompt(trades);

  const userContent = jobContext
    ? `Job context: ${jobContext}\n\nJob description: ${description}`
    : `Job description: ${description}`;

  try {
    const client = getClient();

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `## Price Book Catalog\n\nFormat: code | category | name — description | price_range | labor_hours | notes\n\n${catalogText}\n\n## Scope Templates (components to fill per category)\n\n${templatesText}`,
          cache_control: { type: "ephemeral" },
        },
      ] as Anthropic.TextBlockParam[],
      tools: [DRAFT_TOOL],
      tool_choice: { type: "tool", name: "draft_estimate" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) return null;

    const raw = toolUse.input as {
      services: Array<{
        service_code: string;
        scope_values: Record<string, number | string>;
        complexity_factor_keys: string[];
        trade_detected: string;
        detection_reasons: string[];
      }>;
      notes: string;
      guardrails: DraftGuardrails;
      confidence_notes: string;
      confidence: DraftConfidence;
      schedule_notes: string;
      proposal_summary: string;
      estimated_measurements: Array<{
        scope_key: string;
        scope_label: string;
        value: number;
        basis: string;
      }>;
      specified_materials: SpecifiedMaterial[];
    };

    // Validate and enrich services — strip hallucinated codes
    const services: DraftService[] = raw.services
      .filter((s) => byCode.has(s.service_code))
      .map((s) => {
        const pb = byCode.get(s.service_code)!;
        return {
          service_code: s.service_code,
          service_id: pb.id,
          service_name: pb.name,
          service_category: pb.category,
          base_price_cents: pb.default_price_cents ?? pb.price_min_cents,
          unit_type: pb.unit_type ?? "flat",
          add_on_price_cents: pb.add_on_price_cents,
          scope_values: s.scope_values,
          complexity_factor_keys: s.complexity_factor_keys,
          trade_detected: s.trade_detected ?? "unknown",
          detection_reasons: s.detection_reasons ?? [],
        };
      });

    const rawConfidence = raw.confidence;
    const confidence: DraftConfidence =
      rawConfidence === "high" || rawConfidence === "medium" || rawConfidence === "low"
        ? rawConfidence
        : "medium";

    return {
      services,
      notes: raw.notes ?? "",
      guardrails: raw.guardrails ?? {
        trip_count: "one_trip",
        difficult_access: false,
        old_house_risk: false,
        requires_drying_or_curing: false,
        coordination_required: false,
        finish_expectation: "clean",
      },
      confidence_notes: raw.confidence_notes ?? "",
      confidence,
      schedule_notes: raw.schedule_notes ?? "",
      proposal_summary: raw.proposal_summary ?? "",
      estimated_measurements: Array.isArray(raw.estimated_measurements) ? raw.estimated_measurements : [],
      specified_materials: Array.isArray(raw.specified_materials) ? raw.specified_materials : [],
    };
  } catch (err) {
    console.error("[draftEstimate] Claude API error:", err);
    return null;
  }
}
