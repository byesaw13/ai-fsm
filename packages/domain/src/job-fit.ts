// Computes a 0-100 "job fit" score for a booking request — how well it
// aligns with Dovetails' core competencies (handyman + woodworking).
// Pure function; uses only data already stored on booking_requests.

export interface JobFitResult {
  score: number;       // 0-100
  label: "Strong fit" | "Good fit" | "Moderate fit" | "Low fit";
  reasons: string[];   // up to 3 key drivers, positive or negative
}

// Base fit by service category
const BASE_FIT: Record<string, number> = {
  carpentry_furniture: 90,  // core woodworking competency
  mounting_installs:   85,  // quick, clean revenue
  maintenance_small:   80,  // repeat business, easy scope
  general_repairs:     75,  // bread and butter
  painting_finishes:   70,  // good margin, well within scope
  specialty_expansion: 62,  // high value but complex
  outdoor_seasonal:    55,  // seasonal, lower margin
  plumbing:            48,  // licensed trade for anything beyond basics
  electrical:          42,  // licensed trade for most work
};

const DEFAULT_BASE = 60;

interface FitModifier {
  delta: number;
  reason: string;
  condition: (input: JobFitInput) => boolean;
}

export type JobFitInput = {
  service_category: string;
  referral_source?: string | null;
  intake_metadata?: Record<string, string> | null;
  walkthrough_score?: number | null;
};

const MODIFIERS: FitModifier[] = [
  // Referral source
  { delta: +15, reason: "realtor referral",      condition: (i) => i.referral_source === "realtor" },
  { delta: +10, reason: "repeat client",          condition: (i) => i.referral_source === "repeat" },
  { delta: +5,  reason: "word-of-mouth referral", condition: (i) => i.referral_source === "friend_neighbor" },

  // Carpentry metadata
  { delta: +10, reason: "custom woodworking build",    condition: (i) => i.intake_metadata?.carpentry_type === "custom_build" },

  // Red flags — outside core competency or licensed scope
  { delta: -30, reason: "electrical safety hazard — licensed electrician needed",
    condition: (i) => i.intake_metadata?.safety_concern === "sparks_smell" },
  { delta: -20, reason: "panel or breaker work — licensed electrician needed",
    condition: (i) => i.intake_metadata?.electrical_type === "panel" },
  { delta: -20, reason: "structural concern — may exceed handyman scope",
    condition: (i) => i.intake_metadata?.structural_concern === "structural" },
  { delta: -10, reason: "active plumbing leak — may need licensed plumber",
    condition: (i) => i.intake_metadata?.issue_type === "leak" },

  // Scope complexity from walkthrough score
  { delta: -10, reason: "high-complexity scope",
    condition: (i) => (i.walkthrough_score ?? 0) >= 80 },
  { delta: +5,  reason: "straightforward scope",
    condition: (i) => (i.walkthrough_score ?? 50) <= 20 },
];

function fitLabel(score: number): JobFitResult["label"] {
  if (score >= 80) return "Strong fit";
  if (score >= 60) return "Good fit";
  if (score >= 40) return "Moderate fit";
  return "Low fit";
}

export function scoreJobFit(input: JobFitInput): JobFitResult {
  const base = BASE_FIT[input.service_category] ?? DEFAULT_BASE;
  const reasons: string[] = [];
  let delta = 0;

  for (const mod of MODIFIERS) {
    if (!mod.condition(input)) continue;
    delta += mod.delta;
    reasons.push(mod.reason);
    if (reasons.length >= 3) break;
  }

  const score = Math.max(0, Math.min(100, base + delta));
  return { score, label: fitLabel(score), reasons };
}
