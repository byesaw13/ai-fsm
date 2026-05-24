// Pure function: determines whether an intake should route to a site visit
// (walkthrough to assess scope) or can proceed directly to a remote estimate.
//
// Score 0–100 represents site-visit probability.
// >= 50 → recommend site visit
//  < 50 → remote estimate likely sufficient

export type RoutingPath = "site_visit" | "remote_estimate";

export interface WalkthroughDecision {
  path: RoutingPath;
  score: number;        // 0–100 site-visit probability
  confidence: number;   // 50–95 confidence in the recommendation
  reasons: string[];
}

// Base site-visit probability by service category
const BASE_SCORES: Record<string, number> = {
  maintenance_small:    20,   // fan, faucet, fixture, disposal, lock — usually remote
  mounting_installs:    15,   // mounting, hanging — usually remote
  general_repairs:      40,   // borderline — depends on description
  plumbing:             50,   // borderline — access and leak type matter
  electrical:           55,   // lean toward site visit — safety stakes
  outdoor_seasonal:     60,   // often unknown conditions
  painting_finishes:    65,   // too many variables without seeing the space
  carpentry_furniture:  70,   // custom or structural work
  specialty_expansion:  70,   // high complexity by definition
};

const DEFAULT_BASE = 50;

interface Signal {
  pattern: RegExp;
  delta: number;   // positive = push toward site visit, negative = push toward remote
  reason: string;
}

const SIGNALS: Signal[] = [
  // Push toward site visit
  { pattern: /structur|rot\b|decay|framing|foundation/i,                           delta: +20, reason: "structural work" },
  { pattern: /panel\b|breaker|wiring|rewir|circuit/i,                               delta: +20, reason: "electrical panel/wiring" },
  { pattern: /burn(ing)?\s+smell|smell(s)?\s+(like|of)\s+(burn|smoke)/i,           delta: +25, reason: "potential safety hazard" },
  { pattern: /hidden\s+leak|behind\s+(wall|ceiling)|drainage\s+issue/i,             delta: +20, reason: "hidden conditions" },
  { pattern: /multiple\s+room|whole\s+house|entire\b|throughout/i,                  delta: +15, reason: "large-scope project" },
  { pattern: /custom\b|built.in|cabinet/i,                                           delta: +15, reason: "custom work" },
  { pattern: /historic|built\s+in\s+\d{2}|19[0-4]\d/i,                             delta: +15, reason: "older home" },
  { pattern: /vaulted|cathedral|tall\s+ceiling/i,                                   delta: +10, reason: "vaulted ceilings" },
  { pattern: /occupied|tenant|furniture\s+(still|in\s+place)|lived.in/i,            delta: +10, reason: "occupied space" },
  { pattern: /don.t know|not\s+sure|unclear|unknown|hard\s+to\s+say/i,              delta: +10, reason: "scope unclear" },
  // Push toward remote estimate
  { pattern: /replace\s+(a\s+)?(ceiling\s+)?fan\b/i,                                delta: -20, reason: "standard fan replacement" },
  { pattern: /replace\s+(a\s+)?faucet/i,                                             delta: -20, reason: "standard faucet replacement" },
  { pattern: /replace\s+(a\s+)?(light\s+)?fixture/i,                                delta: -15, reason: "fixture replacement" },
  { pattern: /replace\s+(a\s+)?(toilet|disposal|garbage\s+disposal)/i,              delta: -20, reason: "standard fixture swap" },
  { pattern: /replace\s+(a\s+)?(outlet|switch|lock|deadbolt|hinge|knob)/i,          delta: -20, reason: "hardware replacement" },
  { pattern: /install\s+(a\s+)?(fan|light|fixture|outlet|switch|smart|ring|nest)/i, delta: -15, reason: "standard install" },
  { pattern: /mount\s+(a\s+)?(tv\b|monitor|screen)/i,                               delta: -15, reason: "TV/screen mounting" },
  { pattern: /pressure\s+wash/i,                                                     delta: -15, reason: "pressure washing" },
  { pattern: /small\s+(patch|hole|crack|drywall)/i,                                  delta: -10, reason: "small repair" },
];

// Short description suggests unclear scope → lean toward site visit
const SHORT_DESCRIPTION_THRESHOLD = 60;
const SHORT_DESCRIPTION_BOOST = 10;

// Metadata signals: key/value answers from branching questions → delta adjustments
interface MetadataSignal {
  key: string;
  values: string[];  // which values trigger this signal
  delta: number;
  reason: string;
}

