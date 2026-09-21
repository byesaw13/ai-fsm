/**
 * Night stop interview — TASK-145.
 *
 * GPS already has the stops. The owner says what each one was. Pure.
 * Creating jobs and filing receipts is the API's job.
 */

import { SCHEDULABLE_JOB_STATUSES } from "./scheduling-guard";

export const STOP_REASONS = [
  "job_work",
  "new_work",
  "pickup",
  "store",
  "not_work",
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export const STOP_REASON_LABELS: Record<StopReason, string> = {
  job_work: "Work on this job",
  new_work: "New work here",
  pickup: "Pickup / tools (not a bill)",
  store: "Store / materials",
  not_work: "Not work",
};

const STORE_TOKENS = [
  "home depot",
  "lowe",
  "ferguson",
  "grainger",
  "harbor freight",
  "menards",
  "ace hardware",
] as const;

export function isOpenJobStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return (SCHEDULABLE_JOB_STATUSES as readonly string[]).includes(status);
}

export function looksLikeStorePlace(place: string | null | undefined): boolean {
  const p = (place ?? "").trim().toLowerCase();
  if (!p) return false;
  return STORE_TOKENS.some((token) => p.includes(token));
}

export function stopReasonOptions(input: {
  hasOpenJob: boolean;
  hasProperty: boolean;
}): StopReason[] {
  const opts: StopReason[] = [];
  if (input.hasOpenJob) opts.push("job_work");
  if (input.hasProperty) opts.push("new_work");
  opts.push("pickup", "store", "not_work");
  return opts;
}

/**
 * Suggested chip only. Never default job_work onto a closed/invoiced house.
 * Store places default to store. Unknown places have no default — must ask.
 */
export function defaultStopReason(input: {
  hasOpenJob: boolean;
  looksLikeStore: boolean;
}): StopReason | null {
  if (input.looksLikeStore) return "store";
  if (input.hasOpenJob) return "job_work";
  return null;
}

export function stopRequiresNotes(reason: StopReason): boolean {
  return reason === "job_work" || reason === "new_work";
}

export function stopCreatesJob(reason: StopReason): boolean {
  return reason === "new_work";
}

export function stopIsBillable(reason: StopReason): boolean {
  return reason === "job_work" || reason === "new_work";
}

/** Night leftover skip: already answered, or this house was filed Done today. */
export function shouldSkipNightStopInterview(input: {
  answeredReason: string | null;
  propertyId: string | null;
  closedOutPropertyIds: ReadonlySet<string>;
}): boolean {
  if (input.answeredReason) return true;
  if (input.propertyId && input.closedOutPropertyIds.has(input.propertyId)) return true;
  return false;
}
