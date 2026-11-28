import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  findClientByPhone: vi.fn(),
  findActiveJobForClient: vi.fn(),
  logCommunication: vi.fn(),
  emitAttentionEvent: vi.fn(),
  wasSentFromOutbox: vi.fn(),
  release: vi.fn(),
  dbQuery: vi.fn(),
}));

vi.mock("@/lib/sms/outbound", () => ({
  findClientByPhone: m.findClientByPhone,
  findActiveJobForClient: m.findActiveJobForClient,
}));
vi.mock("@/lib/communications-log", () => ({ logCommunication: m.logCommunication }));
vi.mock("@/lib/attention/emit", () => ({ emitAttentionEvent: m.emitAttentionEvent }));
vi.mock("@/lib/db/phone", () => ({ wasSentFromOutbox: m.wasSentFromOutbox }));
vi.mock("@/lib/db", () => ({
  getPool: () => ({ connect: async () => ({ release: m.release, query: m.dbQuery }) }),
}));

import { callOutcome, ingestCall, ingestOwnText } from "../ingest";

const call = {
  id: "dev1:42",
  phone: "(603) 555-0142",
  direction: "inbound" as const,
  result: "missed" as const,
  startedAt: new Date("2026-11-27T14:00:00Z"),
  durationSeconds: 0,
};

describe("callOutcome", () => {
  it.each([
    ["inbound", "answered", 120, "answered"],
    ["inbound", "missed", 0, "missed"],
    ["inbound", "rejected", 0, "missed"],
    ["inbound", "voicemail", 30, "left_voicemail"],
    ["outbound", "answered", 95, "answered"],
    ["outbound", "answered", 0, "no_answer"],
    ["inbound", "blocked", 0, null],
  ] as const)("%s %s %ds → %s", (direction, result, seconds, expected) => {
    expect(callOutcome(direction, result, seconds)).toBe(expected);
  });
});

describe("ingestCall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.findActiveJobForClient.mockResolvedValue("job-1");
  });

  it("drops a call from a number that is not a customer", async () => {
    m.findClientByPhone.mockResolvedValue(null);
    expect(await ingestCall("acct", call)).toBe("not_customer");
    expect(m.logCommunication).not.toHaveBeenCalled();
  });

  it("logs a missed customer call at the time it rang and raises one alert", async () => {
    m.findClientByPhone.mockResolvedValue({ id: "client-1", name: "Pat Lee", phone: "+16035550142" });
    m.logCommunication.mockResolvedValue("log-1");

    expect(await ingestCall("acct", call)).toBe("logged");
    expect(m.findClientByPhone).toHaveBeenCalledWith("acct", "+16035550142");
    expect(m.logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "phone",
        direction: "inbound",
        outcome: "missed",
        clientId: "client-1",
        jobId: "job-1",
        externalId: "phone-call:dev1:42",
        occurredAt: call.startedAt,
        durationSeconds: 0,
      }),
    );
    expect(m.emitAttentionEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        type: "call.missed",
        entityId: "client-1",
        title: "Missed call from Pat Lee",
        href: "/app/clients/client-1",
        dedupeKey: "call-missed:log-1",
      }),
    );
    expect(m.dbQuery.mock.calls.map((c) => c[0])).toEqual(["BEGIN", "COMMIT"]);
    expect(m.release).toHaveBeenCalled();
  });

  it("does not alert twice when the same call is uploaded again", async () => {
    m.findClientByPhone.mockResolvedValue({ id: "client-1", name: "Pat Lee", phone: null });
    m.logCommunication.mockResolvedValue(null);
    expect(await ingestCall("acct", call)).toBe("duplicate");
    expect(m.emitAttentionEvent).not.toHaveBeenCalled();
  });

  it("does not alert on an answered call", async () => {
    m.findClientByPhone.mockResolvedValue({ id: "client-1", name: "Pat Lee", phone: null });
    m.logCommunication.mockResolvedValue("log-2");
    await ingestCall("acct", { ...call, result: "answered", durationSeconds: 300 });
    expect(m.logCommunication).toHaveBeenCalledWith(expect.objectContaining({ outcome: "answered", durationSeconds: 300 }));
    expect(m.emitAttentionEvent).not.toHaveBeenCalled();
  });
});

describe("ingestOwnText", () => {
  const text = { id: "dev1:sms:9", phone: "6035550142", body: "Running 10 min late", sentAt: new Date("2026-11-27T13:00:00Z") };

  beforeEach(() => {
    vi.clearAllMocks();
    m.findActiveJobForClient.mockResolvedValue(null);
    m.wasSentFromOutbox.mockResolvedValue(false);
  });

  it("logs a text the owner typed to a customer, as sent by the owner", async () => {
    m.findClientByPhone.mockResolvedValue({ id: "client-1", name: "Pat Lee", phone: null });
    m.logCommunication.mockResolvedValue("log-3");
    expect(await ingestOwnText("acct", "owner-1", text)).toBe("logged");
    expect(m.logCommunication).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "sms",
        direction: "outbound",
        initiatedBy: "owner-1",
        externalId: "phone-sms-out:dev1:sms:9",
        occurredAt: text.sentAt,
      }),
    );
  });

  it("skips a personal text", async () => {
    m.findClientByPhone.mockResolvedValue(null);
    expect(await ingestOwnText("acct", "owner-1", text)).toBe("not_customer");
    expect(m.logCommunication).not.toHaveBeenCalled();
  });

  it("skips a text the app itself sent for the server", async () => {
    m.findClientByPhone.mockResolvedValue({ id: "client-1", name: "Pat Lee", phone: null });
    m.wasSentFromOutbox.mockResolvedValue(true);
    expect(await ingestOwnText("acct", "owner-1", text)).toBe("duplicate");
    expect(m.wasSentFromOutbox).toHaveBeenCalledWith("acct", "6035550142", "Running 10 min late");
    expect(m.logCommunication).not.toHaveBeenCalled();
  });
});
