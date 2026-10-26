import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// The SDK's zodOutputFormat helper requires Zod 4 schemas; zod 3.25 ships them at "zod/v4".
import { z } from "zod/v4";
import {
  allocateFixedPrice,
  bindQuantities,
  computeAssessmentRoomGeometry,
  pickStartingHours,
  summarizePreparedScope,
  wallPaintGallons,
  wallPaintHours,
  PAINT_CENTS_PER_GALLON,
  type WallPaintRate,
  type AssessmentRoom,
  type AssessmentSummary,
  type PreparedQuestion,
  type PreparedScope,
  type PreparedTask,
} from "@ai-fsm/domain";
import { roomGeometryLines } from "@/lib/assessments/room-geometry-display";
import type { CreateEstimateInput } from "@/lib/estimates/create-estimate";

type PreparedLineItem = CreateEstimateInput["line_items"][number];

/**
 * Prepare Quote (TASK-179): turn a saved assessment into a prepared scope and
 * the draft's line items. The model lists the work; code binds quantities from
 * the room geometry, picks starting hours (price book before the model's
 * allowance) and prices groups at the account's T&M rate. Everything here
 * except `extractPreparedScope` is pure.
 */

export const PREPARE_QUOTE_MODEL = "claude-opus-5-5";

const QUANTITY_KEYS = [
  "floor_sqft",
  "ceiling_sqft",
  "gross_wall_sqft",
  "net_wall_sqft",
  "perimeter_lf",
  "baseboard_lf",
  "count",
] as const;

/** One task as the model writes it, in a preparation or a revision. */
export const preparationTaskSchema = z.object({
  room_id: z.string().nullable(),
  description: z.string(),
  kind: z.enum(["observed", "requested", "suggested"]),
  group_key: z.string(),
  quantity_key: z.enum(QUANTITY_KEYS).nullable(),
  count: z.number().nullable(),
  count_unit: z.enum(["each", "lf", "sqft"]).nullable(),
  hours_low: z.number().nullable(),
  hours_high: z.number().nullable(),
  materials_cents: z.number().nullable(),
  customer_supplied: z.boolean(),
  is_alternative: z.boolean(),
  price_book_code: z.string().nullable(),
  work_type: z.enum(["wall_paint", "other"]),
  paint_grade: z.enum(["economy", "standard", "premium", "designer"]).nullable(),
});

/** What the model returns. Rooms are referenced by the ids it was given. */
export const preparationOutputSchema = z.object({
  groups: z.array(z.object({ key: z.string(), label: z.string() })),
  tasks: z.array(preparationTaskSchema),
  questions: z.array(z.object({ text: z.string(), task_indexes: z.array(z.number()) })),
  alternatives: z.array(z.object({ label: z.string(), task_indexes: z.array(z.number()), note: z.string().nullable() })),
  exclusions: z.array(z.string()),
});

export type PreparationOutput = z.infer<typeof preparationOutputSchema>;
export type PreparationTask = z.infer<typeof preparationTaskSchema>;

export interface PriceBookHours {
  code: string;
  name: string;
  labor_hours_low: number | null;
  labor_hours_typical: number | null;
  labor_hours_high: number | null;
}

export interface PreparationSource {
  visitId: string;
  assessmentUpdatedAt: string | null;
  /** The owner's wall painting pace; null leaves wall painting to the price book or the model. */
  wallPaintRate?: WallPaintRate | null;
}

