import type { DayCloseDerived, DayCloseRowStatus, DayCloseStatusPayload } from "./types";

function row(ok: boolean, soft = false): DayCloseRowStatus {
  if (ok) return "ok";
  return soft ? "warning" : "blocked";
}

export function deriveDayCloseStatus(payload: DayCloseStatusPayload): DayCloseDerived {
  const payroll = row(!payload.clockOpen);
  const activity = row(!payload.activeActivity);
  const mileage = row(!payload.openSession);
  const expenses = row(payload.missingReceiptPhotos === 0, payload.missingReceiptPhotos > 0);
  const notes = row(payload.notesAcknowledged, !payload.notesAcknowledged);

  const rows = {
    payroll: { status: payroll },
    activity: { status: activity },
    mileage: { status: mileage },
    expenses: { status: expenses },
    notes: { status: notes },
  };
  const hardBlockerCount = [payroll, activity, mileage].filter((s) => s === "blocked").length;
  const softWarningCount = [expenses, notes].filter((s) => s === "warning").length;
  const readyCount = Object.values(rows).filter((r) => r.status === "ok").length;

  let closeButtonHint = "Close Day";
  if (hardBlockerCount === 1 && payload.clockOpen) closeButtonHint = "Close Day — clock out first";
  else if (hardBlockerCount === 1 && payload.activeActivity) closeButtonHint = "Close Day — stop activity first";
  else if (hardBlockerCount === 1 && payload.openSession) closeButtonHint = "Close Day — close mileage first";
  else if (hardBlockerCount > 1) closeButtonHint = `Close Day — ${hardBlockerCount} items left`;

  return {
    canClose: hardBlockerCount === 0,
    hardBlockerCount,
    softWarningCount,
    readyCount,
    totalTasks: 5,
    rows,
    closeButtonHint,
  };
}