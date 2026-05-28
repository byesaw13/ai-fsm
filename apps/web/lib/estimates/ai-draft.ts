import Anthropic from "@anthropic-ai/sdk";
import type { ScopeTemplate, ScopeComponentValues } from "@ai-fsm/domain";
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
  scope_values: Record<string, number | string>;
  complexity_factor_keys: string[];
  trade_detected: string;
  detection_reasons: string[];
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
Apply the same reasoning to any service where a rate is listed. Do NOT fabricate rates for services not in this table.`;
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
    },
    required: ["services", "notes", "guardrails", "confidence_notes", "confidence"],
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
      const legalMa = item.legal_status_ma !== "legal" ? ` | [MA:${item.legal_status_ma}]` : "";
      const qt = item.quote_trigger ? " | [QUOTE]" : "";
      const desc = item.description ? ` — ${item.description}` : "";
      return `${item.code} | ${item.category} | ${item.name}${desc} | ${priceRange}${hours}${scope}${excl}${mats}${legalMa}${qt}`;
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
      max_tokens: 2048,
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
    };
  } catch (err) {
    console.error("[draftEstimate] Claude API error:", err);
    return null;
  }
}
