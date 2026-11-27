import { describe, expect, it } from "vitest";
import { attentionPriority } from "../priority";
import { CALL_BACK_LABEL, CALL_BACK_SQL, callBackBucket } from "../call-back";

describe("Call back bucket (TASK-260)", () => {
  it("links straight to the customer when only one is waiting", () => {
    const b = callBackBucket([{ client_id: "c1", name: "Pat Lee", missed_at: "2026-11-27" }]);
    expect(b).toMatchObject({ label: CALL_BACK_LABEL, count: 1, href: "/app/clients/c1", detail: "Missed call: Pat Lee" });
  });

  it("names the first three and counts the rest", () => {
    const rows = ["A", "B", "C", "D", "E"].map((n, i) => ({ client_id: `c${i}`, name: n, missed_at: "" }));
    const b = callBackBucket(rows);
    expect(b.count).toBe(5);
    expect(b.href).toBe("/app/clients");
    expect(b.detail).toBe("Missed calls: A, B, C and 2 more");
  });

  it("is empty, and so hidden, with no missed calls", () => {
    expect(callBackBucket([]).count).toBe(0);
  });

  it("ranks right after customer promises, ahead of money", () => {
    const rank = attentionPriority({ label: CALL_BACK_LABEL, detail: "", tone: "danger" }).rank;
    expect(rank).toBeGreaterThan(attentionPriority({ label: "Customer Promises", detail: "", tone: "warning" }).rank);
    expect(rank).toBeLessThan(attentionPriority({ label: "Collect overdue invoices", detail: "", tone: "danger" }).rank);
  });

  it("does not count automated reminder texts as a call back", () => {
    expect(CALL_BACK_SQL).toContain("r.initiated_by IS NOT NULL");
  });
});
