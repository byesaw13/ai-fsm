import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/lib/db", () => ({
  withDbSession: (_session: unknown, fn: (client: { query: typeof mockQuery }) => unknown) =>
    fn({ query: mockQuery }),
}));

import {
  REVIEWABLE_PROCESSING_STATES,
  captureIsReviewable,
  excerptFromCapture,
  selectReviewCaptures,
  loadReviewCaptures,
  type CaptureEvidenceRow,
} from "../review-query";

const session = {
  userId: "00000000-0000-0000-0000-000000000001",
  accountId: "00000000-0000-0000-0000-000000000002",
  role: "owner" as const,
};

function row(over: Partial<CaptureEvidenceRow> & Pick<CaptureEvidenceRow, "id">): CaptureEvidenceRow {
  return {
    captured_at: "2026-09-01T12:00:00.000Z",
    snoozed_at: null,
    snooze_count: 0,
    transcript: "I told Mrs. Chen I would call tomorrow about the deposit.",
    processing_state: "proposed",
    proposed_title: "Call Mrs. Chen about the deposit",
    proposed_due_at: "2026-09-02T16:00:00.000Z",
    proposed_span: "I told Mrs. Chen I would call tomorrow about the deposit",
    confidence: "high",
    suggested_entity_type: "job",
    suggested_entity_id: "00000000-0000-0000-0000-000000000010",
    audio_filename: "audio.webm",
    confirmed_at: null,
    dismissed_at: null,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("captureIsReviewable", () => {
  it("allows unconfirmed reviewable processing states", () => {
    for (const state of REVIEWABLE_PROCESSING_STATES) {
      expect(captureIsReviewable(row({ id: "x", processing_state: state }))).toBe(true);
    }
  });

  it("rejects confirmed, dismissed, and in-flight processing states", () => {
    expect(captureIsReviewable(row({ id: "c", confirmed_at: "2026-09-01T13:00:00.000Z" }))).toBe(false);
    expect(captureIsReviewable(row({ id: "d", dismissed_at: "2026-09-01T13:00:00.000Z" }))).toBe(false);
    expect(captureIsReviewable(row({ id: "p", processing_state: "pending" }))).toBe(false);
    expect(captureIsReviewable(row({ id: "t", processing_state: "transcribed" }))).toBe(false);
    expect(captureIsReviewable(row({ id: "ok", processing_state: "confirmed" }))).toBe(false);
    expect(captureIsReviewable(row({ id: "no", processing_state: "dismissed" }))).toBe(false);
  });
});

describe("excerptFromCapture", () => {
  it("prefers proposed_span, then title, then truncated transcript", () => {
    expect(excerptFromCapture(row({ id: "a" }))).toMatch(/Mrs\. Chen/);
    expect(
      excerptFromCapture(row({ id: "b", proposed_span: null, proposed_title: "Call her" })),
    ).toBe("Call her");
    expect(
      excerptFromCapture(
        row({ id: "c", proposed_span: null, proposed_title: null, transcript: "x".repeat(300) }),
      ),
    ).toHaveLength(280);
  });
});

describe("selectReviewCaptures pick list", () => {
  it("returns oldest unsnoozed first, then snoozed, capped at 3", () => {
    const picked = selectReviewCaptures([
      row({
        id: "s1",
        snooze_count: 1,
        snoozed_at: "2026-09-01T18:00:00.000Z",
        captured_at: "2026-09-01T10:00:00.000Z",
        processing_state: "snoozed",
      }),
      row({ id: "u2", captured_at: "2026-09-01T14:00:00.000Z" }),
      row({ id: "u1", captured_at: "2026-09-01T08:00:00.000Z" }),
      row({ id: "u3", captured_at: "2026-09-01T16:00:00.000Z" }),
      row({ id: "u4", captured_at: "2026-09-01T17:00:00.000Z" }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("drops rows the SQL layer should not have returned", () => {
    const picked = selectReviewCaptures([
      row({ id: "ok", captured_at: "2026-09-01T08:00:00.000Z" }),
      row({ id: "pending", processing_state: "pending" }),
      row({ id: "done", confirmed_at: "2026-09-01T09:00:00.000Z" }),
    ]);
    expect(picked.map((c) => c.id)).toEqual(["ok"]);
  });
});

describe("loadReviewCaptures", () => {
  it("queries unconfirmed reviewable captures and applies the pick list", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        row({
          id: "s1",
          snooze_count: 1,
          snoozed_at: "2026-09-01T18:00:00.000Z",
          captured_at: "2026-09-01T10:00:00.000Z",
          processing_state: "snoozed",
        }),
        row({ id: "u2", captured_at: "2026-09-01T14:00:00.000Z" }),
        row({ id: "u1", captured_at: "2026-09-01T08:00:00.000Z" }),
        row({ id: "failed", captured_at: "2026-09-01T09:00:00.000Z", processing_state: "failed" }),
      ],
    });

    const result = await loadReviewCaptures(session);

    expect(result.map((c) => c.id)).toEqual(["u1", "failed", "u2"]);
    expect(result).toHaveLength(3);
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("confirmed_at IS NULL");
    expect(sql).toContain("dismissed_at IS NULL");
    expect(sql).toContain("proposed");
    expect(sql).toContain("low_confidence");
    expect(sql).toContain("awaiting_review");
    expect(sql).toContain("snoozed");
    expect(sql).toContain("failed");
    expect(mockQuery.mock.calls[0][1]).toEqual([session.accountId]);
    expect(result[0]?.hasAudio).toBe(true);
    expect(result[0]?.proposedTitle).toBe("Call Mrs. Chen about the deposit");
  });
});
