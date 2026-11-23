/**
 * Estimate review (TASK-195), built on the hourly baseline (TASK-194).
 *
 * Input: the baseline result, every line with its hours and source, the billing
 * method, prepared-scope gaps and the rates from Settings. No $/sq ft rules and
 * no hard-coded rates. Runs only when the owner asks; the route stores the result.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { materialLineCents, type BaselineResult, type PreparedScope } from "@ai-fsm/domain";

/** Kept as it was before this rewrite (runbook B6: keep the current model ID). */
export const REVIEW_MODEL = "claude-opus-4-7";

const FIELDS = ["hours", "materials", "pricing", "baseline", "scope", "questions", "line_items", "notes"] as const;

const suggestionSchema = z.object({
  type: z.enum(["warning", "info", "tip"]),
  field: z.enum(FIELDS),
  message: z.string().min(1),
  suggestion: z.string(),
});

export const reviewResultSchema = z.object({
  suggestions: z.array(suggestionSchema),
  score: z.number().int().min(0).max(100),
  summary: z.string().min(1),
});

export type EstimateReviewSuggestion = z.infer<typeof suggestionSchema>;
export type EstimateReviewResult = z.infer<typeof reviewResultSchema>;

export interface ReviewLine {
  type: "labor" | "materials" | "equipment" | "handling_fee" | "adjustment";
  description: string;
  quantity: number;
  price_cents: number;
  cost_cents: number | null;
  hours_low: number | null;
  hours_high: number | null;
  hours_source: string | null;
}

export interface PreparedGaps {
  /** Areas whose confirmed work has hours but no materials price (null, not $0). */
  hours_without_materials_price: string[];
  /** Suggested tasks the owner has not confirmed. */
  unconfirmed_tasks: string[];
  /** Questions with no answer yet. */
  open_questions: string[];
}

export interface ReviewInput {
  billing_method: "time_and_materials" | "fixed_price" | "itemized" | "flat_price" | "option_quote";
  /** Selling total before tax. */
  quoted_cents: number;
  rates: {
    sell_rate_cents: number;
    cost_floor_cents: number;
    handling_pct: number;
    warning_pct: number;
    handling_in_baseline: boolean;
  };
  /** Null for option quotes (no combined baseline, TASK-183). */
  baseline: BaselineResult | null;
  lines: ReviewLine[];
  prepared_gaps: PreparedGaps | null;
  notes: string | null;
}

export class ReviewFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewFailedError";
  }
}

export function preparedScopeGaps(scope: PreparedScope): PreparedGaps {
  const confirmed = scope.tasks.filter((t) => t.confirmed);
  const itemized = scope.materials ?? {};
  const hoursWithoutMaterials = scope.groups
    .filter((group) => {
      const tasks = confirmed.filter((t) => t.group_key === group.key);
      const hasHours = tasks.some((t) => t.hours_high != null && t.hours_high > 0);
      if (!hasHours) return false;
      const list = itemized[group.key];
      const priced = list
        ? list.lines.some((line) => materialLineCents(line) !== null)
        : tasks.some((t) => t.materials_cents !== null);
      return !priced;
    })
    .map((group) => group.label);
  return {
    hours_without_materials_price: hoursWithoutMaterials,
    unconfirmed_tasks: scope.tasks.filter((t) => t.kind === "suggested" && !t.confirmed).map((t) => t.description),
    open_questions: scope.questions.filter((q) => !q.answer || !q.answer.trim()).map((q) => q.text),
  };
}

// ---------------------------------------------------------------------------
// Prompt and tool (static: cached as a prefix)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You review estimates for Dovetails Services LLC, a residential handyman and home maintenance business. The owner reads your review before sending an estimate to a customer.

Every estimate arrives as JSON with:
- billing_method: time_and_materials, fixed_price, itemized, flat_price or option_quote.
- quoted_cents: the selling total before tax.
- rates: the company's selling rate per hour, its labor cost floor per hour, the handling percent on materials, the warning threshold, and whether handling is in the baseline. These come from the owner's Settings. Use them; never assume other rates.
- baseline: the hourly baseline already worked out by the app. hours (low, mid, high person-hours), baseline (what the work comes to at the selling rate plus materials cost, handling when on, equipment and travel charges), gapCents and gapPct (quoted price minus the baseline midpoint), effectiveRateCents (labor left after direct costs divided by high hours), belowCostFloor, warning, and missing (hours or costs not entered). Null means not available. Treat these numbers as correct; do not recompute them.
- lines: every line with type, description, quantity, price, cost, hours and where the hours came from (owner, price_book, production_rate, ai_allowance, revision, travel_calc).
- prepared_gaps: from the walkthrough. Areas whose work has hours but no materials price, suggested tasks not yet confirmed, and unanswered questions. Null when the estimate was not prepared from a walkthrough.

What to check:
1. Missing information: lines or areas without hours, materials or equipment without a cost, direct costs not confirmed. Name each one.
2. Every area in prepared_gaps.hours_without_materials_price: name it, and say its materials are not priced.
3. The price against the baseline: a gap below zero, and whether the labor rate after costs is below the cost floor. Use dollars.
4. Hours that look thin or heavy for the work described, and hours that came from an AI estimate rather than the owner or the price book.
5. Scope: unconfirmed tasks, unanswered questions, work that is described but has no line.

Rules:
- Work only from the input. Do not ask for, estimate or mention square footage or per-square-foot rates.
- Be specific: name the line or area and give dollar amounts.
- Do not suggest a new total price. The owner sets the price.
- Score: start at 100, take off 20 for each warning and 5 for each info item; tips cost nothing; never below 0.
- field must be one of: ${FIELDS.join(", ")}.

