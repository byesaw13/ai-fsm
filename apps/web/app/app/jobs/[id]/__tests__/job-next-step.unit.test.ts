/**
 * TASK-239: the job page leads with one status sentence and exactly one
 * primary button, for every job state.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { jobStatusSchema, PIPELINE_STAGE_ORDER } from "@ai-fsm/domain";
import { computeWhatNext, ProjectWhatNext, type ProjectWhatNextProps } from "../ProjectWhatNext";

// The real lists, so every job state is covered.
const STATUSES = jobStatusSchema.options;
const STAGES = PIPELINE_STAGE_ORDER;

function props(overrides: Partial<ProjectWhatNextProps>): ProjectWhatNextProps {
  return {
    jobId: "job-1",
    clientId: "client-1",
    jobStatus: "draft",
    stage: "estimate_needed",
    pricingMode: "flat_rate",
    bookingRequestId: null,
    estimateCount: 0,
    hasSentEstimate: false,
    lastEstimateSentAt: null,
    hasApprovedEstimate: false,
    approvedEstimateId: null,
    hasDepositInvoice: false,
    depositPaid: false,
    hasActiveVisit: false,
    activeVisitId: null,
    latestVisitId: null,
    hasUnpaidInvoice: false,
    hasPaidInvoice: false,
    latestInvoiceId: null,
    hasOpenPreSaleSiteVisit: false,
    hasCompletedPreSaleSiteVisit: false,
    hasExpiredEstimate: false,
    latestExpiredEstimateId: null,
    hasDraftWorkOrderWithPricing: false,
    preSaleSiteVisitId: null,
    ...overrides,
  } as ProjectWhatNextProps;
}

/** A spread of real-looking states: every status × stage, with and without money and visits. */
function states(): ProjectWhatNextProps[] {
  const out: ProjectWhatNextProps[] = [];
  for (const jobStatus of STATUSES) {
    for (const stage of STAGES) {
      out.push(props({ jobStatus, stage } as Partial<ProjectWhatNextProps>));
      out.push(
        props({
          jobStatus,
          stage,
          estimateCount: 1,
          hasSentEstimate: true,
          hasApprovedEstimate: true,
          approvedEstimateId: "est-1",
          hasDepositInvoice: true,
          depositPaid: true,
          hasActiveVisit: true,
          activeVisitId: "visit-1",
          latestVisitId: "visit-1",
          hasUnpaidInvoice: true,
          latestInvoiceId: "inv-1",
        } as Partial<ProjectWhatNextProps>),
      );
      out.push(
        props({
          jobStatus,
          stage,
          hasPaidInvoice: true,
          latestInvoiceId: "inv-1",
          readyForCloseout: true,
          hasCompletedExecutionVisit: true,
        } as Partial<ProjectWhatNextProps>),
      );
    }
  }
  return out;
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe("job page next step (TASK-239)", () => {
  it("every state has a plain status sentence", () => {
    for (const p of states()) {
      const next = computeWhatNext(p);
      expect(next.message.trim().length, `${p.jobStatus}/${p.stage}`).toBeGreaterThan(0);
    }
  });

  it("every state renders at most one primary button, and exactly one when there is an action", () => {
    for (const p of states()) {
      const next = computeWhatNext(p);
      const html = renderToStaticMarkup(createElement(ProjectWhatNext, p));
      const primaries = count(html, 'data-testid="project-what-next-primary"');
      const expected = next.actionLabel && next.actionHref ? 1 : 0;
      expect(primaries, `${p.jobStatus}/${p.stage}`).toBe(expected);
      expect(count(html, "p7-btn-primary"), `${p.jobStatus}/${p.stage}`).toBe(expected);
    }
  });

  it("states the next step in a sentence at the top", () => {
    const html = renderToStaticMarkup(createElement(ProjectWhatNext, props({})));
    expect(html).toContain('data-testid="project-what-next-message"');
    expect(html.indexOf("project-what-next-message")).toBeLessThan(html.indexOf("project-what-next-primary"));
  });
});

describe("close-out actions reach a panel the layout shows (TASK-239)", () => {
  it("uses the layout's own Close Out anchor", () => {
    const ready = { readyForCloseout: true, jobStatus: "in_progress", stage: "in_progress" } as Partial<ProjectWhatNextProps>;
    expect(computeWhatNext(props(ready)).actionHref).toBe("/app/jobs/job-1#project-status");
    expect(computeWhatNext(props({ ...ready, statusAnchorId: "project-status-mobile" })).actionHref).toBe(
      "/app/jobs/job-1#project-status-mobile",
    );
  });
});
