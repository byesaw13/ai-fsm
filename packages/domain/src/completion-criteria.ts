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
      label: li.description.trim(),
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