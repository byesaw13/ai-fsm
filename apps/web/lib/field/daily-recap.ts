import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * AI Daily Recap (EPIC-008 Slice 1).
 *
 * At day's end the tech/owner narrates what happened in plain language; this
 * turns it into structured per-task time so costing baselines can accumulate
 * without live timers. The AI ONLY interprets — it never generates the task
 * list, and its output is a DRAFT the owner reviews and confirms before it
 * touches the ledger.
 */

export class DailyRecapError extends Error {
  constructor(
    message: string,
    public code: "AI_NOT_CONFIGURED" | "AI_AUTH_FAILED" | "NO_RESULT" | "RESULT_TRUNCATED",
    public httpStatus: number,
  ) {
    super(message);
    this.name = "DailyRecapError";
  }
}

/** A candidate task the worker could have touched today (for AI grounding). */
export type RecapCandidateTask = {
  id: string;
  label: string;
  work_order_title: string | null;
};

export interface DailyRecapInput {
  narration: string;
  candidateTasks: RecapCandidateTask[];
  /** Clocked minutes for the day if a business day exists; null when unknown. */
  clockedMinutes: number | null;
  date: string; // YYYY-MM-DD
}

// Must be valid activity_types (activity_entries.activity_type CHECK). On-site
// waiting is better captured as a blocked task, so it is not a bucket here.
const NON_TASK_ACTIVITY = ["material_run", "travel", "admin"] as const;
export type NonTaskActivity = (typeof NON_TASK_ACTIVITY)[number];

export const recapTaskSchema = z.object({
  /** Existing candidate task id, or null when this is unplanned new work. */
  task_id: z.string().nullable(),
  /** Label for unplanned work when task_id is null; else echoes the task. */
  label: z.string(),
  minutes: z.number().int().min(0).max(24 * 60),
  status: z.enum(["done", "partial", "blocked"]),
  note: z.string(),
});
export const recapOtherSchema = z.object({
  activity_type: z.enum(NON_TASK_ACTIVITY),
  minutes: z.number().int().min(0).max(24 * 60),
  note: z.string(),
});
export const recapDraftSchema = z.object({
  task_time: z.array(recapTaskSchema),
  other_time: z.array(recapOtherSchema),
  summary: z.string(),
  reconciliation_note: z.string(),
});
export type DailyRecapDraft = z.infer<typeof recapDraftSchema> & {
  /** Derived server-side: sum of all attributed minutes. */
  totalMinutes: number;
};

const SYSTEM_PROMPT = `You interpret a residential handyman's end-of-day recap into structured time.

You are given: the candidate tasks that were possible today (each with an id and label), the clocked day length in minutes when known, and the date. The worker narrates, in plain language, what they did, how long things took, and any problems.

Rules:
- Attribute time to a candidate task by its id whenever the narration clearly refers to it — including travel or materials time when a matching candidate task exists (e.g. a "travel" or "materials" task). Echo the task's label in "label".
- status: "done" if finished, "partial" if worked but not finished, "blocked" if stopped by a problem (wrong material, waiting on parts). Put the reason in "note".
- Do NOT invent tasks. Only use task_id=null with a new "label" for clearly-new unplanned work the worker describes that isn't in the candidate list.
- Only use other_time buckets (material_run, travel, admin) for work with NO matching candidate task — a supply run, drive, or paperwork that isn't itself one of the listed tasks. On-site waiting is a blocked task, not a bucket.
- Estimate minutes from the narration ("a couple hours" ≈ 120, "an hour" ≈ 60, "rest of the day" = remaining clocked time). If a clocked day length is given, try to make the attributed total land near it, but honor explicit times the worker states even if they don't sum perfectly.
- reconciliation_note: one short sentence comparing the attributed total to the clocked day (e.g. "Attributed ~8h matches the clocked day." or "Attributed 6h but clocked 8h — 2h unaccounted."). Never silently pad.
- A task the worker did not mention gets no entry (leave it untouched).`;

const RECAP_TOOL: Anthropic.Tool = {
  name: "record_daily_recap",
  description: "Return the structured time breakdown for the day.",
  input_schema: {
    type: "object",
    properties: {
      task_time: {
        type: "array",
        items: {
          type: "object",
          properties: {
            task_id: { type: ["string", "null"], description: "Candidate task id, or null for unplanned new work" },
            label: { type: "string" },
            minutes: { type: "integer" },
            status: { type: "string", enum: ["done", "partial", "blocked"] },
            note: { type: "string" },
          },
          required: ["task_id", "label", "minutes", "status", "note"],
        },
      },
      other_time: {
        type: "array",
        items: {
          type: "object",
          properties: {
            activity_type: { type: "string", enum: [...NON_TASK_ACTIVITY] },
            minutes: { type: "integer" },
            note: { type: "string" },
          },
          required: ["activity_type", "minutes", "note"],
        },
      },
      summary: { type: "string" },
      reconciliation_note: { type: "string" },
    },
    required: ["task_time", "other_time", "summary", "reconciliation_note"],
  },
};

function buildUserMessage(input: DailyRecapInput): string {
  const tasks = input.candidateTasks.length
    ? input.candidateTasks
        .map((t) => `- id=${t.id} | ${t.label}${t.work_order_title ? ` (${t.work_order_title})` : ""}`)
        .join("\n")
    : "(no pre-listed tasks — attribute to new labels as described)";
  const clocked =
    input.clockedMinutes != null
      ? `${input.clockedMinutes} minutes (${(input.clockedMinutes / 60).toFixed(1)} h)`
      : "unknown";
  return `Date: ${input.date}
Clocked day length: ${clocked}

Candidate tasks:
${tasks}

Recap:
${input.narration.trim()}`;
}

/** Interpret a recap into a reviewable draft. Throws DailyRecapError on failure. */
export async function interpretDailyRecap(input: DailyRecapInput): Promise<DailyRecapDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new DailyRecapError(
      "AI daily recap isn't configured yet — set ANTHROPIC_API_KEY to enable it.",
      "AI_NOT_CONFIGURED",
      503,
    );
  }
  const client = new Anthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [RECAP_TOOL],
      tool_choice: { type: "tool", name: "record_daily_recap" },
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      throw new DailyRecapError(
        "The Anthropic API key was rejected — double-check ANTHROPIC_API_KEY.",
        "AI_AUTH_FAILED",
        502,
      );
    }
    throw err;
  }

  if (response.stop_reason === "max_tokens") {
    throw new DailyRecapError("The recap was too long to finish — shorten it and try again.", "RESULT_TRUNCATED", 422);
  }

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new DailyRecapError("The AI didn't return a breakdown — please try again.", "NO_RESULT", 502);
  }

  const parsed = recapDraftSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new DailyRecapError("The AI returned an unexpected recap payload — please try again.", "NO_RESULT", 502);
  }

  const totalMinutes =
    parsed.data.task_time.reduce((s, t) => s + t.minutes, 0) +
    parsed.data.other_time.reduce((s, o) => s + o.minutes, 0);

  return { ...parsed.data, totalMinutes };
}
