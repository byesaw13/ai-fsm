/**
 * Activity ledger taxonomy — where the owner's time actually goes.
 *
 * Deliberately small: 5 categories, 13 types. Adding a type is a code change
 * (a PR), which is friction by design — taxonomy creep makes switching slower
 * and reports muddier. The ledger rules live in the API:
 *   - at most one active activity per account
 *   - starting a new activity closes the previous one
 *   - the timesheet is derived, never entered
 */

export const ACTIVITY_CATEGORIES = ["revenue", "sales", "office", "growth", "personal"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export const ACTIVITY_TYPES = [
  "job_work",
  "travel",
  "material_run",
  "estimate_visit",
  "estimate_writing",
  "follow_up",
  "invoicing",
  "admin",
  "customer_comms",
  "fsm_development",
  "training",
  "marketing",
  "personal",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityTypeMeta {
  label: string;
  category: ActivityCategory;
  emoji: string;
}

export const ACTIVITY_TYPE_META: Record<ActivityType, ActivityTypeMeta> = {
  job_work:         { label: "Job Work",        category: "revenue",  emoji: "🛠️" },
  travel:           { label: "Travel",          category: "revenue",  emoji: "🚗" },
  material_run:     { label: "Material Run",    category: "revenue",  emoji: "🛒" },
  estimate_visit:   { label: "Estimate Visit",  category: "sales",    emoji: "🏠" },
  estimate_writing: { label: "Estimate Writing",category: "sales",    emoji: "📝" },
  follow_up:        { label: "Follow Up",       category: "sales",    emoji: "📞" },
  invoicing:        { label: "Invoicing",       category: "office",   emoji: "🧾" },
  admin:            { label: "Admin",           category: "office",   emoji: "🗂️" },
  customer_comms:   { label: "Customer Comms",  category: "office",   emoji: "💬" },
  fsm_development:  { label: "FSM Development", category: "growth",   emoji: "💻" },
  training:         { label: "Training",        category: "growth",   emoji: "🎓" },
  marketing:        { label: "Marketing",       category: "growth",   emoji: "📣" },
  personal:         { label: "Personal",        category: "personal", emoji: "☕" },
};

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategory, string> = {
  revenue: "Revenue",
  sales: "Sales",
  office: "Office",
  growth: "Growth",
  personal: "Personal",
};

/** Entity kinds an activity entry may link to (at most one per entry). */
export const ACTIVITY_ENTITY_TYPES = ["job", "visit", "estimate", "invoice", "client", "expense"] as const;
export type ActivityEntityType = (typeof ACTIVITY_ENTITY_TYPES)[number];

export function activityCategoryFor(type: ActivityType): ActivityCategory {
  return ACTIVITY_TYPE_META[type].category;
}
