import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RoomMeasurement {
  id: string;
  name: string;
  length_ft: number | null;
  width_ft: number | null;
  height_ft: number | null;
  notes?: string;
}

export interface SavedMaterial {
  id: string;
  name: string;
  brand: string | null;
  category: string;
  unit: string;
  unit_cost_cents: number;
  supplier: string | null;
}

export interface MaterialItem {
  name: string;
  brand: string | null;
  category: string;
  base_quantity: number;
  waste_factor_pct: number;
  quantity: number;           // base_quantity × (1 + waste_factor_pct/100), rounded up to purchasable unit
  unit: string;
  unit_cost_cents: number;    // from saved price book if matched, else Claude estimate
  total_cost_cents: number;
  confidence: "calculated" | "estimated";
  notes: string;              // e.g. "15% waste for end cuts"
  price_book_id: string | null; // non-null if matched from user's saved prices
}

export interface MaterialsResult {
  items: MaterialItem[];
  summary_notes: string;
  total_cost_cents: number;
}

export interface GenerateMaterialsInput {
  scope: string;
  job_type: string;
  rooms?: RoomMeasurement[];
  saved_materials?: SavedMaterial[];
  // account-level pricing preferences
  material_markup_pct?: number;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a materials estimator for Dovetails Services LLC, a handyman and carpentry company in southern New Hampshire and the Merrimack Valley, Massachusetts. Your job is to produce a complete, purchase-ready materials list for a given job scope.

## Your responsibilities
- Calculate base quantities from the measurements provided (pure arithmetic)
- Apply standard trade waste factors — be specific about which factor you applied and why
- Round up to the nearest purchasable unit (you can't buy 0.7 of a gallon or 2.3 boards)
- Estimate realistic current Home Depot / Lowe's prices for each item
- Be specific about product specs: dimensions, grade, coverage rate, finish type
- Separate materials by category: paint, lumber, hardware, concrete, fasteners, sheet_goods, trim, flooring, other

## Standard waste factors (apply these)
- Dimensional lumber (framing, joists, beams): +10% for cuts and rejects, always round up to whole boards
- Decking boards (straight lay): +15% for end cuts and bad boards
- Decking boards (diagonal lay): +20%
- Drywall / sheet goods: +15% for outlet cutouts, doorways, waste
- Flooring / tile (straight lay): +10%
- Flooring / tile (diagonal or herringbone): +15–20%
- Paint: two coats assumed unless stated; deduct 15% of total sqft for doors and windows; coverage 350–400 sqft/gal; add 1 extra quart buffer
- Concrete (tube form footings): +10%, round up to whole bags
- Caulk / adhesive: estimate runs generously — better to have extra
- Primer: only needed on new drywall, bare wood, or drastic color changes; coverage same as paint

## Confidence levels
- "calculated": quantity derived by math from the measurements given (e.g. sqft ÷ coverage rate)
- "estimated": quantity requires judgment when measurements are incomplete or item count depends on design choices

## Pricing guidance
- All prices in USD cents
- Use current big-box retail prices (Home Depot / Lowe's)
- Pressure treated lumber is more expensive than construction grade
- Benjamin Moore Regal Select: ~$72–78/gal. Behr Premium Plus: ~$40–45/gal. Behr Dynasty: ~$55–60/gal. Sherwin Williams Emerald: ~$85–90/gal.
- 2x4x8 SPF stud: ~$5–6. 2x6x8: ~$9–10. 2x8x10: ~$16–18. 5/4x6x12 PT decking: ~$14–16.
- 80lb concrete bag: ~$7–8. 60lb: ~$5.50–6.
- Standard drywall 4x8 sheet: ~$15–18. Moisture resistant: ~$22–25.
- Joist hangers (single): ~$1.50–2 each. Post bases (4x4): ~$12–15 each.
- Generate a maximum of 25 line items — consolidate where sensible`;

const MATERIALS_TOOL: Anthropic.Tool = {
  name: "generate_materials_list",
  description:
    "Generate a complete materials list with quantities (waste-adjusted) and prices for a given job scope and measurements.",
  input_schema: {
    type: "object" as const,
    required: ["items", "summary_notes"],
    properties: {
      items: {
        type: "array",
        maxItems: 25,
        items: {
          type: "object" as const,
          required: [
            "name", "category", "base_quantity", "waste_factor_pct",
            "quantity", "unit", "unit_cost_cents", "confidence", "notes",
          ],
          properties: {
            name:             { type: "string", description: "Specific product name, e.g. '5/4x6x12 pressure treated deck board'" },
            brand:            { type: "string", description: "Brand name if applicable, e.g. 'Behr', 'Simpson Strong-Tie'" },
            category:         { type: "string", enum: ["paint", "lumber", "hardware", "concrete", "fasteners", "sheet_goods", "trim", "flooring", "other"] },
            base_quantity:    { type: "number", description: "Quantity before waste factor" },
            waste_factor_pct: { type: "number", description: "Waste percentage applied, e.g. 15 for 15%" },
            quantity:         { type: "number", description: "Final purchase quantity (base × waste, rounded up to purchasable unit)" },
            unit:             { type: "string", description: "Unit of measure: gallon, board, bag, sheet, box, roll, each, sqft, lf" },
            unit_cost_cents:  { type: "integer", description: "Estimated retail price per unit in cents" },
            confidence:       { type: "string", enum: ["calculated", "estimated"] },
            notes:            { type: "string", description: "Brief explanation: waste factor reason, coverage calculation, or any assumption made" },
          },
        },
      },
      summary_notes: {
        type: "string",
        description: "1–3 sentence summary: total material scope, any items that need measurement confirmation, any items that should be bought after on-site verification",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Matcher: link generated items to saved price book entries
// ---------------------------------------------------------------------------

function matchToSaved(
  item: { name: string; category: string; unit: string },
  saved: SavedMaterial[]
): SavedMaterial | null {
  const nameLower = item.name.toLowerCase();
  for (const s of saved) {
    if (s.category !== item.category) continue;
    if (s.unit !== item.unit) continue;
    const savedName = s.name.toLowerCase();
    // Require at least 4 consecutive words in common (generous but not too loose)
    const nameWords = nameLower.split(/\s+/).filter((w) => w.length > 2);
    const savedWords = savedName.split(/\s+/).filter((w) => w.length > 2);
    const overlap = nameWords.filter((w) => savedWords.includes(w)).length;
    if (overlap >= Math.min(2, nameWords.length)) return s;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateMaterials(
  input: GenerateMaterialsInput
): Promise<MaterialsResult> {
  const client = new Anthropic();

  // Build room context string
  const roomContext =
    input.rooms && input.rooms.length > 0
      ? input.rooms
          .filter((r) => r.name || r.length_ft)
          .map((r) => {
            const dims =
              r.length_ft && r.width_ft
                ? `${r.length_ft}ft × ${r.width_ft}ft${r.height_ft ? ` × ${r.height_ft}ft ceiling` : ""} = ${(r.length_ft * r.width_ft).toFixed(0)} sqft floor`
                : "(dimensions not recorded)";
            return `- ${r.name || "Area"}: ${dims}${r.notes ? ` — ${r.notes}` : ""}`;
          })
          .join("\n")
      : null;

  const userMessage = [
    `Job type: ${input.job_type}`,
    `Scope: ${input.scope}`,
    roomContext ? `\nRoom measurements:\n${roomContext}` : "",
    input.material_markup_pct
      ? `\nNote: owner applies ${input.material_markup_pct}% markup to material costs.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [MATERIALS_TOOL],
    tool_choice: { type: "tool", name: "generate_materials_list" },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a materials list");
  }

  const raw = toolUse.input as {
    items: Array<{
      name: string;
      brand?: string;
      category: string;
      base_quantity: number;
      waste_factor_pct: number;
      quantity: number;
      unit: string;
      unit_cost_cents: number;
      confidence: "calculated" | "estimated";
      notes: string;
    }>;
    summary_notes: string;
  };

  const saved = input.saved_materials ?? [];

  const items: MaterialItem[] = raw.items.map((item) => {
    const match = matchToSaved(item, saved);
    const unitCost = match ? match.unit_cost_cents : item.unit_cost_cents;
    return {
      name: item.name,
      brand: item.brand ?? null,
      category: item.category,
      base_quantity: item.base_quantity,
      waste_factor_pct: item.waste_factor_pct,
      quantity: item.quantity,
      unit: item.unit,
      unit_cost_cents: unitCost,
      total_cost_cents: Math.round(unitCost * item.quantity),
      confidence: item.confidence,
      notes: match
        ? `${item.notes} (price from your price book)`
        : item.notes,
      price_book_id: match ? match.id : null,
    };
  });

  const total_cost_cents = items.reduce((s, i) => s + i.total_cost_cents, 0);

  return {
    items,
    summary_notes: raw.summary_notes,
    total_cost_cents,
  };
}
