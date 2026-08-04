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
  it("detects first open and stamps the invoice", async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "inv-1",
            account_id: "acc-1",
            invoice_number: "INV-0001",
            first_viewed_at: null,
            client_name: "Pat",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await recordInvoicePortalView(queryFn, "token-uuid");
    expect(result.updated).toBe(true);
    expect(result.firstOpen).toBe(true);
    expect(result.invoice?.invoice_number).toBe("INV-0001");
    expect(queryFn).toHaveBeenCalledTimes(2);
    const [sql, params] = queryFn.mock.calls[1];
    expect(sql).toMatch(/first_viewed_at = COALESCE/);
    expect(sql).toMatch(/status IN \('sent', 'partial', 'overdue'\)/);
    expect(params).toEqual(["token-uuid"]);
  });

  it("does not treat re-open as first open", async () => {
    const queryFn = vi
      .fn()
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            id: "inv-1",
            account_id: "acc-1",
            invoice_number: "INV-0001",
            first_viewed_at: "2026-07-01T00:00:00Z",
            client_name: "Pat",
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] });

    const result = await recordInvoicePortalView(queryFn, "token-uuid");
    expect(result.firstOpen).toBe(false);
    expect(result.updated).toBe(true);
  });
});
