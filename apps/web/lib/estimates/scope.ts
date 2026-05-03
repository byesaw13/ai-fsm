import Anthropic from "@anthropic-ai/sdk";

export interface ScopeTranslation {
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  labor_hours_estimate: number | null;
  material_cost_cents: number | null;
  suggested_job_type: string;
  confidence: number; // 0-100
  parsed_items: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Prompt & tool definition (static — cached by Anthropic prefix caching)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a scope parser for Dovetails Services LLC, a painting and general contracting company. Parse free-text customer notes into structured estimate fields.

## What to extract

- **sq_ft**: Total wall surface area in sq ft. Accept explicit measurements ("1,200 sq ft") or estimate from room counts using reference sizes below.
- **prep_level**: Surface condition on a 1–10 scale (see guide below).
- **includes_trim**: Whether trim, baseboards, crown molding, door/window frames are included.
- **includes_ceiling**: Whether ceiling painting is included.
- **labor_hours_estimate**: If mentioned explicitly (e.g., "about 8 hours").
- **material_cost_cents**: Dollar amount for materials if mentioned (convert to cents).
- **suggested_job_type**: One of: "painting", "maintenance", "repair", "custom".
- **confidence**: 0–100 score reflecting how complete the input is.
- **parsed_items**: Each extracted data point with the source (e.g., "1,200 sq ft from direct measurement", "Prep level 7 from mention of water damage").
- **warnings**: Assumptions or ambiguities the estimator should verify (e.g., "Sq ft estimated from room count — confirm with client").

## Prep level guide
- 1–2: New construction or perfect condition, zero prep
- 3–4: Light cleaning, minor scuffs, one touch-up coat
- 5: Standard repaint — typical residential (default when no details given)
- 6–7: Patching holes, sanding, spot priming, peeling paint
- 8–9: Water damage, mold/mildew, significant cracks, smoke staining
- 10: Full restoration — wallpaper removal, lead encapsulation, fire damage

## Reference room sizes (wall surface sq ft — not floor area)
- Bedroom: 150 sq ft
- Bathroom: 50 sq ft
- Kitchen: 200 sq ft
- Living room: 250 sq ft
- Dining room: 180 sq ft
- Hallway: 100 sq ft
- Office: 120 sq ft
- Basement: 400 sq ft
- Garage: 300 sq ft
- Foyer: 80 sq ft
- Closet: 40 sq ft
- Laundry: 60 sq ft

## Confidence scoring (0–100)
- Base: 50
- +20 if explicit sq ft measurement provided
- +10 if sq ft estimated from room count
- +10 if explicit prep level mentioned
- +5 each for: labor hours mentioned, material cost mentioned, trim explicitly stated, ceiling explicitly stated
- −20 if no sq ft could be determined at all

Return null for any field that cannot be reasonably inferred.`;

const SCOPE_TOOL: Anthropic.Tool = {
  name: "translate_scope",
  description: "Parse free-text customer notes into structured painting estimate fields",
  input_schema: {
    type: "object" as const,
    properties: {
      sq_ft: {
        description: "Total wall surface area in sq ft, or null if not determinable",
        oneOf: [{ type: "integer", minimum: 1 }, { type: "null" }],
      },
      prep_level: {
        description: "Surface prep level 1-10, or null if not determinable",
        oneOf: [{ type: "integer", minimum: 1, maximum: 10 }, { type: "null" }],
      },
      includes_trim: { type: "boolean" },
      includes_ceiling: { type: "boolean" },
      labor_hours_estimate: {
        description: "Estimated labor hours, or null if not mentioned",
        oneOf: [{ type: "number", minimum: 0 }, { type: "null" }],
      },
      material_cost_cents: {
        description: "Material cost in cents, or null if not mentioned",
        oneOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
      },
      suggested_job_type: {
        type: "string",
        enum: ["painting", "maintenance", "repair", "custom"],
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Confidence in the parsed output (0-100)",
      },
      parsed_items: {
        type: "array",
        items: { type: "string" },
        description: "Each piece of data extracted and its source",
      },
      warnings: {
        type: "array",
        items: { type: "string" },
        description: "Assumptions or ambiguities the estimator should verify",
      },
    },
    required: [
      "sq_ft",
      "prep_level",
      "includes_trim",
      "includes_ceiling",
      "labor_hours_estimate",
      "material_cost_cents",
      "suggested_job_type",
      "confidence",
      "parsed_items",
      "warnings",
    ],
    additionalProperties: false,
  },
};

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function translateScope(notes: string): Promise<ScopeTranslation> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return translateScopeRuleBased(notes);
  }
  try {
    const client = getClient();
    const response = await client.messages
      .stream({
        model: "claude-opus-4-7",
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ] as Anthropic.TextBlockParam[],
        tools: [SCOPE_TOOL],
        tool_choice: { type: "tool", name: "translate_scope" },
        messages: [
          {
            role: "user",
            content: `Parse the following customer notes into structured estimate fields:\n\n${notes}`,
          },
        ],
      })
      .finalMessage();

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("No tool_use block in scope response");
    return toolUse.input as ScopeTranslation;
  } catch (err) {
    console.error("[translateScope] Claude API error, falling back to rule-based:", err);
    return translateScopeRuleBased(notes);
  }
}

// ---------------------------------------------------------------------------
// Rule-based fallback (used when ANTHROPIC_API_KEY is unset or API errors)
// ---------------------------------------------------------------------------

const ROOM_SQ_FT: Record<string, number> = {
  bedroom: 150,
  bathroom: 50,
  kitchen: 200,
  "living room": 250,
  "dining room": 180,
  hallway: 100,
  office: 120,
  basement: 400,
  garage: 300,
  foyer: 80,
  closet: 40,
  laundry: 60,
};

const HIGH_PREP_KEYWORDS = [
  "patch", "repair", "sand", "prime", "water damage", "peeling",
  "crack", "hole", "strip", "remove", "old paint", "lead",
  "mildew", "mold", "stain", "smoke", "fire damage",
  "wallpaper", "textured", "popcorn", "rough",
];

const LOW_PREP_KEYWORDS = [
  "fresh", "new construction", "touch up", "refresh", "coat",
  "same color", "repaint", "maintenance",
];

const TRIM_KEYWORDS = [
  "trim", "baseboard", "crown", "molding", "wainscot", "door frame",
  "window frame", "casing", "chair rail",
];

const CEILING_KEYWORDS = ["ceiling", "ceilings", "overhead", "above"];

function translateScopeRuleBased(notes: string): ScopeTranslation {
  const lower = notes.toLowerCase();
  const parsedItems: string[] = [];
  const warningsList: string[] = [];

  let sq_ft: number | null = null;

  const sqFtMatch = lower.match(/(\d[\d,]*)\s*(?:sq\s*(?:ft|feet)?|square\s*feet)/i);
  if (sqFtMatch) {
    sq_ft = parseInt(sqFtMatch[1].replace(/,/g, ""), 10);
    parsedItems.push(`${sq_ft.toLocaleString()} sq ft from direct measurement`);
  }

  if (sq_ft === null) {
    let totalSqFt = 0;
    let roomCount = 0;

    for (const [room, area] of Object.entries(ROOM_SQ_FT)) {
      const countMatch = lower.match(new RegExp(`(\\d+)?\\s*${room}s?\\b`, "i"));
      if (countMatch) {
        const count = countMatch[1] ? parseInt(countMatch[1], 10) : 1;
        totalSqFt += area * count;
        roomCount += count;
        parsedItems.push(`${count}x ${room} (${area} sq ft each = ${(area * count).toLocaleString()} sq ft)`);
      }
    }

    if (totalSqFt > 0) {
      sq_ft = totalSqFt;
      warningsList.push("Sq ft estimated from room count — verify exact measurements with client.");
    }
  }

  let prep_level: number | null = null;

  const prepMatch = lower.match(/(?:prep(?:aration)?\s*(?:level)?)\s*(\d)/i);
  if (prepMatch) {
    prep_level = Math.max(1, Math.min(10, parseInt(prepMatch[1], 10)));
    parsedItems.push(`Prep level ${prep_level} from explicit mention`);
  }

  if (prep_level === null) {
    const highPrepCount = HIGH_PREP_KEYWORDS.filter((k) => lower.includes(k)).length;
    const lowPrepCount = LOW_PREP_KEYWORDS.filter((k) => lower.includes(k)).length;

    if (highPrepCount >= 2) {
      prep_level = 7;
      parsedItems.push(`Prep level 7 (heavy repair keywords: ${highPrepCount} found)`);
    } else if (highPrepCount === 1) {
      prep_level = 5;
      parsedItems.push("Prep level 5 (moderate repair keywords found)");
    } else if (lowPrepCount >= 1) {
      prep_level = 3;
      parsedItems.push("Prep level 3 (light touch-up keywords found)");
    } else {
      prep_level = 5;
      parsedItems.push("Prep level 5 (default — no prep keywords detected)");
    }
  }

  const includes_trim = TRIM_KEYWORDS.some((k) => lower.includes(k));
  if (includes_trim) {
    const found = TRIM_KEYWORDS.filter((k) => lower.includes(k));
    parsedItems.push(`Trim included (keywords: ${found.join(", ")})`);
  }

  const includes_ceiling = CEILING_KEYWORDS.some((k) => lower.includes(k));
  if (includes_ceiling) {
    parsedItems.push("Ceiling included");
  }

  let labor_hours_estimate: number | null = null;
  const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  if (hoursMatch) {
    labor_hours_estimate = parseFloat(hoursMatch[1]);
    parsedItems.push(`${labor_hours_estimate} hours estimated`);
  }

  let material_cost_cents: number | null = null;
  const costMatch = lower.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (costMatch) {
    material_cost_cents = Math.round(parseFloat(costMatch[1].replace(/,/g, "")) * 100);
    parsedItems.push(`$${(material_cost_cents / 100).toFixed(2)} material cost from text`);
  }

  const hasPaintingKeywords = ["paint", "painting", "coat", "primer", "color", "stain"].some(
    (k) => lower.includes(k)
  );
  const suggested_job_type = hasPaintingKeywords ? "painting" : "custom";

  let confidence = 50;
  if (sqFtMatch) confidence += 20;
  else if (sq_ft !== null) confidence += 10;
  if (prepMatch) confidence += 10;
  if (labor_hours_estimate !== null) confidence += 5;
  if (material_cost_cents !== null) confidence += 5;
  if (includes_trim) confidence += 5;
  if (includes_ceiling) confidence += 5;

  if (sq_ft === null) {
    warningsList.push("Could not determine square footage. Please provide room sizes or count.");
    confidence -= 20;
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    sq_ft,
    prep_level,
    includes_trim,
    includes_ceiling,
    labor_hours_estimate,
    material_cost_cents,
    suggested_job_type,
    confidence,
    parsed_items: parsedItems,
    warnings: warningsList,
  };
}
