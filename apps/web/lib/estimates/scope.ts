/**
 * Rule-based scope translator.
 *
 * Parses free-text customer notes into structured estimate fields.
 * Designed to be swapped for an LLM backend later.
 */

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

const CEILING_KEYWORDS = [
  "ceiling", "ceilings", "overhead", "above",
];

export function translateScope(notes: string): ScopeTranslation {
  const lower = notes.toLowerCase();
  const parsedItems: string[] = [];
  const warningsList: string[] = [];

  // --- Parse sq_ft ---
  let sq_ft: number | null = null;

  // Direct number: "1200 sq ft", "1,200 sqft", "1200 square feet"
  const sqFtMatch = lower.match(/(\d[\d,]*)\s*(?:sq\s*(?:ft|feet)?|square\s*feet)/i);
  if (sqFtMatch) {
    sq_ft = parseInt(sqFtMatch[1].replace(/,/g, ""), 10);
    parsedItems.push(`${sq_ft.toLocaleString()} sq ft from direct measurement`);
  }

  // Room-based estimation
  if (sq_ft === null) {
    let totalSqFt = 0;
    let roomCount = 0;

    for (const [room, area] of Object.entries(ROOM_SQ_FT)) {
      // Match patterns like "3 bedrooms", "2 bathrooms", "the kitchen"
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
      if (roomCount === 0 && !sqFtMatch) {
        warningsList.push("Room types detected but sq ft is estimated. Verify with client.");
      }
    }
  }

  // --- Parse prep_level ---
  let prep_level: number | null = null;

  // Direct number: "prep level 6", "prep 7", "level 8"
  const prepMatch = lower.match(/(?:prep(?:aration)?\s*(?:level)?)\s*(\d)/i);
  if (prepMatch) {
    prep_level = Math.max(1, Math.min(10, parseInt(prepMatch[1], 10)));
    parsedItems.push(`Prep level ${prep_level} from explicit mention`);
  }

  // Keyword-based estimation
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

  // --- Parse trim ---
  const includes_trim = TRIM_KEYWORDS.some((k) => lower.includes(k));
  if (includes_trim) {
    const found = TRIM_KEYWORDS.filter((k) => lower.includes(k));
    parsedItems.push(`Trim included (keywords: ${found.join(", ")})`);
  }

  // --- Parse ceiling ---
  const includes_ceiling = CEILING_KEYWORDS.some((k) => lower.includes(k));
  if (includes_ceiling) {
    parsedItems.push("Ceiling included");
  }

  // --- Parse labor hours ---
  let labor_hours_estimate: number | null = null;
  const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/i);
  if (hoursMatch) {
    labor_hours_estimate = parseFloat(hoursMatch[1]);
    parsedItems.push(`${labor_hours_estimate} hours estimated`);
  }

  // --- Parse material cost ---
  let material_cost_cents: number | null = null;
  // Match patterns like "$350", "$350.00", "about $350"
  const costMatch = lower.match(/\$([\d,]+(?:\.\d{2})?)/);
  if (costMatch) {
    material_cost_cents = Math.round(parseFloat(costMatch[1].replace(/,/g, "")) * 100);
    parsedItems.push(`$${(material_cost_cents / 100).toFixed(2)} material cost from text`);
  }

  // --- Determine job type ---
  const hasPaintingKeywords = [
    "paint", "painting", "coat", "primer", "color", "stain",
  ].some((k) => lower.includes(k));

  const suggested_job_type = hasPaintingKeywords ? "painting" : "custom";

  // --- Confidence scoring ---
  let confidence = 50; // Base confidence
  if (sqFtMatch) confidence += 20; // Direct sq ft measurement
  else if (sq_ft !== null) confidence += 10; // Room-based estimation
  if (prepMatch) confidence += 10; // Explicit prep level
  if (labor_hours_estimate !== null) confidence += 5;
  if (material_cost_cents !== null) confidence += 5;
  if (includes_trim) confidence += 5;
  if (includes_ceiling) confidence += 5;
  confidence = Math.min(100, confidence);

  if (sq_ft === null) {
    warningsList.push("Could not determine square footage. Please provide room sizes or count.");
    confidence -= 20;
  }

  confidence = Math.max(0, confidence);

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