const METADATA_SIGNALS: MetadataSignal[] = [
  // Painting
  { key: "surface",           values: ["exterior", "both"],       delta: +10, reason: "exterior painting" },
  { key: "room_count",        values: ["4+"],                     delta: +10, reason: "large painting scope" },
  // General repairs
  { key: "structural_concern", values: ["structural"],            delta: +20, reason: "possible structural issue" },
  { key: "structural_concern", values: ["unsure"],                delta: +8,  reason: "structural concern unclear" },
  // Plumbing
  { key: "issue_type",        values: ["leak"],                   delta: +15, reason: "active leak" },
  { key: "issue_type",        values: ["dripping_faucet", "running_toilet", "new_install"], delta: -10, reason: "standard plumbing swap" },
  // Electrical
  { key: "safety_concern",    values: ["sparks_smell"],           delta: +25, reason: "electrical safety hazard" },
  { key: "safety_concern",    values: ["tripping_breakers"],      delta: +15, reason: "recurring breaker trips" },
  { key: "electrical_type",   values: ["panel"],                  delta: +15, reason: "panel work" },
  { key: "electrical_type",   values: ["outlet_switch", "fixture_fan"], delta: -10, reason: "standard electrical swap" },
  // Carpentry
  { key: "carpentry_type",    values: ["custom_build"],           delta: +10, reason: "custom carpentry build" },
  // Specialty
  { key: "project_type",      values: ["addition", "major_renovation"], delta: +15, reason: "large-scope project" },
];

export function scoreSiteVisitProbability(input: {
  service_category: string;
  service_description: string;
  photo_count?: number;
  intake_metadata?: Record<string, string> | null;
}): WalkthroughDecision {
  const base = BASE_SCORES[input.service_category] ?? DEFAULT_BASE;
  const reasons: string[] = [];
  let delta = 0;

  // Apply signal rules (cap total boost and total reduction to ±30)
  let totalBoost = 0;
  let totalReduce = 0;
  for (const signal of SIGNALS) {
    if (!signal.pattern.test(input.service_description)) continue;
    if (signal.delta > 0) {
      const apply = Math.min(signal.delta, 30 - totalBoost);
      if (apply <= 0) continue;
      delta += apply;
      totalBoost += apply;
      reasons.push(signal.reason);
    } else {
      const apply = Math.max(signal.delta, -(30 - totalReduce));
      if (apply >= 0) continue;
      delta += apply;
      totalReduce += Math.abs(apply);
      reasons.push(signal.reason);
    }
  }

  // Metadata signals from branching questions
  if (input.intake_metadata) {
    for (const ms of METADATA_SIGNALS) {
      const val = input.intake_metadata[ms.key];
      if (!val || !ms.values.includes(val)) continue;
      if (ms.delta > 0) {
        const apply = Math.min(ms.delta, 30 - totalBoost);
        if (apply <= 0) continue;
        delta += apply;
        totalBoost += apply;
        reasons.push(ms.reason);
      } else {
        const apply = Math.max(ms.delta, -(30 - totalReduce));
        if (apply >= 0) continue;
        delta += apply;
        totalReduce += Math.abs(apply);
        reasons.push(ms.reason);
      }
    }
  }

  // Short description penalty
  if (input.service_description.trim().length < SHORT_DESCRIPTION_THRESHOLD) {
    const apply = Math.min(SHORT_DESCRIPTION_BOOST, 30 - totalBoost);
    if (apply > 0) {
      delta += apply;
      totalBoost += apply;
      reasons.push("description is brief — scope may need clarification");
    }
  }

  // Photo count reduces uncertainty
  if ((input.photo_count ?? 0) >= 2) {
    const reduce = Math.min(10, 30 - totalReduce);
    if (reduce > 0) {
      delta -= reduce;
      totalReduce += reduce;
      reasons.push("photos provided");
    }
  }

  const score = Math.max(0, Math.min(100, base + delta));
  const path: RoutingPath = score >= 50 ? "site_visit" : "remote_estimate";

  // Confidence: distance from the 50 threshold, scaled to 50–95%
  const distanceFromThreshold = Math.abs(score - 50);
  const confidence = Math.min(95, Math.round(50 + distanceFromThreshold * 0.9));

  // Add the category as the first reason if no signals fired
  if (reasons.length === 0) {
    const categoryLabel = input.service_category.replace(/_/g, " ");
    reasons.unshift(categoryLabel);
  }

  return { path, score, confidence, reasons };
}
