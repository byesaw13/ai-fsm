"use client";

import type { DaySetupState } from "@/lib/my-day/day-setup";

export function DayStatusPill({
  state,
  vehicleLabel,
  milesToday,
  onReopen,
}: {
  state: DaySetupState;
  vehicleLabel: string | null;
  milesToday: number;
  onReopen: () => void;
}) {
  const parts = [
    state.clockedIn ? "Clocked in" : "Not clocked in",
    vehicleLabel ?? "No vehicle",
    `${milesToday} mi today`,
  ];
  return (
    <button
      type="button"
      onClick={onReopen}
      data-testid="day-status-pill"
      className="field-day-pill"
    >
      {parts.join(" · ")}
    </button>
  );
}