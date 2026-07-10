/**
 * ProjectWhatNext — unit tests for single project handoff compute.
 */

import { describe, it, expect } from "vitest";
import {
  computeWhatNext,
  type ProjectWhatNextProps,
} from "../ProjectWhatNext";

const JOB_ID = "job-11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "client-22222222-2222-2222-2222-222222222222";
const VISIT_ID = "visit-33333333-3333-3333-3333-333333333333";
const EXPIRED_ESTIMATE_ID = "est-44444444-4444-4444-4444-444444444444";
const INVOICE_ID = "inv-55555555-5555-5555-5555-555555555555";
const ESTIMATE_ID = "est-66666666-6666-6666-6666-666666666666";
const REQUEST_ID = "req-77777777-7777-7777-7777-777777777777";

function baseProps(overrides: Partial<ProjectWhatNextProps> = {}): ProjectWhatNextProps {
  return {
    jobId: JOB_ID,
    clientId: CLIENT_ID,
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
    invoiceCount: 0,
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
  };
}

describe("computeWhatNext — pre-sale and close-out branches", () => {
  it("shows complete site assessment when a pre-sale walkthrough is open", () => {
    const next = computeWhatNext(
      baseProps({
        hasOpenPreSaleSiteVisit: true,
        preSaleSiteVisitId: VISIT_ID,
      }),
    );

    expect(next.message).toBe("Complete site assessment");
    expect(next.actionLabel).toBe("Open Assessment");
    expect(next.actionHref).toBe(`/app/visits/${VISIT_ID}/assessment`);
  });

  it("shows create estimate from walkthrough when pre-sale is complete and no estimate exists", () => {
    const next = computeWhatNext(
      baseProps({
        hasCompletedPreSaleSiteVisit: true,
        estimateCount: 0,
      }),
    );

    expect(next.message).toBe("Create estimate from walkthrough");
    expect(next.actionLabel).toBe("Create Estimate");
    expect(next.actionHref).toBe(
      `/app/estimates/new?job_id=${JOB_ID}&client_id=${CLIENT_ID}&pricing_mode=flat_rate`,
    );
  });

  it("shows create estimate from work order scope when draft WO has pricing and no estimate", () => {
    const next = computeWhatNext(
      baseProps({
        hasDraftWorkOrderWithPricing: true,
        estimateCount: 0,
      }),
    );

    expect(next.message).toBe("Create estimate from work order scope");
    expect(next.actionLabel).toBe("Create Estimate");
    expect(next.actionHref).toBe(
      `/app/estimates/new?job_id=${JOB_ID}&client_id=${CLIENT_ID}&pricing_mode=flat_rate`,
    );
  });

  it("keeps estimate sent waiting banner ahead of expired revise banner", () => {
    const next = computeWhatNext(
      baseProps({
        hasSentEstimate: true,
        hasExpiredEstimate: true,
        latestExpiredEstimateId: EXPIRED_ESTIMATE_ID,
        estimateCount: 2,
        lastEstimateSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    expect(next.message).toMatch(/Estimate sent/);
    expect(next.actionHref).not.toBe(`/app/estimates/${EXPIRED_ESTIMATE_ID}`);
  });

  it("shows expired revise banner when only expired estimates exist", () => {
    const next = computeWhatNext(
      baseProps({
        hasExpiredEstimate: true,
        latestExpiredEstimateId: EXPIRED_ESTIMATE_ID,
        estimateCount: 1,
      }),
    );

    expect(next.message).toBe("Estimate expired — revise and resend");
    expect(next.actionLabel).toBe("Revise Estimate");
    expect(next.actionHref).toBe(`/app/estimates/${EXPIRED_ESTIMATE_ID}`);
  });

  it("prioritizes open pre-sale walkthrough over completed walkthrough CTA", () => {
    const next = computeWhatNext(
      baseProps({
        hasOpenPreSaleSiteVisit: true,
        hasCompletedPreSaleSiteVisit: true,
        preSaleSiteVisitId: VISIT_ID,
      }),
    );

    expect(next.message).toBe("Complete site assessment");
  });

  it("prioritizes completed walkthrough over draft work order scope CTA", () => {
    const next = computeWhatNext(
      baseProps({
        hasCompletedPreSaleSiteVisit: true,
        hasDraftWorkOrderWithPricing: true,
        estimateCount: 0,
      }),
    );

    expect(next.message).toBe("Create estimate from walkthrough");
  });
});

describe("computeWhatNext — money, field, T&M", () => {
  it("shows create invoice when work is complete and no invoices exist", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "completed",
        stage: "completed",
        invoiceCount: 0,
        approvedEstimateId: ESTIMATE_ID,
      }),
    );

    expect(next.message).toBe("Work complete — send the final invoice");
    expect(next.actionLabel).toBe("Create Invoice");
    expect(next.actionHref).toContain(`/app/invoices/new?job_id=${JOB_ID}`);
    expect(next.actionHref).toContain(`approved_estimate_id=${ESTIMATE_ID}`);
  });

  it("T&M completed copy mentions time and materials", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "completed",
        stage: "completed",
        pricingMode: "hourly_internal",
        invoiceCount: 0,
      }),
    );

    expect(next.message).toMatch(/time and materials/i);
    expect(next.actionLabel).toBe("Create Invoice");
  });

  it("collect payment when unpaid invoice exists", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "invoiced",
        stage: "invoiced",
        hasUnpaidInvoice: true,
        latestInvoiceId: INVOICE_ID,
      }),
    );

    expect(next.message).toMatch(/collect payment/i);
    expect(next.actionHref).toBe(`/app/invoices/${INVOICE_ID}`);
  });

  it("T&M skips estimate ladder and points at scheduling", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "draft",
        stage: "estimate_needed",
        pricingMode: "hourly_internal",
        estimateCount: 0,
      }),
    );

    expect(next.message).toMatch(/Time and materials/i);
    expect(next.actionLabel).toBe("Schedule Visit");
    expect(next.actionHref).toBe(`/app/jobs/${JOB_ID}/visits/new`);
  });

  it("T&M new lead still reviews booking request", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "draft",
        stage: "new_lead",
        pricingMode: "hourly_internal",
        bookingRequestId: REQUEST_ID,
      }),
    );

    expect(next.actionLabel).toBe("Review Request");
    expect(next.actionHref).toBe(`/app/requests/${REQUEST_ID}`);
  });

  it("open visit when work is in progress", () => {
    const next = computeWhatNext(
      baseProps({
        jobStatus: "in_progress",
        stage: "in_progress",
        hasActiveVisit: true,
        activeVisitId: VISIT_ID,
      }),
    );

    expect(next.message).toBe("Work in progress");
    expect(next.actionLabel).toBe("Open Visit");
    expect(next.actionHref).toBe(`/app/visits/${VISIT_ID}`);
  });
});