const SYSTEM_PROMPT = `You prepare a draft quote for Dovetails Services LLC, a residential handyman and home maintenance business in southern New Hampshire. You read the owner's room-by-room site assessment and list the work.

Rules:
- List every action the owner wrote, each with the room it belongs to (use the room ids given). Never drop or merge away a requested action; a task may be grouped with related work into one customer line.
- kind: "requested" for work the customer asked for, "observed" for problems the owner noted that need work, "suggested" only for work nobody asked for. Never add whole-room painting, subfloor replacement or fixture upgrades as anything but "suggested".
- quantity_key says which measured quantity a task uses. Do not compute areas or lengths yourself; the application does. For items the owner counted or measured directly (3 faceplates, 2 ft of baseboard), use quantity_key "count" with count and count_unit. Use null when a task needs no quantity.
- groups are customer-facing lines (for example one per room, with flooring separate when it is a distinct trade). group_key is a short slug.
- hours_low and hours_high: your honest labor allowance for one person doing that task, in hours. Include setup, protection and cleanup. Do not count drying time as worked hours. Use null only if you cannot estimate at all.
- materials_cents: a rough materials allowance in cents for supplies Dovetails buys. If the customer supplies the item, set customer_supplied true and materials_cents 0. Use null when the price depends on a product choice not yet made.
- price_book_code: the catalog code when one clearly fits the task, else null.
- work_type "wall_paint" for painting wall surfaces of a room (quantity_key net_wall_sqft); the application then sets hours from the owner's painting pace and paint from the area. Patching, wallpaper removal, trim, ceilings, cabinets and shelving are "other". Give one wall_paint task per room; the room's measured walls already leave out unpainted walls and areas.
- paint_grade for wall_paint tasks: "premium" when the owner asks for high quality paint, "standard" otherwise; null for other work.
- questions: only what changes price or scope and is not already answered in the notes. Attach each to the tasks it affects by index. Do not ask about room size for tasks that do not need it.
- When the owner wants options shown (for example two flooring types), list each option as its own task. Mark the recommended or first option is_alternative false and every other option is_alternative true, so the quote charges for one. Every other task is is_alternative false.
- alternatives: real options the customer might choose between (for example blending a patch versus repainting the whole wall). exclusions: conditions the quote does not cover, such as concealed damage.`;

