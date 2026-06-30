"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ClockBar } from "../ClockBar";
import { useToast } from "@/components/ui";
import {
  isDaySetupComplete,
  nextIncompleteStep,
  type DaySetupState,
  type DaySetupStep,
} from "@/lib/my-day/day-setup";
import type { VehicleOption } from "../WorkdayPanel";

const STEPS: { key: DaySetupStep; label: string }[] = [
  { key: "clock", label: "Clock in" },
  { key: "vehicle", label: "Vehicle & odometer" },
  { key: "mileage", label: "Start mileage" },
];

export function StartMyDayWizard({
  open,
  onClose,
  initialState,
  vehicles,
}: {
  open: boolean;
  onClose: () => void;
  initialState: DaySetupState;
  vehicles: VehicleOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState(initialState);
  const [activeStep, setActiveStep] = useState<DaySetupStep>(nextIncompleteStep(initialState) ?? "clock");
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? "");
  const [startOdometer, setStartOdometer] = useState(String(vehicles[0]?.current_odometer ?? ""));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    const refresh = async () => {
      const res = await fetch("/api/v1/time-clock/current");
      const json = await res.json().catch(() => ({}));
      const clockedIn = json.data?.status === "open";
      setState((s) => ({ ...s, clockedIn }));
    };
    void refresh();
    window.addEventListener("ops:refresh", refresh);
    return () => window.removeEventListener("ops:refresh", refresh);
  }, [open]);

  useEffect(() => {
    if (isDaySetupComplete(state)) {
      onClose();
      router.refresh();
    }
  }, [state, onClose, router]);

  async function startMileage() {
    const odo = Number(startOdometer);
    if (!Number.isInteger(odo) || odo < 0) {
      toast.error("Enter a valid start odometer");
      return;
    }
    setPending(true);
    const res = await fetch("/api/v1/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vehicleId || null, start_odometer: odo }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not start session");
      return;
    }
    toast.success("Mileage session started");
    setState((s) => ({ ...s, hasOpenSession: true, vehicleReady: true }));
    window.dispatchEvent(new Event("ops:refresh"));
    router.refresh();
  }

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 500 }}
      />
      <div
        role="dialog"
        aria-label="Start my day"
        data-testid="start-my-day-wizard"
        style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 501,
          background: "var(--bg-card)", borderTopLeftRadius: "var(--radius-lg)",
          borderTopRightRadius: "var(--radius-lg)", padding: "var(--space-4)",
          maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 var(--space-3)", fontSize: "var(--text-lg)", fontWeight: 700 }}>Start My Day</h2>
        <ol style={{ listStyle: "none", padding: 0, margin: "0 0 var(--space-4)", display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {STEPS.map((step) => {
            const done =
              (step.key === "clock" && state.clockedIn) ||
              (step.key === "vehicle" && state.vehicleReady) ||
              (step.key === "mileage" && state.hasOpenSession);
            const current = activeStep === step.key;
            return (
              <li key={step.key}>
                <button
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  style={{
                    width: "100%", textAlign: "left", padding: "var(--space-3)",
                    borderRadius: "var(--radius-md)", border: `1px solid ${current ? "var(--accent)" : "var(--border)"}`,
                    background: current ? "var(--accent-subtle)" : "var(--bg-card)",
                    fontWeight: 600, minHeight: 44,
                  }}
                >
                  {done ? "✓ " : ""}{step.label}
                </button>
              </li>
            );
          })}
        </ol>
        {activeStep === "clock" && <ClockBar />}
        {activeStep === "vehicle" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Vehicle
              <select value={vehicleId} onChange={(e) => {
                setVehicleId(e.target.value);
                const v = vehicles.find((x) => x.id === e.target.value);
                setStartOdometer(String(v?.current_odometer ?? ""));
              }} style={{ minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}>
                <option value="">No vehicle</option>
                {vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname}</option>)}
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>
              Starting odometer (mi)
              <input value={startOdometer} onChange={(e) => setStartOdometer(e.target.value)} inputMode="numeric"
                style={{ minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }} />
            </label>
            <button type="button" className="p7-btn p7-btn-secondary" style={{ minHeight: 44 }}
              onClick={() => setState((s) => ({ ...s, vehicleReady: true }))}>
              Continue
            </button>
          </div>
        )}
        {activeStep === "mileage" && (
          <button type="button" className="p7-btn p7-btn-primary" style={{ minHeight: 44, width: "100%" }}
            onClick={startMileage} disabled={pending}>
            {pending ? "Starting…" : "Start mileage session"}
          </button>
        )}
      </div>
    </>
  );
}