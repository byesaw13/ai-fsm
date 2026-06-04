export interface VisitChangeOrderDraftInput {
  visitId: string;
  jobId: string;
  estimateId: string;
  conditionLabels: string[];
  notes: string;
  scopeAssumptions: string | null;
  currentTechNotes: string | null;
}

export interface VisitChangeOrderDraft {
  title: string;
  description: string;
  notes: string;
  lineItemDescription: string;
}

function joinConditions(conditionLabels: string[]): string {
  if (conditionLabels.length === 0) return "On-site scope change";
  if (conditionLabels.length === 1) return conditionLabels[0];
  if (conditionLabels.length === 2) return conditionLabels.join(", ");
  return `${conditionLabels.slice(0, 2).join(", ")}…`;
}

export function buildVisitChangeOrderDraft(input: VisitChangeOrderDraftInput): VisitChangeOrderDraft {
  const conditionSummary = joinConditions(input.conditionLabels);
  const noteSummary = input.notes.trim();
  const techNotes = input.currentTechNotes?.trim();
  const scopeAssumptions = input.scopeAssumptions?.trim();

  const title = input.conditionLabels.length > 0
    ? `On-site scope change: ${conditionSummary}`
    : "On-site scope change";

  const descriptionLines = [
    "Conditions found on arrival differing from estimate assumptions:",
    ...(input.conditionLabels.length > 0 ? input.conditionLabels.map((label) => `• ${label}`) : ["• No specific condition selected"]),
  ];

  if (noteSummary) {
    descriptionLines.push("", `Notes: ${noteSummary}`);
  }

  const contextLines = [
    "",
    "Visit context:",
    `- Visit: ${input.visitId}`,
    `- Job: ${input.jobId}`,
    `- Estimate: ${input.estimateId}`,
  ];

  if (scopeAssumptions) {
    contextLines.push(`- Estimated assumptions: ${scopeAssumptions}`);
  }

  if (techNotes) {
    contextLines.push(`- Technician notes: ${techNotes}`);
  }

  const description = [...descriptionLines, ...contextLines].join("\n");

  const notesBlock = [
    `Source visit: ${input.visitId}`,
    `Source job: ${input.jobId}`,
    `Approved estimate: ${input.estimateId}`,
    `Suggested line item: ${conditionSummary}`,
  ].join("\n");

  const lineItemDescription = input.conditionLabels.length > 0
    ? `Scope change — ${conditionSummary}`
    : "Scope change — visit review";

  return {
    title,
    description,
    notes: notesBlock,
    lineItemDescription,
  };
}