function roomLines(rooms: AssessmentRoom[]): string {
  return rooms
    .map((r) => {
      const facts = roomGeometryLines(computeAssessmentRoomGeometry(r));
      const openings: string[] = [];
      if (r.door_count !== undefined) openings.push(`${r.door_count} door(s)`);
      if (r.window_count !== undefined) openings.push(`${r.window_count} window(s)`);
      for (const o of r.openings ?? []) openings.push(`${o.label || "opening"} ${o.width_in} in wide`);
      const walls: string[] = [];
      if (r.peak_height_ft) walls.push(`vaulted, ${r.peak_height_ft} ft at the peak`);
      for (const w of r.wall_lengths ?? []) walls.push(`paint only ${w.label || "wall"} ${w.length_ft} ft long`);
      for (const a of r.skip_areas ?? []) walls.push(`not painted: ${a.label || "area"} ${a.width_ft} x ${a.height_ft} ft`);
      return [
        `- room_id ${r.id}: ${r.name || "Unnamed area"}`,
        openings.length ? `  openings: ${openings.join(", ")}` : null,
        walls.length ? `  walls: ${walls.join("; ")}` : null,
        facts.length ? `  measured: ${facts.join("; ")}` : "  measured: no dimensions",
        r.notes ? `  notes: ${r.notes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/** The user message for the preparation call. Pure. */
export function buildPreparationPrompt(summary: AssessmentSummary, priceBook: PriceBookHours[]): string {
  const catalog = priceBook
    .filter((p) => p.labor_hours_low !== null || p.labor_hours_high !== null || p.labor_hours_typical !== null)
    .map((p) => `${p.code} ${p.name}`)
    .join("\n");
  const sections = [
    `## Rooms\n${roomLines(summary.rooms) || "(none)"}`,
    summary.scopeNotes ? `## Scope notes\n${summary.scopeNotes}` : null,
    summary.workItems.length ? `## Work items\n${summary.workItems.map((w) => `- ${w}`).join("\n")}` : null,
    summary.prepNotes ? `## Prep notes\n${summary.prepNotes}` : null,
    summary.customerSuppliedMaterials ? `## Customer supplies\n${summary.customerSuppliedMaterials}` : null,
    summary.accessNotes ? `## Access\n${summary.accessNotes}` : null,
    catalog ? `## Price book codes\n${catalog}` : null,
  ];
  return sections.filter(Boolean).join("\n\n");
}

function slug(value: string, fallback: string): string {
  const s = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return s || fallback;
}

function nonNegative(n: number | null): number | null {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

export interface TaskBuildContext {
  roomsById: Map<string, AssessmentRoom>;
  byCode: Map<string, PriceBookHours>;
  /** Group key → label; new group keys are added here. */
  groups: Map<string, string>;
  wallPaintRate?: WallPaintRate | null;
}

export function taskBuildContext(
  summary: AssessmentSummary,
  priceBook: PriceBookHours[],
  groups: Map<string, string>,
  wallPaintRate?: WallPaintRate | null,
): TaskBuildContext {
  return {
    roomsById: new Map(summary.rooms.map((r) => [r.id, r])),
    byCode: new Map(priceBook.map((p) => [p.code, p])),
    groups,
    wallPaintRate,
  };
}

/**
 * One model task as a prepared task (quantity not yet bound). Unknown rooms
 * become whole-job work, suggestions and non-default options start
 * unconfirmed, wall painting is paced and its paint computed from the area,
 * and price-book hours win over the model's allowance. Pure.
 */
export function buildPreparedTask(t: PreparationTask, id: string, ctx: TaskBuildContext): PreparedTask {
  const groupKey = slug(t.group_key, "general");
  if (!ctx.groups.has(groupKey)) ctx.groups.set(groupKey, groupKey.replace(/_/g, " "));
  const pb = t.price_book_code ? ctx.byCode.get(t.price_book_code) : undefined;
  const roomId = t.room_id && ctx.roomsById.has(t.room_id) ? t.room_id : null;
  const geometry = roomId ? computeAssessmentRoomGeometry(ctx.roomsById.get(roomId)!) : null;
  // Wall painting is priced from the net wall area when the room has one (TASK-184).
  const wallPaint = t.work_type === "wall_paint" && geometry !== null;
  const quantityKey =
    wallPaint && geometry.net_wall_sqft.value !== null ? ("net_wall_sqft" as const) : t.quantity_key;
  const wallSqft =
    wallPaint && (quantityKey === "net_wall_sqft" || quantityKey === "gross_wall_sqft")
      ? geometry[quantityKey].value
      : null;
  const isCount = quantityKey === "count";
  const paced = wallPaintHours(wallSqft, geometry?.max_wall_height_ft ?? null, ctx.wallPaintRate ?? null);
  // A paced area beats the price book's flat per-room hours.
  const hours = pickStartingHours({
    price_book: pb && !paced ? { low: pb.labor_hours_low ?? pb.labor_hours_typical, high: pb.labor_hours_high ?? pb.labor_hours_typical } : null,
    production_rate: paced,
    ai_allowance: { low: nonNegative(t.hours_low), high: nonNegative(t.hours_high) },
  });
  let materials = t.customer_supplied ? 0 : nonNegative(t.materials_cents);
  if (wallSqft !== null && !t.customer_supplied) {
    materials = wallPaintGallons(wallSqft) * PAINT_CENTS_PER_GALLON[t.paint_grade ?? "standard"];
  }
  return {
    id,
    room_id: roomId,
    description: t.description.trim().slice(0, 500),
    kind: t.kind,
    // Suggestions and the non-default side of an option wait for the owner.
    confirmed: t.kind !== "suggested" && !t.is_alternative,
    group_key: groupKey,
    quantity_key: quantityKey,
    count: isCount && typeof t.count === "number" && t.count > 0 ? t.count : null,
    ...(isCount && t.count_unit ? { count_unit: t.count_unit } : {}),
    quantity: null,
    hours_low: hours?.low ?? null,
    hours_high: hours?.high ?? null,
    hours_source: hours?.source ?? null,
    materials_cents: materials === null ? null : Math.round(materials),
    price_book_code: pb ? pb.code : null,
  };
}

/**
 * Turn the model's output into a prepared scope. Unknown rooms become
 * whole-job tasks, suggestions start unconfirmed, price-book hours win over
 * the model's allowance, and quantities come from the measured rooms.
 */
export function toPreparedScope(
  output: PreparationOutput,
  summary: AssessmentSummary,
  priceBook: PriceBookHours[],
  source: PreparationSource,
): PreparedScope {
  const groups = new Map<string, string>();
  for (const g of output.groups) {
    const key = slug(g.key, "group");
    if (!groups.has(key)) groups.set(key, g.label.trim() || key);
  }

  const ctx = taskBuildContext(summary, priceBook, groups, source.wallPaintRate);
  const tasks: PreparedTask[] = output.tasks
    .filter((t) => t.description.trim())
    .map((t, i) => buildPreparedTask(t, `t${i + 1}`, ctx));

  const idAt = (index: number) => tasks[index]?.id;
  const questions: PreparedQuestion[] = output.questions
    .filter((q) => q.text.trim())
    .map((q, i) => ({
      id: `q${i + 1}`,
      task_ids: q.task_indexes.map(idAt).filter((id): id is string => !!id),
      text: q.text.trim().slice(0, 500),
      answer: null,
    }));

  return {
    version: 1,
    source: { visit_id: source.visitId, assessment_id: summary.assessmentId, assessment_updated_at: source.assessmentUpdatedAt },
    groups: [...groups].map(([key, label]) => ({ key, label: label.slice(0, 200) })),
    tasks: bindQuantities(tasks, summary.rooms),
    questions,
    alternatives: output.alternatives
      .filter((a) => a.label.trim())
      .map((a, i) => ({
        id: `a${i + 1}`,
        label: a.label.trim().slice(0, 200),
        task_ids: a.task_indexes.map(idAt).filter((id): id is string => !!id),
        note: a.note?.slice(0, 500) ?? null,
      })),
    exclusions: output.exclusions.map((e) => e.trim().slice(0, 500)).filter(Boolean),
  };
}

function fmtHours(n: number): string {
  return String(Math.round(n * 4) / 4);
}

/**
 * One labor line (mid hours at the T&M rate) and one materials line per group
 * that has values. Groups still missing hours get no labor line; the prepared
 * scope keeps them visible. Returns the group key of each line by index.
 */
export function preparedScopeToLineItems(
  scope: PreparedScope,
  laborRateCents: number,
): { lineItems: PreparedLineItem[]; groupKeys: string[] } {
  const summary = summarizePreparedScope(scope);
  const lineItems: PreparedLineItem[] = [];
  const groupKeys: string[] = [];
  const pricing = scope.pricing;
  if (pricing?.mode === "fixed" && pricing.fixed_price_cents) {
    // Fixed price (TASK-180): per-group labor and materials lines summing to the price, no hours shown.
    for (const line of allocateFixedPrice(scope, laborRateCents, pricing.fixed_price_cents)) {
      lineItems.push({
        description: line.kind === "labor" ? `${line.label} — labor` : `${line.label} — materials allowance`,
        quantity: 1,
        unit_price_cents: line.cents,
        unit_cost_cents: line.kind === "materials" ? line.cents : null,
        line_item_type: line.kind,
        visible_to_customer: true,
        sort_order: lineItems.length,
      });
      groupKeys.push(line.group_key);
    }
    return { lineItems, groupKeys };
  }
  for (const g of summary.groups) {
    const mid = Math.round(((g.hours_low + g.hours_high) / 2) * 4) / 4;
    if (mid > 0) {
      lineItems.push({
        description: `${g.label} — labor, est. ${fmtHours(g.hours_low)}–${fmtHours(g.hours_high)} h`,
        quantity: mid,
        unit_price_cents: laborRateCents,
        line_item_type: "labor",
        visible_to_customer: true,
        sort_order: lineItems.length,
      });
      groupKeys.push(g.key);
    }
    if (g.materials_cents > 0) {
      lineItems.push({
        description: `${g.label} — materials allowance`,
        quantity: 1,
        unit_price_cents: g.materials_cents,
        unit_cost_cents: g.materials_cents,
        line_item_type: "materials",
        visible_to_customer: true,
        sort_order: lineItems.length,
      });
      groupKeys.push(g.key);
    }
  }
  return { lineItems, groupKeys };
}

/** Internal note summarizing the T&M range and what still needs the owner. */
export function preparedScopeInternalNote(scope: PreparedScope, laborRateCents: number): string {
  const s = summarizePreparedScope(scope);
  const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  const low = s.hours_low * laborRateCents + s.materials_cents;
  const high = s.hours_high * laborRateCents + s.materials_cents;
  const parts = [
    `Prepared from the site assessment. T&M estimate ${dollars(low)}–${dollars(high)}: ${fmtHours(s.hours_low)}–${fmtHours(s.hours_high)} h at ${dollars(laborRateCents)}/h plus ${dollars(s.materials_cents)} materials.`,
  ];
  if (s.tasks_without_hours > 0) parts.push(`${s.tasks_without_hours} task(s) still need hours.`);
  if (s.tasks_without_materials_price > 0) parts.push(`${s.tasks_without_materials_price} task(s) have no materials price yet.`);
  if (s.unconfirmed_suggestions > 0) parts.push(`${s.unconfirmed_suggestions} suggestion(s) await confirmation.`);
  const open = scope.questions.filter((q) => q.answer === null).length;
  if (open > 0) parts.push(`${open} open question(s).`);
  return parts.join(" ");
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  return _client;
}

/**
 * Ask the model for the work list. Returns null when no key is configured or
 * the response cannot be parsed, so the caller can fall back to a draft with
 * rooms and measurements only.
 */
export async function extractPreparedScope(
  summary: AssessmentSummary,
  priceBook: PriceBookHours[],
): Promise<PreparationOutput | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const response = await getClient().messages.parse({
    model: PREPARE_QUOTE_MODEL,
    max_tokens: 16000,
    // Cast: the SDK's types name Zod 3, its runtime needs Zod 4. The result is
    // re-validated below, so nothing unchecked reaches the caller.
    output_config: {
      effort: "medium",
      format: zodOutputFormat(preparationOutputSchema as unknown as Parameters<typeof zodOutputFormat>[0]),
    },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPreparationPrompt(summary, priceBook) }],
  });
  if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") return null;
  const parsed = preparationOutputSchema.safeParse(response.parsed_output);
  return parsed.success ? parsed.data : null;
}

