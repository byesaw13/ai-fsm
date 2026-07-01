import { describe, expect, it } from "vitest";
import {
  getEstimateOperationalVisibility,
  getInvoiceOperationalVisibility,
  getJobOperationalVisibility,
  getVisitOperationalVisibility,
} from "./operational-visibility";

describe("operational visibility", () => {
  it("maps active job statuses to active and closed job statuses out of operations", () => {
    expect(getJobOperationalVisibility("scheduled")).toBe("active");
    expect(getJobOperationalVisibility("in_progress")).toBe("active");
    expect(getJobOperationalVisibility("completed")).toBe("historical");
    expect(getJobOperationalVisibility("cancelled")).toBe("archived");
  });

  it("maps visits by operational visibility", () => {
    expect(getVisitOperationalVisibility("scheduled")).toBe("active");
    expect(getVisitOperationalVisibility("dispatched")).toBe("active");
    expect(getVisitOperationalVisibility("traveling")).toBe("active");
    expect(getVisitOperationalVisibility("waiting")).toBe("active");
    expect(getVisitOperationalVisibility("completed")).toBe("historical");
    expect(getVisitOperationalVisibility("cancelled")).toBe("archived");
  });

  it("maps estimates by operational visibility", () => {
    expect(getEstimateOperationalVisibility("sent")).toBe("active");
    expect(getEstimateOperationalVisibility("approved")).toBe("active");
    expect(getEstimateOperationalVisibility("expired")).toBe("historical");
  });

  it("maps invoices by operational visibility", () => {
    expect(getInvoiceOperationalVisibility("draft")).toBe("active");
    expect(getInvoiceOperationalVisibility("paid")).toBe("historical");
    expect(getInvoiceOperationalVisibility("void")).toBe("archived");
  });
});
