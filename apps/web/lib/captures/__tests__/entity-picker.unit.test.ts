import { describe, expect, it } from "vitest";
import {
  assemblePromiseEntities,
  filterPromiseEntities,
  mapVisitToJobEntity,
  type PromiseEntityOption,
} from "../entity-picker";

function option(over: Partial<PromiseEntityOption> & Pick<PromiseEntityOption, "entityId">): PromiseEntityOption {
  return {
    entityType: "job",
    label: "Chen — J-2026-0001 Deck repair",
    customerName: "Chen",
    source: "today_visit",
    ...over,
  };
}

describe("mapVisitToJobEntity", () => {
  it("maps a visit to its parent job via work_order_id → work_orders.job_id", () => {
    expect(
      mapVisitToJobEntity({
        workOrderId: "wo-1",
        parentJobId: "job-1",
        jobTitle: "Deck repair",
        jobNumber: "J-2026-0001",
        customerName: "Mrs. Chen",
      }),
    ).toEqual({
      entityType: "job",
      entityId: "job-1",
      label: "Mrs. Chen — J-2026-0001 Deck repair",
      customerName: "Mrs. Chen",
      source: "today_visit",
    });
  });

  it("skips visits with no work order", () => {
    expect(
      mapVisitToJobEntity({
        workOrderId: null,
        parentJobId: "job-1",
        jobTitle: "Assessment",
        jobNumber: "J-2026-0002",
        customerName: "Chen",
      }),
    ).toBeNull();
  });

  it("skips visits whose work order has no parent job", () => {
    expect(
      mapVisitToJobEntity({
        workOrderId: "wo-draft",
        parentJobId: null,
        jobTitle: null,
        jobNumber: null,
        customerName: "Chen",
      }),
    ).toBeNull();
  });
});

describe("assemblePromiseEntities", () => {
  it("orders today's visit jobs, then open estimates, unpaid invoices, then search hits", () => {
    const visit = option({ entityId: "job-1", source: "today_visit" });
    const estimate = option({
      entityId: "est-1",
      entityType: "estimate",
      source: "open_estimate",
      label: "Chen — EST-2026-0001",
    });
    const invoice = option({
      entityId: "inv-1",
      entityType: "invoice",
      source: "unpaid_invoice",
      label: "Chen — INV-1001",
    });
    const request = option({
      entityId: "br-1",
      entityType: "booking_request",
      source: "search",
      label: "Chen — fan install (request)",
    });
    expect(assemblePromiseEntities({
      visitJobs: [visit],
      estimates: [estimate],
      invoices: [invoice],
      searchHits: [request],
    }).map((e) => e.entityId)).toEqual(["job-1", "est-1", "inv-1", "br-1"]);
  });

  it("dedupes the same job when two visits map to it, keeping the visit-job slot", () => {
    const fromVisit = option({ entityId: "job-1", source: "today_visit" });
    const fromSearch = option({ entityId: "job-1", source: "search", label: "Chen — search hit" });
    const assembled = assemblePromiseEntities({
      visitJobs: [fromVisit, fromVisit],
      estimates: [],
      invoices: [],
      searchHits: [fromSearch],
    });
    expect(assembled).toHaveLength(1);
    expect(assembled[0]?.source).toBe("today_visit");
  });
});

describe("filterPromiseEntities", () => {
  it("matches customer name across entity types", () => {
    const rows = [
      option({ entityId: "job-1", customerName: "Mrs. Chen", label: "Mrs. Chen — deck" }),
      option({
        entityId: "est-1",
        entityType: "estimate",
        customerName: "Peter",
        label: "Peter — EST-1",
        source: "open_estimate",
      }),
    ];
    expect(filterPromiseEntities(rows, "chen").map((e) => e.entityId)).toEqual(["job-1"]);
    expect(filterPromiseEntities(rows, "PETER").map((e) => e.entityId)).toEqual(["est-1"]);
    expect(filterPromiseEntities(rows, "  ")).toHaveLength(2);
  });
});
