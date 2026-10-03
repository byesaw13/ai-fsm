import { outcomeBlocksBilling } from "./line-outcome";

export type InvoiceReviewTask = {
  id: string;
  label: string;
  required: boolean;
  completion_outcome: string | null;
};

export type InvoiceReviewLine = {
  description: string;
  line_item_type: string;
};

export type InvoiceException = {
  id: string;
  message: string;
};

function lineMentions(lines: InvoiceReviewLine[], pattern: RegExp): boolean {
  return lines.some((line) => pattern.test(line.description));
}

/**
 * Issues to resolve before sending a bill. Empty means the invoice can go out.
 * Drafts are the review surface. Sent bills still show a deferred item that was billed.
 */
export function invoiceReviewExceptions(input: {
  tasks: InvoiceReviewTask[];
  lines: InvoiceReviewLine[];
  cardFeePct: number;
}): InvoiceException[] {
  const issues: InvoiceException[] = [];

  for (const task of input.tasks) {
    if (!task.required) continue;
    if (!task.completion_outcome) {
      issues.push({
        id: `outcome-${task.id}`,
        message: `${task.label} has no completion state.`,
      });
      continue;
    }
    if (outcomeBlocksBilling(task.completion_outcome) && lineMentions(input.lines, new RegExp(escapeRegExp(task.label), "i"))) {
      const state = task.completion_outcome === "deferred"
        ? "deferred"
        : task.completion_outcome === "removed_credited"
          ? "removed"
          : "not completed";
      issues.push({
        id: `billed-${task.id}`,
        message: `${task.label} is ${state} and still appears on this invoice.`,
      });
    }
  }

  const fee = Number(input.cardFeePct);
  if (Number.isFinite(fee) && fee > 0 && !lineMentions(input.lines, /card fee/i)) {
    issues.push({
      id: "card-fee",
      message: `Card fee policy is ${fee}%. Confirm it is on this invoice or leave it off on purpose.`,
    });
  }

  return issues;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