/**
 * Owner edits to itemized materials (TASK-187): quantity and unit price of
 * stored lines, and removing lines. Lines and lists only come from the server;
 * a changed price is labeled the owner's.
 */
function mergeMaterialEdits(
  stored: PreparedScope["materials"],
  incoming: PreparedScope["materials"],
): PreparedScope["materials"] {
  if (!stored) return stored;
  if (!incoming) return stored;
  const out: NonNullable<PreparedScope["materials"]> = {};
  for (const [key, list] of Object.entries(stored)) {
    const edited = incoming[key];
    if (!edited) {
      out[key] = list;
      continue;
    }
    const byId = new Map(edited.lines.map((l) => [l.id, l]));
    out[key] = {
      ...list,
      lines: list.lines.flatMap((l) => {
        const e = byId.get(l.id);
        if (!e) return [];
        const priceChanged = e.unit_cost_cents !== l.unit_cost_cents;
        return [{ ...l, quantity: e.quantity, unit_cost_cents: e.unit_cost_cents, source: priceChanged ? "owner" : l.source }];
      }),
    };
  }
  return out;
}

/**
 * Merge the owner's edits into the stored scope. Only hours, materials,
 * confirmation and answers can change; rooms, quantities, source and task text
 * come from the stored copy, and unknown task or question ids are ignored.
 * Changed hours are labeled as the owner's. Pure.
 */
