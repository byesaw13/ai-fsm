/**
 * WhatNextBanner — unit tests for workflow close-out banner branches.
 */

import { describe, it, expect } from "vitest";
import { computeBanner, type WhatNextBannerProps } from "../WhatNextBanner";

const JOB_ID = "job-11111111-1111-1111-1111-111111111111";
const CLIENT_ID = "client-22222222-2222-2222-2222-222222222222";
const VISIT_ID = "visit-33333333-3333-3333-3333-333333333333";
const EXPIRED_ESTIMATE_ID = "est-44444444-4444-4444-4444-444444444444";

function baseProps(overrides: Partial<WhatNextBannerProps> = {}): WhatNextBannerProps {
  return {
    jobId: JOB_ID,
    clientId: CLIENT_ID,
    jobStatus: "draft",
    estimateCount: 0,
    hasSentEstimate: false,
    lastEstimateSentAt: null,
    hasApprovedEstimate: false,
    approvedEstimateId: null,
    hasDepositInvoice: false,
    depositPaid: false,
    hasActiveVisit: false,
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

describe("computeBanner — pre-sale and close-out branches", () => {
  it("shows complete site assessment when a pre-sale walkthrough is open", () => {
    const banner = computeBanner(
      baseProps({
        hasOpenPreSaleSiteVisit: true,
        preSaleSiteVisitId: VISIT_ID,
      }),
    );

    expect(banner?.message).toBe("Complete site assessment");
    expect(banner?.actionLabel).toBe("Open Assessment");
    expect(banner?.actionHref).toBe(`/app/visits/${VISIT_ID}/assessment`);
  });

  it("shows create estimate from walkthrough when pre-sale is complete and no estimate exists", () => {
    const banner = computeBanner(
      baseProps({
        hasCompletedPreSaleSiteVisit: true,
        estimateCount: 0,
      }),
    );

    expect(banner?.message).toBe("Create estimate from walkthrough");
    expect(banner?.actionLabel).toBe("Create Estimate");
    expect(banner?.actionHref).toBe(
      `/app/estimates/new?job_id=${JOB_ID}&client_id=${CLIENT_ID}&pricing_mode=flat_rate`,
    );
  });

  it("shows create estimate from work order scope when draft WO has pricing and no estimate", () => {
    const banner = computeBanner(
      baseProps({
        hasDraftWorkOrderWithPricing: true,
        estimateCount: 0,
      }),
    );

    expect(banner?.message).toBe("Create estimate from work order scope");
    expect(banner?.actionLabel).toBe("Create Estimate");
    expect(banner?.actionHref).toBe(
      `/app/estimates/new?job_id=${JOB_ID}&client_id=${CLIENT_ID}&pricing_mode=flat_rate`,
    );
  });

  it("keeps estimate sent waiting banner ahead of expired revise banner", () => {
    const banner = computeBanner(
      baseProps({
        hasSentEstimate: true,
        hasExpiredEstimate: true,
        latestExpiredEstimateId: EXPIRED_ESTIMATE_ID,
        estimateCount: 2,
        lastEstimateSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    );

    expect(banner?.message).toMatch(/Estimate sent/);
    expect(banner?.actionHref).not.toBe(`/app/estimates/${EXPIRED_ESTIMATE_ID}`);
  });

  it("shows expired revise banner when only expired estimates exist", () => {
    const banner = computeBanner(
      baseProps({
        hasExpiredEstimate: true,
        latestExpiredEstimateId: EXPIRED_ESTIMATE_ID,
        estimateCount: 1,
      }),
    );

    expect(banner?.message).toBe("Estimate expired — revise and resend");
    expect(banner?.actionLabel).toBe("Revise Estimate");
    expect(banner?.actionHref).toBe(`/app/estimates/${EXPIRED_ESTIMATE_ID}`);
  });

  it("prioritizes open pre-sale walkthrough over completed walkthrough CTA", () => {
    const banner = computeBanner(
      baseProps({
        hasOpenPreSaleSiteVisit: true,
        hasCompletedPreSaleSiteVisit: true,
        preSaleSiteVisitId: VISIT_ID,
      }),
    );

    expect(banner?.message).toBe("Complete site assessment");
  });

  it("prioritizes completed walkthrough over draft work order scope CTA", () => {
    const banner = computeBanner(
      baseProps({
        hasCompletedPreSaleSiteVisit: true,
        hasDraftWorkOrderWithPricing: true,
        estimateCount: 0,
      }),
    );

    expect(banner?.message).toBe("Create estimate from walkthrough");
  });
});