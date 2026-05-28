import Anthropic from "@anthropic-ai/sdk";
import type { ScopeTemplate, ScopeComponentValues } from "@ai-fsm/domain";
import type { PriceBookEntry } from "./item-suggester";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DraftService {
  service_code: string;
  service_id: string;
  service_name: string;
  service_category: string;
  base_price_cents: number;
  scope_values: Record<string, number | string>;
  complexity_factor_keys: string[];
}

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
}

// ---------------------------------------------------------------------------
// Prompt & tool
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an estimating assistant for Dovetails Services LLC, a handyman and woodworking company serving southern New Hampshire and the Merrimack Valley in Massachusetts. Given a job description, produce a complete estimate draft using the price book catalog and scope templates provided.

## Business context
- Owner-operated, solo or with a helper — no large crews
- Services range from minor repairs to full-room paint, carpentry installs, and light plumbing/electrical
- Licensing: MA requires licensed trades for certain work; items marked [MA:gray] or [MA:restricted] should be noted in confidence_notes
- Items marked [QUOTE] require an on-site assessment — include them in services but note this in confidence_notes

## Trade context — detect primary trade before selecting services
Before selecting services, identify the primary trade category from the description:

**FLOORING trade**: Any mention of LVP, vinyl plank, hardwood, laminate, carpet, or subfloor work (concrete skim coat, self-leveling, grinding, floor prep, substrate leveling). When FLOORING is the primary trade:
- "skim coat" or "feather finish" = concrete subfloor prep → use 9011, NOT 9002 or 1004
- "substrate prep" or "leveling" = floor leveling → use 9011 or 9012, NOT drywall services
- "bump-outs", "posts", "columns" = layout complexity → apply complex_layout factor on 9010
- Cure cycle between floor prep and flooring install → set trip_count = "multi_trip", requires_drying_or_curing = true, and apply multi_trip_cure factor; describe the two-visit sequence in confidence_notes
- LVP install → 9010; floor prep/skim coat → 9011; self-leveling compound → 9012; removal → 9013

Only classify "skim coat" as drywall finishing (9002 / 1004) when the surrounding context is clearly wall or ceiling work with no flooring mentioned.

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
- For flooring services (9010–9013): use sqft (floor area), floor_type (lvp/hardwood/laminate/concrete_prep_only), subfloor_condition (good/minor_leveling/skim_coat/self_leveler). Set material_cost only if a client-supplied cost is explicitly stated.
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
- finish_expectation: use "premium" only if the client explicitly asks for high-end finish quality`;

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
          },
          required: ["service_code", "scope_values", "complexity_factor_keys"],
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
    },
    required: ["services", "notes", "guardrails", "confidence_notes"],
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
  jobContext?: string
): Promise<DraftEstimate | null> {
  if (!process.env.ANTHROPIC_API_KEY || priceBook.length === 0) return null;

  const byCode = new Map(priceBook.map((p) => [p.code, p]));
  const catalogText = buildCatalogText(priceBook);
  const templatesText = buildTemplatesText(templates);

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
          text: SYSTEM_PROMPT,
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
        scope_values: Record<string, number>;
        complexity_factor_keys: string[];
      }>;
      notes: string;
      guardrails: DraftGuardrails;
      confidence_notes: string;
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
          scope_values: s.scope_values as Record<string, number | string>,
          complexity_factor_keys: s.complexity_factor_keys,
        };
      });

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
    };
  } catch (err) {
    console.error("[draftEstimate] Claude API error:", err);
    return null;
  }
}
