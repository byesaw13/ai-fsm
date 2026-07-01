/** A single checklist item gating work order completion. */
export interface CompletionCriterion {
  id: string;
  label: string;
  required: boolean;
  completed: boolean;
}

export interface LineItemForCriteria {
  description: string;
  line_item_type?: string;
}

/** Build completion criteria from estimate line items (labor → required checklist). */
export function seedCompletionCriteriaFromLineItems(
  lineItems: LineItemForCriteria[],
): CompletionCriterion[] {
  return lineItems
    .filter((li) => (li.line_item_type ?? "labor") === "labor")
    .map((li, i) => ({
      id: `li-${i}`,
      label: (li.description ?? "").trim(),
      required: true,
      completed: false,
    }))
    .filter((c) => c.label.length > 0);
}

export function allRequiredCriteriaMet(criteria: CompletionCriterion[]): boolean {
  const required = criteria.filter((c) => c.required);
  if (required.length === 0) return true;
  return required.every((c) => c.completed);
}

const TERMINAL_VISIT = new Set(["completed", "cancelled"]);

/** Gate manual or derived transition to work order `completed`. */
export function completionGateMessage(
  visits: Array<{ status: string }>,
  criteria: CompletionCriterion[],
): string | null {
  if (visits.length === 0) {
    return "Schedule and complete at least one visit before closing this work order";
  }
  if (!visits.every((v) => TERMINAL_VISIT.has(v.status))) {
    return "All visits must be completed or cancelled before closing this work order";
  }
  if (!visits.some((v) => v.status === "completed")) {
    return "At least one visit must be completed before closing this work order";
  }
  if (!allRequiredCriteriaMet(criteria)) {
    return "All required completion criteria must be checked before closing this work order";
  }
  return null;
}