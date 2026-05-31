/**
 * Dovetails Services LLC — AI Estimate Interview Agent types.
 *
 * These types describe the state of an in-progress estimate interview.
 * They are display-only — they do NOT drive pricing.
 * All pricing goes through structured_description → draftEstimate().
 */

export interface InterviewRoom {
  name: string;
  dimensions?: { l: number; w: number; h: number };
  doors?: number;
  windows?: number;
  include_ceiling?: boolean;
  include_trim?: boolean;
  prep_level?: string;
  primer?: boolean;
  paint_supply?: "dovetails" | "customer";
}

export interface InterviewFixture {
  type: string;    // e.g. "ceiling fan", "faucet", "toilet"
  count: number;
  customer_supply?: boolean;
  notes?: string;
}

/**
 * Facts extracted from the conversation so far.
 * Used for display in the interview progress sidebar.
 * Never used for pricing calculations.
 */
export interface ExtractedFacts {
  job_types: string[];                  // e.g. ["painting", "handyman"]
  rooms?: InterviewRoom[];
  fixtures?: InterviewFixture[];
  area_sqft?: number;                   // for flooring / drywall
  special_conditions?: string[];        // e.g. "dark-to-light", "fan-rated box needed"
  confidence: number;                   // 0–100 (AI's self-assessed readiness)
}

/** Single message in the interview conversation */
export interface InterviewMessage {
  role: "user" | "assistant";
  content: string;
}

/** Response from a single interview turn */
export interface InterviewTurnResult {
  reply: string;
  phase: "interviewing" | "ready";
  structured_description?: string;   // rich description for draftEstimate(); only when phase="ready"
  extracted_facts?: ExtractedFacts;
}