Return the review by calling review_estimate.`;

const REVIEW_TOOL: Anthropic.Tool = {
  name: "review_estimate",
  description: "Return the structured review of the estimate: suggestions, a 0-100 score and a one or two sentence summary.",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["warning", "info", "tip"] },
            field: { type: "string", enum: [...FIELDS] },
            message: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["type", "field", "message", "suggestion"],
          additionalProperties: false,
        },
      },
      score: { type: "integer", minimum: 0, maximum: 100 },
      summary: { type: "string" },
    },
    required: ["suggestions", "score", "summary"],
    additionalProperties: false,
  },
};

export function buildReviewMessage(input: ReviewInput): string {
  return `Review this estimate.\n\n${JSON.stringify(input, null, 2)}`;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

/**
 * AI review. Throws ReviewFailedError on a cut-off, refused or malformed
 * response, so nothing partial is stored. The caller decides the fallback.
 */
export async function reviewEstimate(input: ReviewInput, client: Anthropic = getClient()): Promise<EstimateReviewResult> {
  const response = await client.messages
    .stream({
      model: REVIEW_MODEL,
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "review_estimate" },
      messages: [{ role: "user", content: buildReviewMessage(input) }],
    })
    .finalMessage();

  if (response.stop_reason === "max_tokens") {
    throw new ReviewFailedError("The review was cut off before it finished.");
  }
  if (response.stop_reason === "refusal") {
    throw new ReviewFailedError("The review was declined.");
  }
  const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (!toolUse) throw new ReviewFailedError("The review returned no result.");
  const parsed = reviewResultSchema.safeParse(toolUse.input);
  if (!parsed.success) throw new ReviewFailedError("The review result was not in the expected shape.");
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Rule-based review (no API key): the same checks, without judgment calls
// ---------------------------------------------------------------------------

const dollars = (cents: number) =>
  `$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function list(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function ruleBasedReview(input: ReviewInput): EstimateReviewResult {
  const suggestions: EstimateReviewSuggestion[] = [];
  const b = input.baseline;

  if (b) {
    const hoursMissing = b.missing.filter((m) => m.kind === "hours");
    if (hoursMissing.length > 0) {
      const names = hoursMissing.map((m) => (m.lineIndex != null ? input.lines[m.lineIndex]?.description : "the estimate"));
      suggestions.push({
        type: "warning",
        field: "hours",
        message: `Person-hours are missing for ${list(names.map((n) => n ?? "a line"))}.`,
        suggestion: "Enter a low and high range so the baseline can be worked out.",
      });
    }
    const costsMissing = b.missing.filter((m) => m.kind === "cost");
    if (costsMissing.length > 0) {
      suggestions.push({
        type: "warning",
        field: "materials",
        message: `No cost entered for ${list(costsMissing.map((m) => input.lines[m.lineIndex ?? -1]?.description ?? "a line"))}.`,
        suggestion: "Enter what each one costs you.",
      });
    }
    if (b.missing.some((m) => m.kind === "other_direct")) {
      suggestions.push({
        type: "info",
        field: "baseline",
        message: "Other direct costs are not confirmed.",
        suggestion: "Confirm mileage, disposal or permit costs, or $0.",
      });
    }
    if (b.belowCostFloor && b.effectiveRateCents != null) {
      suggestions.push({
        type: "warning",
        field: "pricing",
        message: `After costs this pays ${dollars(b.effectiveRateCents)}/h, below your ${dollars(input.rates.cost_floor_cents)}/h cost floor.`,
        suggestion: "Check the hours and the price before sending.",
      });
    }
    if (b.gapCents != null && b.gapCents < 0 && b.gapPct != null) {
      suggestions.push({
        type: b.warning === "strong" ? "warning" : "info",
        field: "baseline",
        message: `The price is ${dollars(b.gapCents)} (${Math.abs(b.gapPct).toFixed(2)}%) below the hourly baseline midpoint.`,
        suggestion: "Make sure the lower price is deliberate.",
      });
    }
  }

  const aiHours = input.lines.filter((l) => l.hours_source === "ai_allowance");
  if (aiHours.length > 0) {
    suggestions.push({
      type: "tip",
      field: "hours",
      message: `${aiHours.length} line${aiHours.length > 1 ? "s use" : " uses"} AI-estimated hours.`,
      suggestion: "Check them against your own pace before sending.",
    });
  }

  const gaps = input.prepared_gaps;
  if (gaps) {
    if (gaps.hours_without_materials_price.length > 0) {
      suggestions.push({
        type: "warning",
        field: "materials",
        message: `${list(gaps.hours_without_materials_price)} ${gaps.hours_without_materials_price.length > 1 ? "have" : "has"} hours but no materials price.`,
        suggestion: "Price their materials, or confirm none are needed.",
      });
    }
    if (gaps.open_questions.length > 0) {
      suggestions.push({
        type: "info",
        field: "questions",
        message: `Unanswered: ${gaps.open_questions.join(" ")}`,
        suggestion: "Answer these before the estimate goes out.",
      });
    }
    if (gaps.unconfirmed_tasks.length > 0) {
      suggestions.push({
        type: "info",
        field: "scope",
        message: `Suggested work not confirmed: ${list(gaps.unconfirmed_tasks)}.`,
        suggestion: "Confirm or remove each one.",
      });
    }
  }

  const warnings = suggestions.filter((s) => s.type === "warning").length;
  const infos = suggestions.filter((s) => s.type === "info").length;
  return {
    suggestions,
    score: Math.max(0, 100 - warnings * 20 - infos * 5),
    summary: warnings === 0 && infos === 0
      ? "No problems found in the hours, costs or price."
      : `${warnings} warning${warnings === 1 ? "" : "s"} and ${infos} note${infos === 1 ? "" : "s"} to look at.`,
  };
}
