import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * AI task decomposition (EPIC-008 Slice 2).
 *
 * Reads a job's scope (estimate scope + rooms + labor lines) and proposes the
 * work it divides into: a set of work orders (areas), each with a checklist of
 * discrete tasks ("replace faucet", "hang cabinet"). The owner reviews and
 * applies; the AI only proposes. This feeds the per-task time baselines
 * (Slice 1) with granular tasks instead of coarse T&M allowance lines.
 */

export class TaskDecompositionError extends Error {
  constructor(
    message: string,
    public code: "AI_NOT_CONFIGURED" | "AI_AUTH_FAILED" | "NO_RESULT" | "RESULT_TRUNCATED",
    public httpStatus: number,
  ) {
    super(message);
    this.name = "TaskDecompositionError";
  }
}

export interface DecomposeInput {
  scope: string;
  rooms: { name: string; notes?: string | null }[];
  laborLines: string[];
}

export const decomposedTaskSchema = z.object({
  label: z.string().min(1),
  required: z.boolean(),
});
export const decomposedWorkOrderSchema = z.object({
  title: z.string().min(1),
  scope: z.string(),
  tasks: z.array(decomposedTaskSchema).min(1),
});
export const decompositionSchema = z.object({
  work_orders: z.array(decomposedWorkOrderSchema).min(1),
});
export type TaskDecomposition = z.infer<typeof decompositionSchema>;

const SYSTEM_PROMPT = `You decompose a residential handyman/remodel job into structured work.

Given the job scope, the rooms/areas involved, and the labor lines, propose:
- One work order per distinct AREA or logical grouping of work (e.g. "Master bath", "Kitchen", "Exterior trim"). Do not create one giant work order; do not create one per tiny task.
- Within each work order, a checklist of DELIVERABLE tasks.

CRITICAL — task granularity. A task is ONE complete unit of work you'd estimate and later time as a whole — the level "how long did that take?" is a useful question. It is NOT an individual physical step.
- RIGHT: "Replace faucet", "Replace p-trap", "Install 3 recessed LED lights", "Paint accent wall".
- WRONG (too fine — never do this): "Shut off supply valves", "Remove old faucet", "Reconnect supply lines", "Test for leaks", "Clean up". Those are steps inside "Replace faucet", not tasks.
Aim for roughly 1–6 tasks per work order. If you're tempted to write a verb like "remove", "shut off", "test", or "verify" as its own task, fold it into the deliverable it belongs to.

Rules:
- required=true for tasks that must be done to finish the job; required=false for optional/contingent items.
- Keep labels short, specific, and REUSABLE across jobs (so "Replace faucet" reads identically next time — that is what makes time baselines work).
- Do not invent scope not implied by the inputs. If the job is small (one area), one work order is fine.
- Each work order's "scope" is a one-line summary of that area's work.`;

const DECOMPOSE_TOOL: Anthropic.Tool = {
  name: "propose_work_breakdown",
  description: "Return the proposed work orders and their task checklists.",
  input_schema: {
    type: "object",
    properties: {
      work_orders: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            scope: { type: "string" },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: { label: { type: "string" }, required: { type: "boolean" } },
                required: ["label", "required"],
              },
            },
          },
          required: ["title", "scope", "tasks"],
        },
      },
    },
    required: ["work_orders"],
  },
};

function buildUserMessage(input: DecomposeInput): string {
  const rooms = input.rooms.length
    ? input.rooms.map((r) => `- ${r.name}${r.notes ? `: ${r.notes}` : ""}`).join("\n")
    : "(no rooms specified)";
  const labor = input.laborLines.length
    ? input.laborLines.map((l) => `- ${l}`).join("\n")
    : "(no labor lines)";
  return `Job scope:
${input.scope.trim() || "(none provided)"}

Rooms / areas:
${rooms}

Labor lines from the estimate:
${labor}`;
}

/** Propose a work breakdown. Throws TaskDecompositionError on failure. */
export async function decomposeIntoTasks(input: DecomposeInput): Promise<TaskDecomposition> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new TaskDecompositionError(
      "AI task breakdown isn't configured yet — set ANTHROPIC_API_KEY to enable it.",
      "AI_NOT_CONFIGURED",
      503,
    );
  }
  const client = new Anthropic();

  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [DECOMPOSE_TOOL],
      tool_choice: { type: "tool", name: "propose_work_breakdown" },
      messages: [{ role: "user", content: buildUserMessage(input) }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError && (err.status === 401 || err.status === 403)) {
      throw new TaskDecompositionError(
        "The Anthropic API key was rejected — double-check ANTHROPIC_API_KEY.",
        "AI_AUTH_FAILED",
        502,
      );
    }
    throw err;
  }

  if (response.stop_reason === "max_tokens") {
    throw new TaskDecompositionError(
      "The breakdown was too long to finish — try a narrower scope.",
      "RESULT_TRUNCATED",
      422,
    );
  }
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new TaskDecompositionError("The AI didn't return a breakdown — please try again.", "NO_RESULT", 502);
  }
  const parsed = decompositionSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new TaskDecompositionError("The AI returned an unexpected breakdown payload.", "NO_RESULT", 502);
  }
  return parsed.data;
}
