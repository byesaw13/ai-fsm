import Anthropic from "@anthropic-ai/sdk";
import {
  PAINTING_RATE_STANDARD_CENTS,
  PREP_LEVEL_MULTIPLIERS,
  PAINTING_TRIM_ADD_CENTS,
} from "@ai-fsm/domain";

export interface EstimateReviewSuggestion {
  type: "warning" | "info" | "tip";
  field: string;
  message: string;
  suggestion: string;
}

export interface EstimateReviewResult {
  suggestions: EstimateReviewSuggestion[];
  score: number; // 0-100, higher = better
  summary: string;
}

interface EstimateInput {
  sq_ft: number | null;
  prep_level: number | null;
  includes_trim: boolean;
  includes_ceiling: boolean;
  subtotal_cents: number;
  total_cents: number;
  internal_labor_cost_cents: number | null;
  internal_material_cost_cents: number | null;
  job_type?: string | null;
  notes?: string | null;
  target_margin_pct?: number | null;
  line_item_count: number;
}

// ---------------------------------------------------------------------------
// Prompt & tool definition (static — cached by Anthropic prefix caching)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert business analyst for Dovetails Services LLC, a painting and general contracting company. Your job is to review estimates and provide clear, actionable feedback.

## Dovetails Pricing Rules

### Painting rates (per sq ft, in cents)
- Standard base rate: ${PAINTING_RATE_STANDARD_CENTS}¢/sq ft ($${(PAINTING_RATE_STANDARD_CENTS / 100).toFixed(2)}/sq ft)
- Trim addon: +${PAINTING_TRIM_ADD_CENTS}¢/sq ft (+$${(PAINTING_TRIM_ADD_CENTS / 100).toFixed(2)}/sq ft of base sq ft)
- Ceiling inclusion: adds 30% to effective surface area (effective_sq_ft = sq_ft × 1.3)

### Prep level multipliers (1–10 scale)
${Object.entries(PREP_LEVEL_MULTIPLIERS).map(([k, v]) => `- Level ${k}: ${v.toFixed(2)}x`).join("\n")}

### Pricing formula
expected_labor = (effective_sq_ft × base_rate × prep_multiplier) + (sq_ft × trim_addon if trim included)
expected_rate_per_sq_ft = expected_labor / sq_ft

### Internal cost calculations
labor_revenue = subtotal_cents − material_cost_cents − (material_cost_cents × 0.15 handling fee)
gross_margin_pct = (labor_revenue − internal_labor_cost) / labor_revenue × 100

### Business targets
- Internal labor rate: $85.00/hr
- Target gross margin: 30% minimum (warn below 30%, critical below 15%)
- Material handling fee: 15% of material cost

## Scoring
Start at 100. Deduct 20 per "warning" type suggestion, 5 per "info" type. Tips do not reduce score. Floor at 0.

## Field names
Use these exact field values in suggestions: "pricing", "margin", "prep_level", "includes_trim", "includes_ceiling", "line_items", "notes", "scope".

