import { describe, expect, it } from "vitest";
import { buildVisitChangeOrderDraft } from "../draft";

describe("buildVisitChangeOrderDraft", () => {
  it("includes visit, job, and estimate context in the draft", () => {
    const draft = buildVisitChangeOrderDraft({
      visitId: "visit-123",
      jobId: "job-456",
      estimateId: "est-789",
      conditionLabels: ["Hidden damage behind walls or fixtures", "Previous poor workmanship found"],
      notes: "Closet door trim is also damaged.",
      scopeAssumptions: "No hidden wall damage was expected.",
      currentTechNotes: "Client asked about vanity replacement.",
    });

    expect(draft.title).toBe("On-site scope change: Hidden damage behind walls or fixtures, Previous poor workmanship found");
    expect(draft.lineItemDescription).toBe("Scope change — Hidden damage behind walls or fixtures, Previous poor workmanship found");
    expect(draft.description).toContain("Visit: visit-123");
    expect(draft.description).toContain("Job: job-456");
    expect(draft.description).toContain("Estimate: est-789");
    expect(draft.description).toContain("Closet door trim is also damaged.");
    expect(draft.notes).toContain("Source visit: visit-123");
    expect(draft.notes).toContain("Source job: job-456");
    expect(draft.notes).toContain("Approved estimate: est-789");
  });
});
