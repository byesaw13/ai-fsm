import { describe, it, expect } from "vitest";
import {
  OWNER_PROMISE_ACTION_TYPE,
  extractFirmCommitments,
  pickReviewCaptures,
  promiseBucketTone,
  type ReviewCapture,
} from "./promise-capture";

describe("extractFirmCommitments", () => {
  it("extracts a spoken customer promise", () => {
    const result = extractFirmCommitments(
      "I told Mrs. Chen I would call tomorrow about the deposit.",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title.toLowerCase()).toMatch(/chen/);
    expect(result[0].title.toLowerCase()).toMatch(/call|deposit/);
    expect(result[0].confidence).toBe("high");
  });

  it("extracts a third-party promise as Nick's waiting-on item", () => {
    const result = extractFirmCommitments(
      "Peter said he will send the measurements Friday.",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title.toLowerCase()).toMatch(/peter/);
    expect(result[0].title.toLowerCase()).toMatch(/measurement/);
  });

  it("extracts an explicit I-promised statement", () => {
    const result = extractFirmCommitments(
      "I promised to add the missing trim price to the estimate.",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title.toLowerCase()).toMatch(/trim/);
  });

  it("does not extract uncertain may/might/could/should-probably language", () => {
    const texts = [
      "Peter may want the upstairs trim done.",
      "I might replace that compressor cabinet.",
      "This fitting could be useful for bath fans.",
      "I should probably call her.",
    ];
    for (const text of texts) {
      expect(extractFirmCommitments(text), text).toEqual([]);
    }
  });

  it("from a mixed utterance extracts only the firm promise", () => {
    const result = extractFirmCommitments(
      "The flashing is shot, I might replace it, and I told her I'd send a price this week.",
    );
    expect(result).toHaveLength(1);
    expect(result[0].title.toLowerCase()).toMatch(/price/);
    expect(result[0].title.toLowerCase()).not.toMatch(/replace/);
  });
});

describe("pickReviewCaptures", () => {
  const cap = (over: Partial<ReviewCapture> & Pick<ReviewCapture, "id">): ReviewCapture => ({
    capturedAt: "2026-09-01T12:00:00.000Z",
    snoozedAt: null,
    snoozeCount: 0,
    ...over,
  });

  it("returns at most three items, oldest unsnoozed first, then snoozed", () => {
    const picked = pickReviewCaptures([
      cap({ id: "s1", snoozeCount: 1, snoozedAt: "2026-09-01T18:00:00.000Z", capturedAt: "2026-09-01T10:00:00.000Z" }),
      cap({ id: "u2", capturedAt: "2026-09-01T14:00:00.000Z" }),
      cap({ id: "u1", capturedAt: "2026-09-01T08:00:00.000Z" }),
      cap({ id: "u3", capturedAt: "2026-09-01T16:00:00.000Z" }),
      cap({ id: "u4", capturedAt: "2026-09-01T17:00:00.000Z" }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("fills remaining slots with snoozed items after unsnoozed", () => {
    const picked = pickReviewCaptures([
      cap({ id: "u1", capturedAt: "2026-09-01T08:00:00.000Z" }),
      cap({ id: "s1", snoozeCount: 1, snoozedAt: "2026-09-01T18:00:00.000Z", capturedAt: "2026-09-01T09:00:00.000Z" }),
      cap({ id: "s0", snoozeCount: 1, snoozedAt: "2026-09-01T17:00:00.000Z", capturedAt: "2026-09-01T07:00:00.000Z" }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(["u1", "s0", "s1"]);
  });
});

describe("promiseBucketTone", () => {
  it("is danger when any open promise is overdue", () => {
    expect(
      promiseBucketTone(
        [{ dueAt: "2020-01-01T00:00:00.000Z" }, { dueAt: null }],
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBe("danger");
  });

  it("is warning when none are overdue", () => {
    expect(
      promiseBucketTone(
        [{ dueAt: null }, { dueAt: "2099-01-01T00:00:00.000Z" }],
        new Date("2026-09-01T00:00:00.000Z"),
      ),
    ).toBe("warning");
  });
});

describe("OWNER_PROMISE_ACTION_TYPE", () => {
  it("is owner_promise", () => {
    expect(OWNER_PROMISE_ACTION_TYPE).toBe("owner_promise");
  });
});
