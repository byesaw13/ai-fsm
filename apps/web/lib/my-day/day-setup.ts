export type DaySetupStep = "clock" | "vehicle" | "mileage";

export type DaySetupState = {
  clockedIn: boolean;
  hasOpenSession: boolean;
  vehicleReady: boolean;
};

/** Van session is the timesheet — no cashier clock-in once the van is on. */
export function isDaySetupComplete(state: DaySetupState): boolean {
  return state.hasOpenSession && state.vehicleReady;
}

export function nextIncompleteStep(state: DaySetupState): DaySetupStep | null {
  if (state.hasOpenSession && state.vehicleReady) return null;
  if (!state.clockedIn) return "clock";
  if (!state.vehicleReady) return "vehicle";
  if (!state.hasOpenSession) return "mileage";
  return null;
}

export type StartDayMode = "done" | "one_tap" | "odometer" | "wizard";

/** Worked a prior day and never entered closing miles — new day waits on that number. */
export function priorDayNeedsMileage(input: {
  today: string;
  priorOpenSessionDate: string | null;
  lastWorkedDate: string | null;
  lastEndedMileageDate: string | null;
}): boolean {
  if (input.priorOpenSessionDate && input.priorOpenSessionDate < input.today) return true;
  if (input.lastWorkedDate && input.lastWorkedDate < input.today) {
    if (!input.lastEndedMileageDate || input.lastEndedMileageDate < input.lastWorkedDate) return true;
  }
  return false;
}

/** Van already knows the truck: one tap. Missing miles: one field. No truck: wizard. */
export function startDayMode(input: {
  clockedIn: boolean;
  hasOpenSession: boolean;
  hasVehicle: boolean;
  lastOdometer: number | null;
  priorDayNeedsMileage?: boolean;
}): StartDayMode {
  if (input.hasOpenSession) return "done";
  if (!input.hasVehicle) return "wizard";
  if (input.priorDayNeedsMileage) return "odometer";
  if (input.lastOdometer == null || !Number.isInteger(input.lastOdometer) || input.lastOdometer < 0) {
    return "odometer";
  }
  return "one_tap";
}