import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zodOutputFormat helper requires Zod 4 schemas; zod 3.25 ships them at "zod/v4".
import { z } from "zod/v4";
import {
  bindQuantities,
  type AssessmentSummary,
  type PreparedScope,
  type PreparedTask,
  type TrimPaintRate,
  type WallPaintRate,
} from "@ai-fsm/domain";
import { applyRoomRules } from "@/lib/estimates/task-methods";
import {
  PREPARE_QUOTE_MODEL,
  buildPreparedTask,
  roomRuleFacts,
  preparationTaskSchema,
  taskBuildContext,
  type PriceBookHours,
} from "@/lib/estimates/prepare-quote";

/**
 * Revise with a note (TASK-186): the owner's answers and a plain-language
 * instruction go to the model with the current prepared scope; it returns only
 * the changes, each with a reason. Code applies them: task ids are checked,
 * removed work is excluded (never deleted), new work is built like prepared
 * work, and quantities come from the rooms. Everything here except
 * `extractRevision` is pure.
 */

export const MAX_REVISION_INSTRUCTION = 2000;

export const revisionOutputSchema = z.object({
  summary: z.string(),
  changes: z.array(
    z.object({
      action: z.enum(["update", "add", "exclude", "include"]),
      /** The task changed; null for "add". */
      task_id: z.string().nullable(),
      /** New values for "update"; a null field keeps the current value. */
      update: z
        .object({
          description: z.string().nullable(),
          hours_low: z.number().nullable(),
          hours_high: z.number().nullable(),
          materials_cents: z.number().nullable(),
        })
        .nullable(),
      /** The new task for "add". */
      task: preparationTaskSchema.nullable(),
      /** A short name for an added task, so an option can refer to it. */
      ref: z.string().nullable(),
      reason: z.string(),
    }),
  ),
  /** New options for the customer, by task id or added task ref. */
  alternatives_add: z.array(z.object({ label: z.string(), task_refs: z.array(z.string()), note: z.string().nullable() })),
});

export type RevisionOutput = z.infer<typeof revisionOutputSchema>;

export interface RevisionContext {
  summary: AssessmentSummary;
  priceBook: PriceBookHours[];
  wallPaintRate?: WallPaintRate | null;
  trimPaintRate?: TrimPaintRate | null;
}

type TaskValues = Pick<PreparedTask, "hours_low" | "hours_high" | "materials_cents" | "confirmed">;

export interface RevisionChange {
  task_id: string;
  action: RevisionOutput["changes"][number]["action"];
  description: string;
  /** Null for an added task. */
  before: TaskValues | null;
  after: TaskValues;
  reason: string;
}

function values(t: PreparedTask): TaskValues {
  return { hours_low: t.hours_low, hours_high: t.hours_high, materials_cents: t.materials_cents, confirmed: t.confirmed };
}

