import Anthropic from "@anthropic-ai/sdk";
import { ASSESSMENT_TRADE_LABELS, type AssessmentSummary, type AssessmentTradeKey } from "@ai-fsm/domain";

/**
 * A materials-generation failure with a user-facing reason and HTTP status.
 * The route surfaces these directly so the caller sees *why* it failed
 * (not configured, scope too large, key rejected) instead of one opaque 500.
 */
export class MaterialsGenerationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number
  ) {
    super(message);
    this.name = "MaterialsGenerationError";
  }
}

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
  /** Judgement calls the estimator made (item counts inferred, design assumed, …). */
  assumptions: string[];
  /** Measurements the assessment is missing that would sharpen the estimate. */
  missing_measurements: string[];
  /** Materials the customer is supplying — deliberately left off the purchase list. */
  excluded_customer_supplied_items: string[];
}

export interface GenerateMaterialsInput {
  scope: string;
  job_type: string;
  rooms?: RoomMeasurement[];
  saved_materials?: SavedMaterial[];
  // account-level pricing preferences
  material_markup_pct?: number;
  /**
   * Canonical site assessment, when this estimate is assessment-driven. When
   * present it is the source of truth: room notes, prep notes, site conditions,
   * and customer-supplied materials all feed the materials list (TASK-018).
   */
  assessmentSummary?: AssessmentSummary;
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
- Generate a maximum of 25 line items — consolidate where sensible

## Working from a site assessment
When a "Site assessment" section is provided, treat it as the source of truth — it is what the tradesperson observed on site. Build the materials list from the assessment, not from a generic reading of the job type:
- Convert assessment observations into concrete material needs. Room notes describe real work — turn them into consumables (e.g. "patch 3 drywall holes" → spackle, sanding sponge, primer; "replace 3 can lights" → LED retrofit trims, wire nuts).
- Honor site conditions: lead paint risk → containment/encapsulation supplies; difficult access → note it; pets on site → no exclusions unless materials are affected.
- Do NOT include customer-supplied materials as Dovetails purchase items. If the scope, customer-supplied list, or a room note says the customer is providing something (e.g. "customer supplies paint"), leave it off the purchase list and record it in excluded_customer_supplied_items.
- Flag missing measurements instead of guessing silently. If a quantity depends on a measurement the assessment didn't capture (no dimensions for a room you must paint, unknown linear feet of trim), still give a best-effort line marked "estimated", and add a plain-language note to missing_measurements describing what to measure.
- Keep calculated and estimated quantities separate via the confidence field, and list the judgement calls you made in assumptions.`;

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
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Judgement calls made when the assessment was incomplete (item counts inferred, design choices assumed). Empty array if none.",
      },
      missing_measurements: {
        type: "array",
        items: { type: "string" },
        description: "Measurements the assessment did not capture that would sharpen the estimate, in plain language (e.g. 'ceiling height for the living room'). Empty array if none.",
      },
      excluded_customer_supplied_items: {
        type: "array",
        items: { type: "string" },
        description: "Materials the customer is supplying themselves, deliberately left off the purchase list. Empty array if none.",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Matcher: link generated items to saved price book entries
// ---------------------------------------------------------------------------

export function matchToSaved(
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
// User message builder (pure — unit tested)
// ---------------------------------------------------------------------------

function roomContextLines(rooms: RoomMeasurement[] | undefined): string | null {
  if (!rooms || rooms.length === 0) return null;
  const lines = rooms
    .filter((r) => r.name || r.length_ft)
    .map((r) => {
      const dims =
        r.length_ft && r.width_ft
          ? `${r.length_ft}ft × ${r.width_ft}ft${r.height_ft ? ` × ${r.height_ft}ft ceiling` : ""} = ${(r.length_ft * r.width_ft).toFixed(0)} sqft floor`
          : "(dimensions not recorded)";
      return `- ${r.name || "Area"}: ${dims}${r.notes ? ` — ${r.notes}` : ""}`;
    });
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Build the user message for the materials generator. When an assessment
 * summary is present it becomes the primary, source-of-truth context block;
 * otherwise the message falls back to the plain scope + room measurements.
 * Pure so it can be unit-tested without calling Claude.
 */
export function buildMaterialsUserMessage(input: GenerateMaterialsInput): string {
  const a = input.assessmentSummary;
  const roomContext = roomContextLines(input.rooms);
  const markupLine = input.material_markup_pct
    ? `\nNote: owner applies ${input.material_markup_pct}% markup to material costs.`
    : "";

  if (!a) {
    return [
      `Job type: ${input.job_type}`,
      `Scope: ${input.scope}`,
      roomContext ? `\nRoom measurements:\n${roomContext}` : "",
      markupLine,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Assessment-driven: lead with the assessment as the source of truth.
  const conditions: string[] = [];
  if (a.hasPets) conditions.push("pets on site");
  if (a.difficultAccess) conditions.push("difficult access");
  if (a.asbestosRisk) conditions.push("asbestos risk");
  if (a.leadPaintRisk) conditions.push("lead paint risk");

  const tradeLines = (Object.keys(ASSESSMENT_TRADE_LABELS) as AssessmentTradeKey[])
    .map((t) => {
      const note = (a.tradeNotes?.[t] ?? "").trim();
      return note ? `- ${ASSESSMENT_TRADE_LABELS[t]}: ${note}` : null;
    })
    .filter(Boolean) as string[];

  const sections: string[] = [
    `Job type: ${input.job_type}`,
    `## Site assessment (source of truth)`,
    (a.scopeNotes ?? "").trim() || input.scope,
  ];

  if (a.workItems.length > 0) {
    sections.push(`Work items:\n${a.workItems.map((w) => `- ${w}`).join("\n")}`);
  }
  if (roomContext) sections.push(`Rooms / areas:\n${roomContext}`);
  if (a.totalSqft && a.totalSqft > 0) sections.push(`Total area: ${Math.round(a.totalSqft)} sqft`);
  if ((a.prepNotes ?? "").trim()) sections.push(`Prep requirements: ${a.prepNotes!.trim()}`);
  if (tradeLines.length > 0) sections.push(`Trade notes:\n${tradeLines.join("\n")}`);
  if (conditions.length > 0) sections.push(`Site conditions: ${conditions.join("; ")}`);
  if ((a.accessNotes ?? "").trim()) sections.push(`Access: ${a.accessNotes!.trim()}`);
  if ((a.customerSuppliedMaterials ?? "").trim()) {
    sections.push(
      `Customer-supplied materials (DO NOT include as purchase items — list in excluded_customer_supplied_items): ${a.customerSuppliedMaterials!.trim()}`
    );
  }
  if (markupLine) sections.push(markupLine.trim());

  return sections.filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export async function generateMaterials(
  input: GenerateMaterialsInput
): Promise<MaterialsResult> {
  // Unlike the other AI helpers (scope, review, item-suggester), the materials
  // generator has no rule-based fallback — it genuinely needs the model. If the
  // key is missing, fail with a clear, user-facing reason instead of letting the
  // SDK throw an opaque error the route flattens into a generic 500.
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new MaterialsGenerationError(
      "AI estimating isn't configured yet — set ANTHROPIC_API_KEY to enable the materials generator.",
      "AI_NOT_CONFIGURED",
      503
    );
  }

  const client = new Anthropic();

  const userMessage = buildMaterialsUserMessage(input);

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      // Output headroom for a full 25-item list plus the assumptions /
      // missing_measurements / excluded arrays. History: 2048 then 4096 both
      // truncated mid-JSON on richer, whole-house assessments (a real whole-house
      // job needs ~4700 output tokens), surfacing as a 500 / "truncated" reject.
      // 8192 clears that with margin; Sonnet supports far more if needed.
      max_tokens: 8192,
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
  } catch (err) {
    // A rejected/expired key is a configuration problem, not a transient one —
    // tell the caller plainly rather than burying it in a generic 500.
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      throw new MaterialsGenerationError(
        "The Anthropic API key was rejected — double-check ANTHROPIC_API_KEY.",
        "AI_AUTH_FAILED",
        502
      );
    }
    throw err;
  }

  // A max_tokens stop means generation was cut off — even when the tool call
  // already emitted a valid `items` array, the response is truncated (e.g.
  // mid summary_notes or the metadata arrays). Reject it before trusting any
  // part of the payload rather than returning a partial materials list.
  if (response.stop_reason === "max_tokens") {
    throw new MaterialsGenerationError(
      "The materials list was too long to finish — try a narrower scope or fewer rooms.",
      "RESULT_TRUNCATED",
      422
    );
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new MaterialsGenerationError(
      "The AI didn't return a materials list — please try again.",
      "NO_RESULT",
      502
    );
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
    assumptions?: string[];
    missing_measurements?: string[];
    excluded_customer_supplied_items?: string[];
  };

  const cleanList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "") : [];

  // Defensive: a non-truncated response should always carry an items array
  // (max_tokens is already handled above), but never throw a TypeError on `.map`.
  if (!Array.isArray(raw.items)) {
    throw new MaterialsGenerationError(
      "The AI returned an unexpected materials payload — please try again.",
      "NO_RESULT",
      502
    );
  }

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
    assumptions: cleanList(raw.assumptions),
    missing_measurements: cleanList(raw.missing_measurements),
    excluded_customer_supplied_items: cleanList(raw.excluded_customer_supplied_items),
  };
}
