export type DaySetupStep = "clock" | "vehicle" | "mileage";

export type DaySetupState = {
  clockedIn: boolean;
  hasOpenSession: boolean;
  vehicleReady: boolean;
};

export function isDaySetupComplete(state: DaySetupState): boolean {
  return state.clockedIn && state.hasOpenSession && state.vehicleReady;
}

export function nextIncompleteStep(state: DaySetupState): DaySetupStep | null {
  if (!state.clockedIn) return "clock";
  if (!state.vehicleReady) return "vehicle";
  if (!state.hasOpenSession) return "mileage";
  return null;
}

export type StartDayMode = "done" | "one_tap" | "odometer" | "wizard";

/** Van already knows the truck: one tap. Missing miles: one field. No truck: wizard. */
export function startDayMode(input: {
  clockedIn: boolean;
  hasOpenSession: boolean;
  hasVehicle: boolean;
  lastOdometer: number | null;
}): StartDayMode {
  if (input.clockedIn && input.hasOpenSession) return "done";
  if (!input.hasVehicle) return "wizard";
  if (input.lastOdometer == null || !Number.isInteger(input.lastOdometer) || input.lastOdometer < 0) {
    return "odometer";
  }
  return "one_tap";
}