function nonNegative(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Apply the model's changes to a scope. Unknown task ids are skipped, a change
 * that changes nothing is dropped, and revised hours are labeled as such. Pure.
 */
export function applyRevision(
  scope: PreparedScope,
  output: RevisionOutput,
  ctx: RevisionContext,
): { scope: PreparedScope; changes: RevisionChange[] } {
  const groups = new Map(scope.groups.map((g) => [g.key, g.label]));
  const build = taskBuildContext(ctx.summary, ctx.priceBook, groups, ctx);
  const tasks = scope.tasks.map((t) => ({ ...t }));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const refs = new Map<string, string>();
  const changes: RevisionChange[] = [];
  let next = tasks.reduce((max, t) => Math.max(max, Number(t.id.replace(/^t/, "")) || 0), 0);

  for (const c of output.changes) {
    if (c.action === "add") {
      if (!c.task || !c.task.description.trim()) continue;
      const id = `t${++next}`;
      // Room rules see the tasks already in the room but only change the new one (TASK-217).
      const ruled = applyRoomRules([...tasks, buildPreparedTask(c.task, id, build)], new Map([[id, roomRuleFacts(c.task)]]));
      const [added] = bindQuantities([ruled[ruled.length - 1]], ctx.summary.rooms);
      tasks.push(added);
      byId.set(id, added);
      if (c.ref) refs.set(c.ref, id);
      changes.push({ task_id: id, action: "add", description: added.description, before: null, after: values(added), reason: c.reason.trim() });
      continue;
    }
    const t = c.task_id ? byId.get(c.task_id) : undefined;
    if (!t) continue;
    const before = values(t);
    if (c.action === "exclude") t.confirmed = false;
    if (c.action === "include") t.confirmed = true;
    if (c.action === "update" && c.update) {
      const u = c.update;
      if (u.description?.trim()) t.description = u.description.trim().slice(0, 500);
      let low = u.hours_low === null ? t.hours_low : nonNegative(u.hours_low);
      let high = u.hours_high === null ? t.hours_high : nonNegative(u.hours_high);
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      if (low !== t.hours_low || high !== t.hours_high) {
        t.hours_low = low;
        t.hours_high = high;
        t.hours_source = low === null && high === null ? null : "revision";
      }
      if (u.materials_cents !== null) {
        const m = nonNegative(u.materials_cents);
        if (m !== null) t.materials_cents = Math.round(m);
      }
    }
    const after = values(t);
    const same = JSON.stringify(before) === JSON.stringify(after) && !(c.action === "update" && c.update?.description?.trim());
    if (same) continue;
    changes.push({ task_id: t.id, action: c.action, description: t.description, before, after, reason: c.reason.trim() });
  }

  const resolve = (ref: string) => (byId.has(ref) ? ref : refs.get(ref));
  let nextAlt = scope.alternatives.length;
  const alternatives = [
    ...scope.alternatives,
    ...output.alternatives_add
      .filter((a) => a.label.trim())
      .map((a) => ({
        id: `a${++nextAlt}`,
        label: a.label.trim().slice(0, 200),
        task_ids: a.task_refs.map(resolve).filter((id): id is string => !!id),
        note: a.note?.slice(0, 500) ?? null,
      })),
  ];

  return {
    scope: { ...scope, groups: [...groups].map(([key, label]) => ({ key, label: label.slice(0, 200) })), tasks, alternatives },
    changes,
  };
}

/** Record a kept revision on the scope. Pure. */
export function recordRevision(scope: PreparedScope, instruction: string, summary: string, at: string): PreparedScope {
  const entry = { at, instruction: instruction.slice(0, MAX_REVISION_INSTRUCTION), summary: summary.slice(0, 2000) };
  return { ...scope, revisions: [...(scope.revisions ?? []), entry].slice(-50) };
}

const SYSTEM_PROMPT = `You revise a draft quote for Dovetails Services LLC, a residential handyman and home maintenance business in southern New Hampshire. The owner prepared the quote from a site assessment and now tells you what to change, or has answered your earlier questions.

Rules:
- Return only changes. Leave every task you were not asked about, and whose answer does not affect it, alone.
- An answer that rules work out (for example "No, do not paint the cabinets") excludes that task: action "exclude". Never delete work.
- "update" changes a task's description, hours or materials; set a field to null to keep it. "include" puts an excluded task back.
- "add" is for work the owner asks for or an answer reveals (for example a contingency allowance for possible subfloor damage). Write the task like a prepared task: room_id from the rooms given, quantity_key for measured quantities (the application computes areas), work_type for the kind of work ("wall_paint", "ceiling_paint", "trim_paint", "drywall_prep" with repair_class and extra_visit, or "generic"). Give it a short ref.
- When the owner asks to compare choices (for example sheet vinyl versus LVP), add the second choice as a task with is_alternative true and list both in alternatives_add, using task ids or refs.
- hours are one person's labor including setup and cleanup; materials_cents is what Dovetails buys, in cents.
- reason: one short sentence the owner can check. summary: one or two sentences on what changed overall.`;

function money(c: number | null): string {
  return c === null ? "not priced" : `$${Math.round(c / 100)}`;
}

/** The user message for the revision call. Pure. */
export function buildRevisionPrompt(scope: PreparedScope, summary: AssessmentSummary, instruction: string): string {
  const rooms = summary.rooms.map((r) => `- room_id ${r.id}: ${r.name || "Unnamed area"}${r.notes ? ` (${r.notes})` : ""}`).join("\n");
  const labels = new Map(scope.groups.map((g) => [g.key, g.label]));
  const tasks = scope.tasks
    .map((t) =>
      [
        `- ${t.id} [${t.confirmed ? "included" : "excluded"}] ${t.description}`,
        `  group ${t.group_key} (${labels.get(t.group_key) ?? t.group_key}), room ${t.room_id ?? "whole job"}`,
        `  hours ${t.hours_low ?? "?"}–${t.hours_high ?? "?"}, materials ${money(t.materials_cents)}${t.quantity?.value != null ? `, quantity ${Math.round(t.quantity.value)} ${t.quantity.unit}` : ""}`,
      ].join("\n"),
    )
    .join("\n");
  const answered = scope.questions.filter((q) => q.answer).map((q) => `- ${q.text}\n  Answer: ${q.answer} (tasks ${q.task_ids.join(", ") || "none"})`);
  const sections = [
    `## Rooms\n${rooms || "(none)"}`,
    `## Current tasks\n${tasks || "(none)"}`,
    answered.length ? `## The owner's answers\n${answered.join("\n")}` : null,
    scope.alternatives.length ? `## Options already offered\n${scope.alternatives.map((a) => `- ${a.label}: ${a.task_ids.join(", ")}`).join("\n")}` : null,
    `## What the owner wants changed\n${instruction.trim() || "Apply the answers above."}`,
  ];
  return sections.filter(Boolean).join("\n\n");
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return _client;
}

/** Ask the model for the changes. Null when no key is configured or the response cannot be used. */
export async function extractRevision(
  scope: PreparedScope,
  summary: AssessmentSummary,
  instruction: string,
): Promise<RevisionOutput | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const response = await getClient().messages.parse({
    model: PREPARE_QUOTE_MODEL,
    max_tokens: 16000,
    // Cast: the SDK's types name Zod 3, its runtime needs Zod 4. Re-validated below.
    output_config: {
      effort: "medium",
      format: zodOutputFormat(revisionOutputSchema as unknown as Parameters<typeof zodOutputFormat>[0]),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildRevisionPrompt(scope, summary, instruction) }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const parsed = revisionOutputSchema.safeParse(response.parsed_output);
  return parsed.success ? parsed.data : null;
}
