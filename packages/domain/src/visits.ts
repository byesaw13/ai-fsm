import { z } from "zod";

const uuidField = z.string().uuid();
const timestampField = z.string().datetime();

export const checklistDispositionSchema = z.enum([
  "ok",
  "fix_now",
  "monitor",
  "optional",
  "refer",
]);
export type ChecklistDisposition = z.infer<typeof checklistDispositionSchema>;

export const CHECKLIST_DISPOSITION_LABELS: Record<ChecklistDisposition, string> = {
  ok: "OK",
  fix_now: "Fix Now",
  monitor: "Monitor",
  optional: "Optional",
  refer: "Refer to Trade",
};

/** Ordered sections matching the SOP visit flow (Playbook v1.2 §4.2). */
export const CHECKLIST_SECTIONS = [
  "Exterior",
  "Interior — Living Areas",
  "Kitchen",
  "Bathrooms",
  "Basement / Utility / Mechanical",
  "Attic / Upper Areas",
] as const;
export type ChecklistSection = (typeof CHECKLIST_SECTIONS)[number];

export const visitChecklistItemSchema = z.object({
  id: uuidField,
  account_id: uuidField,
  visit_id: uuidField,
  section: z.string().min(1),
  item_key: z.string().min(1),
  label: z.string().min(1),
  disposition: checklistDispositionSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  created_at: timestampField,
  updated_at: timestampField,
});
export type VisitChecklistItem = z.infer<typeof visitChecklistItemSchema>;

export const updateChecklistItemSchema = z.object({
  disposition: checklistDispositionSchema.nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
}).refine(
  (d) => d.disposition !== undefined || d.note !== undefined,
  { message: "At least one of disposition or note is required" }
);
