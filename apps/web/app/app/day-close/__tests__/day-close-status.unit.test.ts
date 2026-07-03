import { describe, it, expect } from "vitest";
import { deriveDayCloseStatus } from "../day-close-status";
import type { DayCloseStatusPayload } from "../types";

const base: DayCloseStatusPayload = {
  clockOpen: false,
  activeActivity: null,
  openSession: null,
  missingReceiptPhotos: 0,
  visitsToday: 2,
  notesAcknowledged: false,
};

describe("deriveDayCloseStatus", () => {
  it("canClose when no hard blockers", () => {
    const s = deriveDayCloseStatus(base);
    expect(s.canClose).toBe(true);
    expect(s.hardBlockerCount).toBe(0);
  });

  it("blocks close when payroll clock open", () => {
    const s = deriveDayCloseStatus({ ...base, clockOpen: true });
    expect(s.canClose).toBe(false);
    expect(s.rows.payroll.status).toBe("blocked");
  });

  it("blocks close when activity running", () => {
    const s = deriveDayCloseStatus({
      ...base,
      activeActivity: { id: "a1", activityType: "job_work", label: "Job work" },
    });
    expect(s.canClose).toBe(false);
    expect(s.rows.activity.status).toBe("blocked");
  });

  it("blocks close when mileage session open", () => {
    const s = deriveDayCloseStatus({
      ...base,
      openSession: { id: "s1", vehicleName: "RAM", startOdometer: 12000 },
    });
    expect(s.canClose).toBe(false);
    expect(s.rows.mileage.status).toBe("blocked");
  });

  it("expenses missing photos is soft only", () => {
    const s = deriveDayCloseStatus({ ...base, missingReceiptPhotos: 2 });
    expect(s.canClose).toBe(true);
    expect(s.rows.expenses.status).toBe("warning");
    expect(s.softWarningCount).toBeGreaterThan(0);
  });

  it("notes prompt is soft and clears when acknowledged", () => {
    expect(deriveDayCloseStatus(base).rows.notes.status).toBe("warning");
    expect(deriveDayCloseStatus({ ...base, notesAcknowledged: true }).rows.notes.status).toBe("ok");
  });
});