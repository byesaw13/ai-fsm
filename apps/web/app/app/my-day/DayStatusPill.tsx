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
      style={{
        width: "100%",
        textAlign: "left",
        padding: "var(--space-3) var(--space-4)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "var(--accent-subtle)",
        fontSize: "var(--text-sm)",
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      {parts.join(" · ")}
    </button>
  );
}