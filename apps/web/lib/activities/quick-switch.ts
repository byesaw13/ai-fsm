import { ACTIVITY_TYPES, type ActivityType } from "@ai-fsm/domain";

/**
 * Pick the activities to surface as one-tap quick-switch chips (TASK-021).
 *
 * Ordering: most-recently-used first (by the latest start time seen today),
 * then top up with sensible field defaults so there are always `count` chips
 * even at the start of the day. The result is de-duplicated and capped.
 *
 * Pure — no I/O. Keeping the "what shows on the bar" decision here means the
 * NowBar stays a dumb renderer and the policy is unit-tested.
 */

export interface QuickSwitchEntry {
  activity_type: string;
  started_at: string; // ISO
}

// Default chips before the day has any history — the activities a field tech
// reaches for most, in priority order.
export const DEFAULT_QUICK_ACTIVITIES: ActivityType[] = [
  "job_work",
  "travel",
  "material_run",
  "admin",
];

const isActivityType = (t: string): t is ActivityType =>
  (ACTIVITY_TYPES as readonly string[]).includes(t);

export function pickQuickActivities(
  entries: QuickSwitchEntry[],
  count = 4,
): ActivityType[] {
  // Latest start time per valid activity type.
  const lastUsed = new Map<ActivityType, number>();
  for (const e of entries) {
    if (!isActivityType(e.activity_type)) continue;
    const t = new Date(e.started_at).getTime();
    if (Number.isNaN(t)) continue;
    const prev = lastUsed.get(e.activity_type);
    if (prev === undefined || t > prev) lastUsed.set(e.activity_type, t);
  }

  // Recently used, most-recent first.
  const recent = [...lastUsed.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type);

  // Recent first, then defaults, deduped, capped at `count`.
  const ordered: ActivityType[] = [];
  for (const type of [...recent, ...DEFAULT_QUICK_ACTIVITIES]) {
    if (!ordered.includes(type)) ordered.push(type);
    if (ordered.length >= count) break;
  }
  return ordered;
}