export function applyScopeEdits(stored: PreparedScope, incoming: PreparedScope): PreparedScope {
  const editedTasks = new Map(incoming.tasks.map((t) => [t.id, t]));
  const answers = new Map(incoming.questions.map((q) => [q.id, q.answer]));
  return {
    ...stored,
    tasks: stored.tasks.map((t) => {
      const e = editedTasks.get(t.id);
      if (!e) return t;
      let low = e.hours_low;
      let high = e.hours_high;
      if (low !== null && high !== null && low > high) [low, high] = [high, low];
      const hoursChanged = low !== t.hours_low || high !== t.hours_high;
      return {
        ...t,
        hours_low: low,
        hours_high: high,
        hours_source: hoursChanged ? (low === null && high === null ? null : "owner") : t.hours_source,
        materials_cents: e.materials_cents,
        confirmed: e.confirmed,
      };
    }),
    pricing: incoming.pricing ?? stored.pricing,
    materials: mergeMaterialEdits(stored.materials, incoming.materials),
    // Server-managed: only Apply sets it.
    proposal_notes: stored.proposal_notes ?? null,
    questions: stored.questions.map((q) => {
      const a = answers.get(q.id);
      return a === undefined ? q : { ...q, answer: a && a.trim() ? a.trim().slice(0, 1000) : null };
    }),
  };
}

