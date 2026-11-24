/**
 * Transaction identity, observation keys and import plans (TASK-211).
 * Design: docs/working/estimating-assistant-phase3.md §3.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parsePurchaseCsv } from "../import/detect";
import { transactionIdentity, tripObservationKeys } from "../import/identity";
import { planTrips, pricedLines, reviewIdentity, type ImportTrip } from "../import/run";

const fixture = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");

const allKeys = (trips: ImportTrip[]) =>
  new Set(
    trips.flatMap((t) => {
      const id = transactionIdentity(t);
      return id ? tripObservationKeys(id, pricedLines(t)) : [];
    }),
  );

describe("transactionIdentity", () => {
  it("is supplier family + store + transaction id", () => {
    expect(transactionIdentity({ vendor: "The Home Depot", store_number: "4719", external_ref: "H-123" })).toBe("home_depot:4719:h123");
  });

  it("identity requires store and transaction (hd-no-store.csv rows have none)", () => {
    const parsed = parsePurchaseCsv(fixture("hd-no-store.csv"));
    expect(parsed.transactions.length).toBe(2);
    for (const t of parsed.transactions) expect(transactionIdentity(t)).toBeNull();
    const plans = planTrips(parsed.transactions, [], "history", new Set());
    expect(plans.every((p) => p.action === "review" && p.reason === "no_transaction_identity")).toBe(true);
  });

  it("reads the Lowe's store number when the export has one", () => {
    const parsed = parsePurchaseCsv(fixture("lowes-sample.csv"));
    expect(parsed.transactions.map(transactionIdentity).sort()).toEqual(["lowes:1234:55001", "lowes:1234:55002"]);
  });
});

describe("tripObservationKeys", () => {
  it("identical lines in one transaction get occurrence 1 and 2", () => {
    const line = { sku: "1001", name: "Wood screws", unit_cost_cents: 997, quantity: 1 };
    const keys = tripObservationKeys("home_depot:3408:9999", [line, line]);
    expect(keys).toEqual(["txn:home_depot:3408:9999:1001|997|1#1", "txn:home_depot:3408:9999:1001|997|1#2"]);
  });

  it("the same line at another store gets another key", () => {
    const line = { sku: "1001", name: "Wood screws", unit_cost_cents: 997, quantity: 1 };
    expect(tripObservationKeys("home_depot:3408:9999", [line])).not.toEqual(tripObservationKeys("home_depot:4719:9999", [line]));
  });
});

describe("24-month Home Depot export", () => {
  const parsed = parsePurchaseCsv(fixture("hd-24-month.csv"));

  it("lists every skipped row with its line and reason", () => {
    const reasons = parsed.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["bad_date", "return", "zero_line"]);
    for (const s of parsed.skipped) expect(s.line).toBeGreaterThan(8);
  });

  it("keeps returns and $0 lines out of the priced lines", () => {
    const t = parsed.transactions.find((x) => x.external_ref === "9998")!;
    expect(pricedLines(t).map((l) => l.name)).toEqual(["Interior satin paint 1 gal"]);
    expect(t.amount_cents).toBe(4298 - 547);
  });

  it("keeps the discount flag as a sale", () => {
    expect(parsed.transactions.some((t) => t.line_items.some((l) => l.discounted))).toBe(true);
  });

  it("importing the same file again plans nothing new in history mode", () => {
    const first = planTrips(parsed.transactions, [], "history", new Set());
    expect(first.filter((p) => p.action === "import").length).toBeGreaterThan(80);
    const again = planTrips(parsed.transactions, [], "history", allKeys(parsed.transactions));
    expect(again.filter((p) => p.action === "import")).toEqual([]);
  });

  it("a transaction imported as history is still booked in book mode (keys keep prices single)", () => {
    const plans = planTrips(parsed.transactions, [], "book", allKeys(parsed.transactions));
    expect(plans.filter((p) => p.action === "import").length).toBeGreaterThan(80);
  });

  it("an earlier booked import of the same file is already imported in both modes", () => {
    const booked = parsed.transactions.map((t, i) => ({
      id: `e${i}`,
      vendor_name: t.vendor,
      expense_date: t.date,
      amount_cents: t.amount_cents,
      external_ref: t.external_ref,
      store_number: t.store_number,
      source: "home_depot_csv",
    }));
    for (const mode of ["book", "history"] as const) {
      const plans = planTrips(parsed.transactions, booked, mode, new Set());
      expect(plans.filter((p) => p.action === "import" || p.action === "review")).toEqual([]);
    }
  });
});

describe("planTrips", () => {
  const trip: ImportTrip = {
    trip_key: "3408:3325",
    external_ref: "3325",
    store_number: "3408",
    date: "2026-09-08",
    vendor: "The Home Depot",
    amount_cents: 4996,
    expense_category: "materials",
    line_items: [{ sku: "1", name: "Paint", category: "paint", unit_cost_cents: 4996, quantity: 1, discounted: false }],
  };

  it("exact store+date+amount without transaction id is review possible_duplicate (regression: was auto-matched)", () => {
    const photo = { id: "p1", vendor_name: "Home Depot", expense_date: "2026-09-08", amount_cents: 5308, external_ref: null };
    expect(planTrips([trip], [photo], "book", new Set())).toEqual([{ action: "review", reason: "possible_duplicate", matchId: "p1" }]);
  });

  it("the same transaction id at another store in one file is conflicting_transaction_id", () => {
    const other = { ...trip, trip_key: "4719:3325", store_number: "4719" };
    expect(planTrips([trip, other], [], "book", new Set())[1]).toMatchObject({ action: "review", reason: "conflicting_transaction_id" });
  });

  it("a receipt with the full identity is linked, not booked twice", () => {
    const receipt = { id: "r1", vendor_name: "Home Depot", expense_date: "2026-09-08", amount_cents: 5308, external_ref: "3325" };
    expect(planTrips([trip], [receipt], "book", new Set())).toEqual([{ action: "link", matchId: "r1" }]);
  });

  it("review identity is stable across imports, with or without a transaction id", () => {
    expect(reviewIdentity(trip)).toBe("home_depot:3408:3325");
    const loose = { ...trip, external_ref: null, trip_key: "nt:2026-09-08:" };
    expect(reviewIdentity(loose)).toBe(reviewIdentity({ ...loose }));
  });
});
