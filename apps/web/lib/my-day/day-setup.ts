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