/**
 * Customer-facing "What's included" text for the quote notes (TASK-180):
 * included work by group, options the customer can choose, the allowance note
 * and the pricing terms. Never mentions hours, cost or margin. Pure.
 */
export function buildProposalNotes(scope: PreparedScope, laborRateCents: number): string {
  const summary = summarizePreparedScope(scope);
  const labels = new Map(scope.groups.map((g) => [g.key, g.label]));
  const order = [...scope.groups.map((g) => g.key), ...scope.tasks.map((t) => t.group_key)].filter(
    (k, i, all) => all.indexOf(k) === i,
  );
  const sections: string[] = ["What's included"];
  for (const key of order) {
    const included = scope.tasks.filter((t) => t.group_key === key && t.confirmed);
    if (included.length === 0) continue;
    sections.push(`${labels.get(key) ?? key}\n${included.map((t) => `- ${t.description}`).join("\n")}`);
  }
  const options = scope.alternatives.length
    ? scope.alternatives.map((a) => a.label)
    : scope.tasks.filter((t) => !t.confirmed).map((t) => t.description);
  if (options.length) {
    sections.push(`Options (not included unless you choose them)\n${options.map((o) => `- ${o}`).join("\n")}`);
  }
  if (scope.tasks.some((t) => t.confirmed && t.materials_cents !== null && t.materials_cents > 0)) {
    sections.push("Materials are allowances. The final cost follows the products chosen.");
  }
  const dollars = (c: number) => `$${Math.round(c / 100).toLocaleString("en-US")}`;
  if (scope.pricing?.mode === "fixed" && scope.pricing.fixed_price_cents) {
    sections.push(`Pricing: fixed price of ${dollars(scope.pricing.fixed_price_cents)} for the work above.`);
  } else if (summary.hours_high > 0) {
    const low = summary.hours_low * laborRateCents + summary.materials_cents;
    const high = summary.hours_high * laborRateCents + summary.materials_cents;
    sections.push(`Pricing: time and materials, estimated ${dollars(low)}–${dollars(high)}. You are billed for the actual time and materials used.`);
  }
  return sections.join("\n\n");
}
