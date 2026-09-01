import { describe, expect, it } from "vitest";
import { OWNER_PROMISE_ACTION_TYPE, promiseBucketTone } from "@ai-fsm/domain";
import {
  CUSTOMER_PROMISE_BUCKET_DETAIL,
  CUSTOMER_PROMISE_BUCKET_HREF,
  CUSTOMER_PROMISE_BUCKET_LABEL,
  OPEN_OWNER_PROMISES_SQL,
  customerPromiseBucket,
  formatPromiseDue,
  promiseEntityHref,
  promiseEntityLabel,
  shouldShowOpenPromises,
  toPromiseToneInput,
} from "../promise-queue";

const now = new Date("2026-09-01T12:00:00.000Z");

describe("customerPromiseBucket", () => {
  it("counts open rows and uses warning tone when none are overdue", () => {
    const open = [{ dueAt: null }, { dueAt: "2026-09-02T00:00:00.000Z" }];
    const bucket = customerPromiseBucket(open, now);
    expect(bucket).toEqual({
      label: CUSTOMER_PROMISE_BUCKET_LABEL,
      count: 2,
      href: CUSTOMER_PROMISE_BUCKET_HREF,
      detail: CUSTOMER_PROMISE_BUCKET_DETAIL,
      tone: "warning",
    });
    expect(bucket.tone).toBe(promiseBucketTone(open, now));
  });

  it("uses promiseBucketTone danger when any due_at is before now", () => {
    const open = [{ dueAt: "2026-08-31T23:59:59.000Z" }, { dueAt: null }];
    const bucket = customerPromiseBucket(open, now);
    expect(bucket.count).toBe(2);
    expect(bucket.tone).toBe("danger");
    expect(bucket.tone).toBe(promiseBucketTone(open, now));
  });

  it("never treats null due_at as overdue", () => {
    const open = [{ dueAt: null }];
    expect(customerPromiseBucket(open, now).tone).toBe("warning");
    expect(promiseBucketTone(open, now)).toBe("warning");
  });
});

describe("toPromiseToneInput", () => {
  it("normalizes pg dates and null due_at", () => {
    expect(
      toPromiseToneInput([
        { due_at: null },
        { due_at: new Date("2026-09-01T00:00:00.000Z") },
        { due_at: "2026-09-03T00:00:00.000Z" },
      ]),
    ).toEqual([
      { dueAt: null },
      { dueAt: "2026-09-01T00:00:00.000Z" },
      { dueAt: "2026-09-03T00:00:00.000Z" },
    ]);
  });
});

describe("OPEN_OWNER_PROMISES_SQL", () => {
  it("selects open owner_promise rows for the session account", () => {
    expect(OPEN_OWNER_PROMISES_SQL).toMatch(/FROM action_items/i);
    expect(OPEN_OWNER_PROMISES_SQL).toMatch(/account_id = \$1/);
    expect(OPEN_OWNER_PROMISES_SQL).toMatch(/action_type = \$2/);
    expect(OPEN_OWNER_PROMISES_SQL).toMatch(/resolved_at IS NULL/);
    expect(OPEN_OWNER_PROMISES_SQL).not.toMatch(/DELETE/i);
    expect(OWNER_PROMISE_ACTION_TYPE).toBe("owner_promise");
  });
});

describe("promise entity links", () => {
  const id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("maps supported entities to their pages", () => {
    expect(promiseEntityHref("booking_request", id)).toBe(`/app/requests/${id}`);
    expect(promiseEntityHref("estimate", id)).toBe(`/app/estimates/${id}`);
    expect(promiseEntityHref("job", id)).toBe(`/app/jobs/${id}`);
    expect(promiseEntityHref("invoice", id)).toBe(`/app/invoices/${id}`);
  });

  it("labels entity types for the open-row list", () => {
    expect(promiseEntityLabel("booking_request")).toBe("Request");
    expect(promiseEntityLabel("estimate")).toBe("Estimate");
    expect(promiseEntityLabel("job")).toBe("Project");
    expect(promiseEntityLabel("invoice")).toBe("Invoice");
  });
});

describe("formatPromiseDue", () => {
  it("says no due date when due_at is null", () => {
    expect(formatPromiseDue(null, now)).toBe("No due date");
  });

  it("marks past due_at as overdue", () => {
    expect(formatPromiseDue("2026-08-01T00:00:00.000Z", now)).toMatch(/^Overdue/);
  });
});

describe("shouldShowOpenPromises", () => {
  it("shows rows when any are open, or when promises=1", () => {
    expect(shouldShowOpenPromises(0, undefined)).toBe(false);
    expect(shouldShowOpenPromises(2, undefined)).toBe(true);
    expect(shouldShowOpenPromises(0, "1")).toBe(true);
  });
});
