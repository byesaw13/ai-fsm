/** Presentation rules for Today and the active visit. No new workflow. */

export function fieldPlaceTitle(
  clientName: string | null | undefined,
  address: string | null | undefined,
): string {
  const client = clientName?.trim();
  if (client) return client;
  const street = address?.trim();
  if (street) return street;
  return "This house";
}

export function fieldPurpose(jobTitle: string | null | undefined, fallback = "Visit"): string {
  const title = jobTitle?.trim();
  return title || fallback;
}

/** One verb on Today. On site, go back to the work. Otherwise go there. */
export function todayCommand(
  status: string,
  hasAddress: boolean,
): { verb: "navigate" | "continue" | "start"; label: string } {
  if (status === "arrived" || status === "in_progress" || status === "waiting") {
    return { verb: "continue", label: "Continue work" };
  }
  if (hasAddress) return { verb: "navigate", label: "Navigate" };
  return { verb: "start", label: "Start job" };
}

export function todayWhenLabel(status: string): string {
  if (status === "arrived" || status === "in_progress" || status === "waiting") return "Right now";
  if (status === "traveling" || status === "dispatched") return "On the way";
  return "Next";
}

export function materialsNeededCount(text: string | null | undefined): number {
  return (text ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export function materialsNeededLine(text: string | null | undefined): string | null {
  const count = materialsNeededCount(text);
  if (count === 0) return null;
  return count === 1 ? "1 item still needed" : `${count} items still needed`;
}

export function openFieldTasks<T extends { completed: boolean; status: string }>(tasks: T[]): T[] {
  return tasks.filter((task) => !task.completed && task.status !== "done");
}

/** Partial means this task was started and left unfinished. That is the only dry-time signal. */
export function restOfVisitHeading(firstStatus: string | null | undefined): string {
  return firstStatus === "partial" ? "While that dries" : "Still on this visit";
}

export function visitFaceStatus(status: string): string {
  if (status === "in_progress" || status === "arrived" || status === "waiting") return "In progress";
  if (status === "traveling" || status === "dispatched") return "On the way";
  if (status === "completed") return "Done";
  if (status === "cancelled") return "Cancelled";
  return "Next";
}

export type VisitFieldKindName = "standard" | "site_visit" | "membership" | "repair";

export type VisitCommand =
  | { kind: "start"; label: "Start job"; nextStatus: "arrived" | "in_progress" }
  | { kind: "task"; label: "Complete task" }
  | { kind: "navigate"; label: "Navigate" }
  | { kind: "assessment"; label: "Open assessment" }
  | { kind: "closeout"; label: "Complete walkthrough" }
  | { kind: "none" };

/**
 * On a work visit, start the visit before completing a task.
 * A site visit opens the assessment until that assessment is saved,
 * then the existing walkthrough close is the next action.
 * Membership does not invent a task.
 */
export function visitCommand(input: {
  status: string;
  fieldKind: VisitFieldKindName;
  hasOpenTask: boolean;
  hasAddress: boolean;
  assessmentComplete?: boolean;
}): VisitCommand {
  if (input.status === "completed" || input.status === "cancelled") return { kind: "none" };
  if (input.fieldKind === "site_visit") {
    if (input.assessmentComplete) return { kind: "closeout", label: "Complete walkthrough" };
    return { kind: "assessment", label: "Open assessment" };
  }
  if (
    input.fieldKind !== "membership" &&
    (input.status === "in_progress" || input.status === "waiting") &&
    input.hasOpenTask
  ) {
    return { kind: "task", label: "Complete task" };
  }
  if (input.status === "scheduled") return { kind: "start", label: "Start job", nextStatus: "arrived" };
  if (input.status === "arrived") return { kind: "start", label: "Start job", nextStatus: "in_progress" };
  if ((input.status === "dispatched" || input.status === "traveling") && input.hasAddress) {
    return { kind: "navigate", label: "Navigate" };
  }
  return { kind: "none" };
}

export function showLeaveList(status: string): boolean {
  return status === "arrived" || status === "in_progress" || status === "waiting";
}

export function leaveChecks(input: {
  photoCount: number;
  materialsUsed: string | null | undefined;
  /** Repair visits record parts in visit_parts instead of materials_used. */
  partsRecorded?: number;
  techNotes: string | null | undefined;
  hasNextVisit: boolean;
}): { key: "photos" | "materials" | "note" | "next"; label: string; done: boolean }[] {
  const materialsDone = Boolean(input.materialsUsed?.trim()) || (input.partsRecorded ?? 0) > 0;
  return [
    { key: "photos", label: "Photos", done: input.photoCount > 0 },
    { key: "materials", label: "Materials", done: materialsDone },
    { key: "note", label: "Customer note", done: Boolean(input.techNotes?.trim()) },
    { key: "next", label: "Next visit", done: input.hasNextVisit },
  ];
}
