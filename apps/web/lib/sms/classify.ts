import Anthropic from "@anthropic-ai/sdk";
import { renderContextForPrompt, type ClientContext } from "./context";

export const SMS_MESSAGE_TYPES = [
  "new_inquiry",
  "cancellation",
  "approval",
  "follow_up",
  "scheduling",
  "question",
  "other_business",
] as const;
export type SmsMessageType = (typeof SMS_MESSAGE_TYPES)[number];

export const SMS_JOB_TYPES = [
  "repair", "maintenance", "carpentry", "painting", "flooring",
  "windows_doors", "electrical", "plumbing", "hvac", "appliances",
  "drywall", "landscaping", "custom",
] as const;
export type SmsJobType = (typeof SMS_JOB_TYPES)[number];

export type SmsConfidence = "high" | "medium" | "low";

export interface SmsClassification {
  is_business: boolean;
  message_type: SmsMessageType;
  /** how sure the model is about the classification; low routes to human review */
  confidence: SmsConfidence;
  customer_name: string | null;
  job_title: string | null;
  job_type: SmsJobType;
  description: string;
  urgency: "asap" | "this_week" | "this_month" | "flexible";
  reply: string;
  /** id of the open estimate an approval/question refers to, or null */
  target_estimate_id: string | null;
}

/** Names the model emits when it can't find a real one — treat as "no name". */
const PLACEHOLDER_NAMES = new Set([
  "unknown", "<unknown>", "n/a", "na", "none", "null", "customer", "sms lead",
]);
function cleanName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed || PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic();
  return _client;
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_sms",
  description: "Classify an inbound SMS to the Dovetails business line and extract intake fields.",
  input_schema: {
    type: "object",
    properties: {
      is_business: {
        type: "boolean",
        description:
          "false ONLY for spam, scams, automated verification codes, wrong numbers, or clearly personal texts. A real person's cancellation, approval, follow-up, scheduling note, or question IS business.",
      },
      message_type: { type: "string", enum: SMS_MESSAGE_TYPES as unknown as string[] },
      confidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description:
          "high = the type and intent are unambiguous; medium = some ambiguity; low = vague, mixed signals, or you're guessing. Use low when unsure rather than forcing a type.",
      },
      customer_name: { type: ["string", "null"] },
      job_title: {
        type: ["string", "null"],
        description: "Short job title for new_inquiry (max 60 chars); null otherwise.",
      },
      job_type: { type: "string", enum: SMS_JOB_TYPES as unknown as string[] },
      description: { type: "string", description: "What they need or are saying." },
      urgency: { type: "string", enum: ["asap", "this_week", "this_month", "flexible"] },
      reply: {
        type: "string",
        description:
          "Warm, professional reply under 160 chars, signed 'Nick @ Dovetails'. Use the customer's history when relevant.",
      },
      target_estimate_id: {
        type: ["string", "null"],
        description:
          "If this is an approval or a question about a specific open estimate, the matching estimate id from the provided context; else null.",
      },
    },
    required: [
      "is_business", "message_type", "confidence", "customer_name", "job_title",
      "job_type", "description", "urgency", "reply", "target_estimate_id",
    ],
  },
};

const SYSTEM_PROMPT = `You are the intake assistant for Dovetails Services LLC, a handyman and woodworking business owned by Nick Garon in New England. You read inbound SMS to the business line and classify them so the right action is taken. Be accurate and concise. Use the customer's history (provided) to write informed replies and to link approvals/questions to the correct open estimate. Always call the classify_sms tool.`;

/**
 * Safe fallback when the model is unavailable or errors. Marked `low` confidence
 * and `other_business` so the endpoint routes it to human review rather than
 * auto-creating a job or taking any action on a guess.
 */
function fallback(message: string): SmsClassification {
  return {
    is_business: true,
    message_type: "other_business",
    confidence: "low",
    customer_name: null,
    job_title: null,
    job_type: "custom",
    description: message.slice(0, 200),
    urgency: "flexible",
    reply: "Thanks for reaching out — I'll follow up shortly. — Nick @ Dovetails",
    target_estimate_id: null,
  };
}

export async function classifySms(params: {
  message: string;
  phone: string;
  context: ClientContext;
}): Promise<SmsClassification> {
  const { message, phone, context } = params;
  if (!process.env.ANTHROPIC_API_KEY) return fallback(message);

  const userContent = [
    `Phone: ${phone}`,
    `Customer history:\n${renderContextForPrompt(context)}`,
    `\nInbound message: "${message}"`,
  ].join("\n");

  try {
    const response = await getClient().messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [CLASSIFY_TOOL],
      tool_choice: { type: "tool", name: "classify_sms" },
      messages: [{ role: "user", content: userContent }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );
    if (!toolUse) return fallback(message);

    const raw = toolUse.input as Partial<SmsClassification>;

    // Validate against the context: only accept a target_estimate_id that exists
    const validEstimateIds = new Set(context.openEstimates.map((e) => e.id));
    const targetEstimateId =
      raw.target_estimate_id && validEstimateIds.has(raw.target_estimate_id)
        ? raw.target_estimate_id
        : null;

    return {
      is_business: raw.is_business ?? true,
      message_type: (SMS_MESSAGE_TYPES as readonly string[]).includes(raw.message_type as string)
        ? (raw.message_type as SmsMessageType)
        : "other_business",
      confidence: (["high", "medium", "low"] as const).includes(raw.confidence as SmsConfidence)
        ? (raw.confidence as SmsConfidence)
        : "low",
      customer_name: cleanName(raw.customer_name),
      job_title: raw.job_title ?? null,
      job_type: (SMS_JOB_TYPES as readonly string[]).includes(raw.job_type as string)
        ? (raw.job_type as SmsJobType)
        : "custom",
      description: raw.description ?? message.slice(0, 200),
      urgency: (["asap", "this_week", "this_month", "flexible"] as const).includes(
        raw.urgency as "asap"
      )
        ? (raw.urgency as SmsClassification["urgency"])
        : "flexible",
      reply: raw.reply ?? "Thanks for reaching out — I'll follow up shortly. — Nick @ Dovetails",
      target_estimate_id: targetEstimateId,
    };
  } catch {
    return fallback(message);
  }
}
