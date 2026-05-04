import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriceBookEntry {
  id: string;
  code: string;
  name: string;
  category: string;
  price_min_cents: number;
  price_max_cents: number | null;
  description: string | null;
  default_labor_hours: number | null;
  requires_materials: boolean;
  upsell_codes: string[];
}

export interface SuggestedItem {
  code: string;
  price_book_id: string;
  name: string;
  description: string | null;
  quantity: number;
  unit_price_cents: number;
  reason: string;
}

// ---------------------------------------------------------------------------
// Prompt & tool (system prompt is static — cached; catalog block also cached)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an estimating assistant for Dovetails Services LLC, a painting and general handyman company. Given a client job description, suggest the most relevant services from the price book catalog to include on the estimate.

## Rules
- Only suggest services that appear in the catalog — never invent codes or names
- Choose the most specific match available; avoid catch-all specialty codes unless nothing else fits
- Set quantity to 1 unless the description clearly implies multiple units (e.g. "3 TVs" → quantity 3 for TV mounting)
- Set unit_price_cents to the price_min_cents of the matching item as the starting point
- Include upsell services only when they are directly implied by the description (e.g. touch-up painting always follows a drywall patch)
- Prefer core and standard tier items over specialty unless the scope clearly calls for specialty work
- Limit to 8 suggestions maximum — quality over quantity
- Write a one-sentence reason for each suggestion so the estimator can verify the match`;

const SUGGEST_TOOL: Anthropic.Tool = {
  name: "suggest_line_items",
  description:
    "Suggest price book line items that match a job description. Return only codes that exist in the catalog.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description: "Suggested price book services for this job, in priority order",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "Price book service code exactly as it appears in the catalog (e.g. '1001')",
            },
            quantity: {
              type: "number",
              minimum: 1,
              description: "Number of units — use 1 unless the description clearly implies more",
            },
            unit_price_cents: {
              type: "integer",
              minimum: 0,
              description:
                "Starting unit price in cents — use the catalog price_min_cents value",
            },
            reason: {
              type: "string",
              description: "One sentence explaining why this service matches the description",
            },
          },
          required: ["code", "quantity", "unit_price_cents", "reason"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
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
        ? `$${(item.price_min_cents / 100).toFixed(0)}–${(item.price_max_cents / 100).toFixed(0)}`
        : `$${(item.price_min_cents / 100).toFixed(0)}+`;
      const hours = item.default_labor_hours ? ` | ${item.default_labor_hours}h labor` : "";
      const mats = item.requires_materials ? " | needs materials" : "";
      const upsell =
        item.upsell_codes.length > 0 ? ` | upsells: ${item.upsell_codes.join(",")}` : "";
      const desc = item.description ? ` — ${item.description}` : "";
      return `${item.code} | ${item.category} | ${item.name}${desc} | ${priceRange}${hours}${mats}${upsell}`;
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

export async function suggestLineItems(
  description: string,
  priceBook: PriceBookEntry[]
): Promise<SuggestedItem[]> {
  if (!process.env.ANTHROPIC_API_KEY || priceBook.length === 0) return [];

  const byCode = new Map(priceBook.map((p) => [p.code, p]));
  const catalogText = buildCatalogText(priceBook);

  try {
    const client = getClient();

    // Both the system prompt and the catalog are static within a deploy.
    // Caching both blocks means the first call primes the cache; subsequent
    // calls pay only for the small user-turn input tokens.
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: `## Price Book Catalog\n\nFormat: code | category | name — description | price_range | labor_hours | notes\n\n${catalogText}`,
          cache_control: { type: "ephemeral" },
        },
      ] as Anthropic.TextBlockParam[],
      tools: [SUGGEST_TOOL],
      tool_choice: { type: "tool", name: "suggest_line_items" },
      messages: [
        {
          role: "user",
          content: `Suggest price book line items for this job request:\n\n${description}`,
        },
      ],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) return [];

    const raw = (toolUse.input as { items: Array<{ code: string; quantity: number; unit_price_cents: number; reason: string }> }).items ?? [];

    return raw
      .filter((s) => byCode.has(s.code))
      .map((s) => {
        const pb = byCode.get(s.code)!;
        return {
          code: s.code,
          price_book_id: pb.id,
          name: pb.name,
          description: pb.description,
          // Clamp to at least price_min; never let Claude go below catalog floor
          unit_price_cents: Math.max(pb.price_min_cents, s.unit_price_cents),
          quantity: Math.max(1, Math.round(s.quantity)),
          reason: s.reason,
        };
      });
  } catch (err) {
    console.error("[suggestLineItems] Claude API error:", err);
    return [];
  }
}
