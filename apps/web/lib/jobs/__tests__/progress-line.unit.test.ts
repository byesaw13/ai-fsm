import { describe, expect, it } from "vitest";
import { jobProgressSteps, type JobProgressInput } from "../progress-line";

function input(o: Partial<JobProgressInput> = {}): JobProgressInput {
  return {
    jobStatus: "draft",
    requestId: null,
    estimateId: null,
    estimateSent: false,
    approvedEstimateId: null,
    invoiceId: null,
    invoiceStatus: null,
    ...o,
  };
}

const view = (o: Partial<JobProgressInput>) =>
  jobProgressSteps(input(o)).map((s) => `${s.label}:${s.state}`).join(" ");

describe("job progress line (TASK-240)", () => {
  it("a new draft job is past the call and waiting on an estimate", () => {
    expect(view({})).toBe(
      "Call:done Estimate:current Approved:todo Working:todo Invoiced:todo Paid:todo",
    );
  });

  it("a sent estimate waits on approval", () => {
    expect(view({ jobStatus: "quoted", estimateId: "e1", estimateSent: true })).toBe(
      "Call:done Estimate:done Approved:current Working:todo Invoiced:todo Paid:todo",
    );
  });

  it("an approved, scheduled job is ready to work", () => {
    expect(
      view({ jobStatus: "scheduled", estimateId: "e1", estimateSent: true, approvedEstimateId: "e1" }),
    ).toBe("Call:done Estimate:done Approved:done Working:current Invoiced:todo Paid:todo");
  });

  it("a finished job with a sent invoice waits on payment", () => {
    expect(
      view({
        jobStatus: "invoiced",
        estimateId: "e1",
        estimateSent: true,
        approvedEstimateId: "e1",
        invoiceId: "i1",
        invoiceStatus: "sent",
      }),
    ).toBe("Call:done Estimate:done Approved:done Working:done Invoiced:done Paid:current");
  });

  it("a paid job is all done", () => {
    const steps = jobProgressSteps(
      input({ jobStatus: "invoiced", estimateId: "e1", approvedEstimateId: "e1", invoiceId: "i1", invoiceStatus: "paid" }),
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("a draft invoice does not count as invoiced", () => {
    expect(view({ jobStatus: "completed", approvedEstimateId: "e1", estimateId: "e1", invoiceId: "i1", invoiceStatus: "draft" })).toBe(
      "Call:done Estimate:done Approved:done Working:done Invoiced:current Paid:todo",
    );
  });

  it("a draft invoice prepared early keeps Working current on an open job", () => {
    expect(
      view({ jobStatus: "in_progress", estimateId: "e1", estimateSent: true, approvedEstimateId: "e1", invoiceId: "i1", invoiceStatus: "draft" }),
    ).toBe("Call:done Estimate:done Approved:done Working:current Invoiced:todo Paid:todo");
  });

  it("a quick job with no estimate skips Estimate and Approved", () => {
    expect(view({ jobStatus: "in_progress" })).toBe("Call:done Working:current Invoiced:todo Paid:todo");
    expect(view({ jobStatus: "completed", invoiceId: "i1", invoiceStatus: "partial" })).toBe(
      "Call:done Working:done Invoiced:done Paid:current",
    );
  });

  it("finished steps link to their record", () => {
    const steps = jobProgressSteps(
      input({ jobStatus: "invoiced", requestId: "r1", estimateId: "e1", estimateSent: true, approvedEstimateId: "e2", invoiceId: "i1", invoiceStatus: "sent" }),
    );
    const href = (label: string) => steps.find((s) => s.label === label)?.href;
    expect(href("Call")).toBe("/app/requests/r1");
    expect(href("Estimate")).toBe("/app/estimates/e1");
    expect(href("Approved")).toBe("/app/estimates/e2");
    expect(href("Invoiced")).toBe("/app/invoices/i1");
    expect(href("Paid")).toBeUndefined();
  });

  it("a later step being done means the earlier ones are too", () => {
    expect(view({ jobStatus: "in_progress", estimateId: "e1", approvedEstimateId: "e1" })).toBe(
      "Call:done Estimate:done Approved:done Working:current Invoiced:todo Paid:todo",
    );
  });

  it("a cancelled job shows no line", () => {
    expect(jobProgressSteps(input({ jobStatus: "cancelled" }))).toEqual([]);
  });
});