Be concise and dollar-specific. Flag issues that would hurt profitability or leave money on the table.`;

const REVIEW_TOOL: Anthropic.Tool = {
  name: "review_estimate",
  description: "Return a structured review of the estimate with suggestions, score, and summary",
  input_schema: {
    type: "object" as const,
    properties: {
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["warning", "info", "tip"] },
            field: { type: "string" },
            message: { type: "string" },
            suggestion: { type: "string" },
          },
          required: ["type", "field", "message", "suggestion"],
          additionalProperties: false,
        },
      },
      score: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Overall estimate quality score (0-100, higher is better)",
      },
      summary: {
        type: "string",
        description: "One or two sentence summary of the review",
      },
    },
    required: ["suggestions", "score", "summary"],
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

export async function reviewEstimate(estimate: EstimateInput): Promise<EstimateReviewResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return reviewEstimateRuleBased(estimate);
  }
  try {
    const client = getClient();
    const response = await client.messages
      .stream({
        model: "claude-opus-4-7",
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ] as Anthropic.TextBlockParam[],
        tools: [REVIEW_TOOL],
        tool_choice: { type: "tool", name: "review_estimate" },
        messages: [
          {
            role: "user",
            content: `Review this estimate and identify all pricing, margin, and scope issues:\n\n${JSON.stringify(estimate, null, 2)}`,
          },
        ],
      })
      .finalMessage();

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) throw new Error("No tool_use block in review response");
    return toolUse.input as EstimateReviewResult;
  } catch (err) {
    console.error("[reviewEstimate] Claude API error, falling back to rule-based:", err);
    return reviewEstimateRuleBased(estimate);
  }
}

// ---------------------------------------------------------------------------
// Rule-based fallback (used when ANTHROPIC_API_KEY is unset or API errors)
// ---------------------------------------------------------------------------

function reviewEstimateRuleBased(estimate: EstimateInput): EstimateReviewResult {
  const suggestions: EstimateReviewSuggestion[] = [];

  const is_painting = estimate.sq_ft !== null && estimate.prep_level !== null;

  if (!is_painting) {
    if (estimate.line_item_count === 0 && estimate.subtotal_cents > 0) {
      suggestions.push({
        type: "info",
        field: "line_items",
        message: "Flat-rate estimate with no line item breakdown.",
        suggestion: "Consider adding line items so the client sees the scope of work.",
      });
    }

    if (estimate.internal_labor_cost_cents !== null && estimate.subtotal_cents > 0) {
      const marginPct = computeMargin(
        estimate.subtotal_cents,
        estimate.internal_labor_cost_cents,
        estimate.internal_material_cost_cents
      );
      const target = estimate.target_margin_pct ?? 30;
      if (marginPct < target) {
        suggestions.push({
          type: "warning",
          field: "margin",
          message: `Gross margin is ${marginPct}% (target: ${target}%).`,
          suggestion: "Consider increasing the price or reducing estimated labor hours.",
        });
      }
    }

    return buildResult(suggestions, "Generic estimate reviewed.");
  }

  const sqFt = estimate.sq_ft!;
  const prepLevel = estimate.prep_level!;
  const effectiveRate = computeEffectiveRate(estimate);

  if (!estimate.includes_trim) {
    suggestions.push({
      type: "warning",
      field: "includes_trim",
      message: "Trim is not included.",
      suggestion: `Most painting jobs include trim. Adding trim would add ~$${((sqFt * PAINTING_TRIM_ADD_CENTS) / 100).toFixed(2)} (${sqFt.toLocaleString()} sq ft × $0.20).`,
    });
  }

  if (prepLevel <= 3 && sqFt > 800) {
    suggestions.push({
      type: "warning",
      field: "prep_level",
      message: `Prep level ${prepLevel} may be too low for ${sqFt.toLocaleString()} sq ft.`,
      suggestion: "Larger areas often need more prep. Consider level 5+ for a safer margin.",
    });
  }

  if (prepLevel >= 8 && sqFt < 300) {
    suggestions.push({
      type: "info",
      field: "prep_level",
      message: `Prep level ${prepLevel} is high for a small area (${sqFt.toLocaleString()} sq ft).`,
      suggestion: "Make sure the high prep level is justified — small rooms rarely need extensive repair.",
    });
  }

  if (!estimate.includes_ceiling && sqFt > 500) {
    suggestions.push({
      type: "tip",
      field: "includes_ceiling",
      message: "Ceiling not included.",
      suggestion: "For rooms over 500 sq ft, ceilings add ~30% more surface area. Ask the client.",
    });
  }

  const actualRate = computeActualRatePerSqFt(estimate);
  const minAcceptableRate = Math.round(effectiveRate * 0.7);
  const maxReasonableRate = Math.round(effectiveRate * 1.5);
  if (actualRate < minAcceptableRate) {
    suggestions.push({
      type: "warning",
      field: "pricing",
      message: `Effective rate of $${(actualRate / 100).toFixed(2)}/sq ft is below minimum.`,
      suggestion: `Expected ~$${(effectiveRate / 100).toFixed(2)}/sq ft for this scope. Verify this is intentional.`,
    });
  }
  if (actualRate > maxReasonableRate) {
    suggestions.push({
      type: "info",
      field: "pricing",
      message: `Effective rate of $${(actualRate / 100).toFixed(2)}/sq ft is unusually high.`,
      suggestion: `Expected ~$${(effectiveRate / 100).toFixed(2)}/sq ft for this scope. Double-check prep level and sq ft values.`,
    });
  }

  if (estimate.internal_labor_cost_cents !== null) {
    const marginPct = computeMargin(
      estimate.subtotal_cents,
      estimate.internal_labor_cost_cents,
      estimate.internal_material_cost_cents
    );
    const target = estimate.target_margin_pct ?? 30;
    if (marginPct < 15) {
      suggestions.push({
        type: "warning",
        field: "margin",
        message: `Gross margin is ${marginPct}% — critically low (target: ${target}%).`,
        suggestion: "This job will likely lose money. Increase price or reduce labor hours estimate.",
      });
    } else if (marginPct < target) {
      suggestions.push({
        type: "warning",
        field: "margin",
        message: `Gross margin is ${marginPct}% (target: ${target}%).`,
        suggestion: "Margin is below target. Consider adjusting pricing.",
      });
    } else if (marginPct > 60) {
      suggestions.push({
        type: "tip",
        field: "margin",
        message: `Gross margin is ${marginPct}% — very healthy.`,
        suggestion: "You have room to be competitive if needed.",
      });
    }
  }

  if (estimate.line_item_count === 0 && estimate.subtotal_cents > 0) {
    suggestions.push({
      type: "info",
      field: "line_items",
      message: "No line items — estimate total won't show a breakdown to the client.",
      suggestion: "Use the painting estimator to auto-generate line items with scope details.",
    });
  }

  return buildResult(suggestions, "Painting estimate reviewed.");
}

function computeEffectiveRate(estimate: EstimateInput): number {
  const sqFt = estimate.sq_ft!;
  const prepLevel = estimate.prep_level!;
  const prepMultiplier = PREP_LEVEL_MULTIPLIERS[Math.max(1, Math.min(10, prepLevel))] ?? 1;
  const ratePerSqFt = Math.round(PAINTING_RATE_STANDARD_CENTS * prepMultiplier);
  const effectiveSqFt = estimate.includes_ceiling ? sqFt * 1.3 : sqFt;
  const trimAdd = estimate.includes_trim ? Math.round(sqFt * PAINTING_TRIM_ADD_CENTS) : 0;
  const expectedLabor = Math.round(effectiveSqFt * ratePerSqFt) + trimAdd;
  return Math.round(expectedLabor / sqFt);
}

function computeActualRatePerSqFt(estimate: EstimateInput): number {
  const sqFt = estimate.sq_ft!;
  const materialCents = estimate.internal_material_cost_cents ?? 0;
  const materialHandling = Math.round(materialCents * 0.15);
  const laborRevenue = estimate.subtotal_cents - materialCents - materialHandling;
  return Math.round(Math.max(0, laborRevenue) / sqFt);
}

function computeMargin(
  subtotalCents: number,
  internalLaborCents: number,
  internalMaterialCents: number | null
): number {
  const materialCents = internalMaterialCents ?? 0;
  const materialHandling = Math.round(materialCents * 0.15);
  const laborRevenue = subtotalCents - materialCents - materialHandling;
  if (laborRevenue <= 0) return 0;
  const marginCents = laborRevenue - internalLaborCents;
  return Math.round((marginCents / laborRevenue) * 100 * 10) / 10;
}

function buildResult(
  suggestions: EstimateReviewSuggestion[],
  summary: string
): EstimateReviewResult {
  const warningCount = suggestions.filter((s) => s.type === "warning").length;
  const score = Math.max(
    0,
    100 - warningCount * 20 - suggestions.filter((s) => s.type === "info").length * 5
  );
  return {
    suggestions,
    score,
    summary:
      warningCount === 0
        ? `${summary} No issues found.`
        : `${summary} ${warningCount} warning(s) need attention.`,
  };
}
