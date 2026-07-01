import { describe, expect, it } from "vitest";
import {
  CANONICAL_BACKEND_TERMS,
  DEPRECATED_FRONTEND_TERMS,
  PRIMARY_UI_LABELS,
  REQUIRED_ADAPTER_RULES,
  UI_DISPLAY_TERMS,
  primaryUiLabel,
} from "./vocabulary";

describe("canonical vocabulary", () => {
  it("keeps the backend terms stable", () => {
    expect(CANONICAL_BACKEND_TERMS).toMatchObject({
      client: "client",
      property: "property",
      job: "job",
      work_order: "work_order",
      visit: "visit",
      booking_request: "booking_request",
      estimate: "estimate",
      invoice: "invoice",
      payment: "payment",
      membership: "membership",
      change_order: "change_order",
      workflow: "workflow",
      pricing_mode: "pricing_mode",
      fixed_bid: "flat_rate",
      time_and_materials: "hourly_internal",
    });
  });

  it("uses Project as the primary job UI label", () => {
    expect(PRIMARY_UI_LABELS.job).toBe("Project");
    expect(PRIMARY_UI_LABELS.jobs).toBe("Projects");
    expect(primaryUiLabel("job")).toBe("Project");
    expect(primaryUiLabel("jobs")).toBe("Projects");
  });

  it("does not alias visits as work orders", () => {
    expect(PRIMARY_UI_LABELS.visit).toBe("Visit");
    expect(PRIMARY_UI_LABELS.work_order).toBe("Work Order");
    expect(UI_DISPLAY_TERMS.visit).toEqual(["Visit", "Walkthrough"]);
    expect(UI_DISPLAY_TERMS.work_order).toEqual(["Work Order"]);
    expect(UI_DISPLAY_TERMS.visit).not.toContain("Work Order");
  });

  it("allows only the expected UI aliases", () => {
    expect(UI_DISPLAY_TERMS.booking_request).toEqual(["Request", "New Request", "Intake"]);
    expect(UI_DISPLAY_TERMS.job).toEqual(["Project"]);
    expect(UI_DISPLAY_TERMS.estimate).toEqual(["Estimate", "Quote"]);
    expect(UI_DISPLAY_TERMS.membership).toEqual(["Membership", "Maintenance Plan"]);
    expect(UI_DISPLAY_TERMS.workflow).toEqual(["Workflow"]);
    expect(UI_DISPLAY_TERMS.pricing_mode).toEqual(["Fixed Bid", "Time and Materials"]);
    expect(UI_DISPLAY_TERMS.fixed_bid).toEqual(["Fixed Bid"]);
    expect(UI_DISPLAY_TERMS.time_and_materials).toEqual(["Time and Materials"]);
  });

  it("keeps the deprecated frontend terms explicit", () => {
    expect(DEPRECATED_FRONTEND_TERMS).toEqual([
      "lead",
      "pipeline",
      "ticket",
      "subscription",
      "appointment",
      "asset",
      "dispatch",
    ]);
  });

  it("documents the adapter rules", () => {
    expect(REQUIRED_ADAPTER_RULES).toEqual([
      "Keep backend tables, routes, and status enums stable unless a migration is explicit.",
      "Allow UI aliases only at the presentation layer.",
      "Map retired terms to canonical terms through one adapter layer.",
      "Update glossary, workflow map, and tests in the same change when vocabulary changes.",
      "Reject parallel concepts unless they are explicit compatibility aliases.",
    ]);
  });
});