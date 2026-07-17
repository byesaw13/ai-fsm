import { describe, expect, it } from "vitest";
import {
  RECEIPT_LINKABLE_JOB_STATUSES,
  RECEIPT_LINKABLE_JOB_STATUS_SQL,
  receiptJobOrderSql,
} from "../open-jobs";

describe("receipt-linkable jobs", () => {
  it("includes only open statuses", () => {
    expect(RECEIPT_LINKABLE_JOB_STATUSES).toEqual([
      "draft",
      "quoted",
      "scheduled",
      "in_progress",
    ]);
    expect(RECEIPT_LINKABLE_JOB_STATUS_SQL).toContain("'in_progress'");
    expect(RECEIPT_LINKABLE_JOB_STATUS_SQL).not.toContain("completed");
    expect(RECEIPT_LINKABLE_JOB_STATUS_SQL).not.toContain("invoiced");
    expect(RECEIPT_LINKABLE_JOB_STATUS_SQL).not.toContain("cancelled");
  });

  it("orders in_progress first", () => {
    const sql = receiptJobOrderSql("j");
    expect(sql).toMatch(/in_progress[\s\S]*scheduled[\s\S]*quoted[\s\S]*draft/);
    expect(sql).toContain("j.status");
    expect(sql).toContain("j.updated_at");
  });
});
