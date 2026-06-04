export interface VisitChangeOrderDraftInput {
  visitId: string;
  jobId: string;
  estimateId: string;
  conditionLabels: string[];
  notes: string;
  scopeAssumptions: string | null;
  currentTechNotes: string | null;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  partsCount?: number;
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
  const beforePhotoCount = input.beforePhotoCount ?? 0;
  const afterPhotoCount = input.afterPhotoCount ?? 0;
  const partsCount = input.partsCount ?? 0;

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

  if (beforePhotoCount > 0 || afterPhotoCount > 0 || partsCount > 0) {
    contextLines.push(
      `- Evidence captured: ${beforePhotoCount} before photo${beforePhotoCount === 1 ? "" : "s"}, ${afterPhotoCount} after photo${afterPhotoCount === 1 ? "" : "s"}, ${partsCount} part${partsCount === 1 ? "" : "s"}`
    );
  }

  const description = [...descriptionLines, ...contextLines].join("\n");

  const notesBlock = [
    `Source visit: ${input.visitId}`,
    `Source job: ${input.jobId}`,
    `Approved estimate: ${input.estimateId}`,
    `Suggested line item: ${conditionSummary}`,
    `Evidence: ${beforePhotoCount} before photo${beforePhotoCount === 1 ? "" : "s"}, ${afterPhotoCount} after photo${afterPhotoCount === 1 ? "" : "s"}, ${partsCount} part${partsCount === 1 ? "" : "s"}`,
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
