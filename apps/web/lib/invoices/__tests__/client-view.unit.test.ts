import { describe, expect, it, vi } from "vitest";
import {
  formatInvoiceViewLabel,
  isInvoiceUnread,
  recordInvoicePortalView,
} from "../client-view";

describe("isInvoiceUnread", () => {
  it("is unread when sent and never viewed", () => {
    expect(
      isInvoiceUnread({ status: "sent", sent_at: "2026-07-01", first_viewed_at: null }),
    ).toBe(true);
  });

  it("is not unread after first view", () => {
    expect(
      isInvoiceUnread({
        status: "sent",
        sent_at: "2026-07-01",
        first_viewed_at: "2026-07-02T12:00:00Z",
      }),
    ).toBe(false);
  });

  it("is not unread for draft/paid", () => {
    expect(isInvoiceUnread({ status: "draft", first_viewed_at: null })).toBe(false);
    expect(isInvoiceUnread({ status: "paid", first_viewed_at: null })).toBe(false);
  });
});

describe("formatInvoiceViewLabel", () => {
  it("returns Not opened for unread sent", () => {
    expect(formatInvoiceViewLabel({ status: "sent", first_viewed_at: null }).kind).toBe(
      "unread",
    );
  });

  it("returns viewed label with count", () => {
    const r = formatInvoiceViewLabel({
      status: "sent",
      first_viewed_at: "2026-07-20T15:00:00Z",
      last_viewed_at: "2026-07-21T16:30:00Z",
      view_count: 3,
    });
    expect(r.kind).toBe("viewed");
    expect(r.label).toMatch(/Opened 3×/);
  });
});

describe("recordInvoicePortalView", () => {
  it("runs the stamp update by share token", async () => {
    const queryFn = vi.fn().mockResolvedValue({ rowCount: 1 });
    const ok = await recordInvoicePortalView(queryFn, "token-uuid");
    expect(ok).toBe(true);
    expect(queryFn).toHaveBeenCalledOnce();
    const [sql, params] = queryFn.mock.calls[0];
    expect(sql).toMatch(/first_viewed_at = COALESCE/);
    expect(params).toEqual(["token-uuid"]);
  });
});
