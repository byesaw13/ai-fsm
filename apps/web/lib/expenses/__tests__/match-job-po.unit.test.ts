import { describe, it, expect } from "vitest";
import {
  buildPoMatchText,
  displayPoForExpense,
  suggestJobFromPoText,
} from "../match-job-po";

describe("buildPoMatchText", () => {
  it("joins non-empty parts", () => {
    expect(
      buildPoMatchText({
        po_number: "J260029",
        notes: "lumber",
        vendor_name: "Home Depot",
      }),
    ).toBe("J260029\nlumber\nHome Depot");
  });
});

describe("suggestJobFromPoText", () => {
  const jobs = [
    { id: "job-a", job_number: "J-2026-0029" },
    { id: "job-b", job_number: "J-2026-0042" },
  ];

  it("matches unique supply PO", () => {
    const hit = suggestJobFromPoText("PO J260029", jobs);
    expect(hit?.jobId).toBe("job-a");
    expect(hit?.supplyPo).toBe("J260029");
  });

  it("returns null without PO", () => {
    expect(suggestJobFromPoText("SWIFT LANE", jobs)).toBeNull();
  });
});

describe("displayPoForExpense", () => {
  it("prefers structured supply PO over HD tags", () => {
    expect(displayPoForExpense("Home Depot · SWIFT LANE\nPO J260029")).toBe("J260029");
  });

  it("falls back to freeform extractReceiptPo", () => {
    expect(displayPoForExpense("Home Depot · SWIFT LANE")).toBe("SWIFT LANE");
  });
});
