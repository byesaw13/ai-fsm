import { formatCentsShort } from "@ai-fsm/money";

/**
 * Pure helpers for creating a job from an approved estimate.
 *
 * When an approved estimate has no linked job, the workflow Estimate → Job →
 * Visit dead-ends. The "Create Linked Job" action fills that gap by spawning a
 * job pre-populated from the estimate. These helpers derive the job's title and
 * scope text deterministically so they can be unit-tested without a database.
 */

export interface EstimateForJob {
  notes: string | null;
  property_address: string | null;
  client_name: string | null;
  total_cents: number;
}

/**
 * Derive a concise, human job title from an approved estimate.
 *
 * Priority:
 *   1. First non-empty line of the estimate notes (the scope), trimmed to 80 chars.
 *   2. "Work at {property address}".
 *   3. "Approved work for {client name}".
 *   4. "Approved estimate work".
 */
export function deriveJobTitle(est: EstimateForJob): string {
  const firstLine = (est.notes ?? "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);

  if (firstLine) {
    // Cap total length at 80 chars including the ellipsis.
    return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
  }
  if (est.property_address?.trim()) {
    return `Work at ${est.property_address.trim()}`;
  }
  if (est.client_name?.trim()) {
    return `Approved work for ${est.client_name.trim()}`;
  }
  return "Approved estimate work";
}

/**
 * Build the job description (scope summary) from the estimate.
 * Always references the source estimate value so the job carries context.
 */
export function deriveJobDescription(est: EstimateForJob): string {
  const parts: string[] = [];
  if (est.notes?.trim()) parts.push(est.notes.trim());
  parts.push(`Created from approved estimate (${formatCentsShort(est.total_cents)}).`);
  return parts.join("\n\n");
}
