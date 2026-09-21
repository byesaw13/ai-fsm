import { describe, expect, it } from "vitest";
import { manualInvoiceKind } from "../manual-kind";

describe("manualInvoiceKind", () => {
  it("files a bill on a job as final so it cannot fork the job's money", () => {
    expect(manualInvoiceKind("job-1")).toBe("final");
  });

  it("keeps a loose bill as standard", () => {
    expect(manualInvoiceKind(null)).toBe("standard");
    expect(manualInvoiceKind(undefined)).toBe("standard");
  });
});
