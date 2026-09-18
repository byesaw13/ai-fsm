import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PoolClient } from "pg";
import type { Role } from "@ai-fsm/domain";

const ensureFieldDayVisit = vi.fn();
const runVisitCloseout = vi.fn();

vi.mock("@/lib/field/confirm-visit", () => ({
  ensureFieldDayVisit: (...args: unknown[]) => ensureFieldDayVisit(...args),
}));
vi.mock("@/lib/visits/closeout", () => ({
  runVisitCloseout: (...args: unknown[]) => runVisitCloseout(...args),
  CloseoutError: class CloseoutError extends Error {
    constructor(
      public code: string,
      message: string,
      public httpStatus = 422,
    ) {
      super(message);
      this.name = "CloseoutError";
    }
  },
}));
vi.mock("@/lib/work-orders/create-default", () => ({
  createDefaultWorkOrderForJob: vi.fn(async () => "wo-new"),
}));
vi.mock("@/lib/db/audit", () => ({
  appendAuditLog: vi.fn(async () => undefined),
}));

import { applyStopInterview, StopInterviewError } from "../apply-stop-interview";

const ACCOUNT = "acct-1";
const USER = "user-1";
const SEGMENT = "seg-1";
const JOB = "job-open";
const VISIT_OLD = "visit-old";
const CANDIDATE = "cand-1";

function session(role: Role = "owner") {
  return { accountId: ACCOUNT, userId: USER, role, traceId: "t" };
}

function segmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: SEGMENT,
    started_at: "2026-09-14T14:00:00.000Z",
    ended_at: "2026-09-14T16:00:00.000Z",
    place_label: "63 Landing",
    activity_entry_id: null,
    candidate_id: CANDIDATE,
    property_id: "prop-1",
    client_id: "client-1",
    visit_id: VISIT_OLD,
    job_id: "job-invoiced",
    work_order_id: "wo-old",
    candidate_status: "confirmed",
    ...overrides,
  };
}

function makeClient(opts: {
  segment?: Record<string, unknown>;
  openJob?: { id: string } | null;
  createdJobId?: string;
  receiptJob?: { id: string } | null;
}) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes("FROM location_segments")) {
        return { rows: [segmentRow(opts.segment)], rowCount: 1 };
      }
      if (sql.includes("FROM jobs") && sql.includes("property_id")) {
        return { rows: opts.openJob ? [opts.openJob] : [], rowCount: opts.openJob ? 1 : 0 };
      }
      if (sql.includes("INSERT INTO jobs")) {
        return { rows: [{ id: opts.createdJobId ?? "job-new" }], rowCount: 1 };
      }
      if (sql.includes("SELECT id FROM jobs") && sql.includes("status IN")) {
        return {
          rows: opts.receiptJob ? [opts.receiptJob] : [],
          rowCount: opts.receiptJob ? 1 : 0,
        };
      }
      return { rows: [], rowCount: 0 };
    }),
  } as unknown as PoolClient;
  return { client, queries };
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureFieldDayVisit.mockResolvedValue({ visitId: "visit-new", created: true, reason: "created" });
  runVisitCloseout.mockResolvedValue({ visit_id: "visit-new" });
});

describe("applyStopInterview (TASK-145 Codex review)", () => {
  it("requires done vs coming back for billable stops", async () => {
    const { client } = makeClient({ openJob: { id: JOB } });
    await expect(
      applyStopInterview(client, session(), {
        segmentId: SEGMENT,
        reason: "job_work",
        notes: "Hung the door",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/done or coming back/i),
    } as Partial<StopInterviewError>);
    expect(ensureFieldDayVisit).not.toHaveBeenCalled();
  });

  it("allows answering a still-open stop using now as departure (TASK-148)", async () => {
    const { client } = makeClient({
      segment: { ended_at: null },
      openJob: { id: JOB },
    });
    await applyStopInterview(client, session(), {
      segmentId: SEGMENT,
      reason: "job_work",
      notes: "Still hanging the door",
      closeoutKind: "return",
      nextWhen: "tomorrow",
      firstUp: "Finish the closer",
    });
    expect(ensureFieldDayVisit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        complete: false,
        jobId: JOB,
        arrivalTime: "2026-09-14T14:00:00.000Z",
      }),
    );
    const departure = ensureFieldDayVisit.mock.calls[0][1].departureTime as string;
    expect(Date.parse(departure)).toBeGreaterThan(Date.parse("2026-09-14T14:00:00.000Z"));
  });

  it("does not auto-complete the visit before closeout", async () => {
    const { client } = makeClient({ openJob: { id: JOB } });
    await applyStopInterview(client, session(), {
      segmentId: SEGMENT,
      reason: "job_work",
      notes: "Hung the door",
      closeoutKind: "done",
    });
    expect(ensureFieldDayVisit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ complete: false, jobId: JOB, visitId: VISIT_OLD }),
    );
    expect(runVisitCloseout).toHaveBeenCalledWith(
      client,
      expect.anything(),
      "visit-new",
      expect.objectContaining({ kind: "done", today_notes: "Hung the door" }),
    );
  });

  it("clears the invoiced job's visit id when creating new work", async () => {
    const { client } = makeClient({ openJob: null, createdJobId: "job-fridge" });
    await applyStopInterview(client, session(), {
      segmentId: SEGMENT,
      reason: "new_work",
      notes: "Fridge leak",
      jobTitle: "Fridge leak",
      closeoutKind: "return",
      nextWhen: "tomorrow",
      firstUp: "Pull the kickplate",
    });
    expect(ensureFieldDayVisit).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        jobId: "job-fridge",
        visitId: null,
        workOrderId: null,
        complete: false,
      }),
    );
  });

  it("forbids technicians from creating new work", async () => {
    const { client } = makeClient({ openJob: null });
    await expect(
      applyStopInterview(client, session("tech"), {
        segmentId: SEGMENT,
        reason: "new_work",
        notes: "Fridge leak",
        closeoutKind: "done",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", httpStatus: 403 });
  });

  it("forbids technicians from filing receipts onto a job", async () => {
    const { client } = makeClient({ openJob: null });
    await expect(
      applyStopInterview(client, session("tech"), {
        segmentId: SEGMENT,
        reason: "store",
        expenseIds: ["exp-1"],
        expenseJobId: JOB,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", httpStatus: 403 });
  });

  it("rejects a receipt job from another account", async () => {
    const { client } = makeClient({ openJob: null, receiptJob: null });
    await expect(
      applyStopInterview(client, session(), {
        segmentId: SEGMENT,
        reason: "store",
        expenseIds: ["exp-1"],
        expenseJobId: "foreign-job",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: expect.stringMatching(/open job on this account/i),
    });
  });

  it("voids prior labor and detaches the candidate when the stop is not work", async () => {
    const { client, queries } = makeClient({
      openJob: { id: JOB },
      segment: { activity_entry_id: "act-1" },
    });
    await applyStopInterview(client, session(), {
      segmentId: SEGMENT,
      reason: "pickup",
    });
    const voided = queries.find((q) => q.sql.includes("UPDATE activity_entries"));
    expect(voided?.params[0]).toBe("act-1");
    const ignored = queries.find(
      (q) => q.sql.includes("UPDATE visit_candidates") && q.sql.includes("ignored"),
    );
    expect(ignored).toBeDefined();
    expect(ignored?.sql).toMatch(/job_id = NULL/);
    expect(ensureFieldDayVisit).not.toHaveBeenCalled();
  });
});
