"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClockBar } from "../ClockBar";
import { Button, Modal, useToast } from "@/components/ui";
import {
  isDaySetupComplete,
  nextIncompleteStep,
  type DaySetupState,
  type DaySetupStep,
} from "@/lib/my-day/day-setup";
import { pickStartVehicle } from "@/lib/mileage/start-day";
import type { VehicleOption } from "@/lib/my-work/field-day-types";

const STEPS: { key: DaySetupStep; label: string }[] = [
  { key: "clock", label: "Clock in" },
  { key: "vehicle", label: "Vehicle & odometer" },
  { key: "mileage", label: "Start mileage" },
];

type PriorPrompt = {
  openSessionId: string;
  suggestedEnd: number;
  retry: () => Promise<void>;
};

export function StartMyDayWizard({
  open,
  onClose,
  onVehicleReady,
  initialState,
  vehicles,
}: {
  open: boolean;
  onClose: () => void;
  onVehicleReady: () => void;
  initialState: DaySetupState;
  vehicles: VehicleOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const defaultVehicle = useMemo(() => pickStartVehicle(vehicles), [vehicles]);
  const [state, setState] = useState(initialState);
  const [activeStep, setActiveStep] = useState<DaySetupStep>(nextIncompleteStep(initialState) ?? "clock");
  const [vehicleId, setVehicleId] = useState(defaultVehicle?.id ?? "");
  const [startOdometer, setStartOdometer] = useState(String(defaultVehicle?.current_odometer ?? ""));
  const [pending, setPending] = useState(false);
  const [prior, setPrior] = useState<PriorPrompt | null>(null);
  const [priorEnd, setPriorEnd] = useState("");

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
    if (!open) return;
    setState((s) => ({
      ...initialState,
      clockedIn: s.clockedIn || initialState.clockedIn,
    }));
    setActiveStep(nextIncompleteStep(initialState) ?? "clock");
  }, [open, initialState]);

  useEffect(() => {
    if (!open || !defaultVehicle) return;
    setVehicleId(defaultVehicle.id);
    setStartOdometer(String(defaultVehicle.current_odometer ?? ""));
  }, [open, defaultVehicle?.id]);

  useEffect(() => {
    if (!open) return;
    const stepDone =
      (activeStep === "clock" && state.clockedIn) ||
      (activeStep === "vehicle" && state.vehicleReady) ||
      (activeStep === "mileage" && state.hasOpenSession);
    if (!stepDone) return;
    const next = nextIncompleteStep(state);
    if (next) setActiveStep(next);
  }, [open, state, activeStep]);

  useEffect(() => {
    if (!open) return;
    if (isDaySetupComplete(state)) {
      onClose();
      router.refresh();
    }
  }, [open, state, onClose, router]);

  const postStart = useCallback(async (vId: string | null, start: number) => {
    setPending(true);
    const res = await fetch("/api/v1/sessions/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicle_id: vId, start_odometer: start }),
    });
    const json = await res.json().catch(() => ({}));
    setPending(false);
    if (res.status === 409 && json.error?.code === "INCOMPLETE_PRIOR_SESSION") {
      setPrior({
        openSessionId: json.error.open_session_id,
        suggestedEnd: json.error.suggested_end_odometer ?? start,
        retry: () => postStart(vId, start),
      });
      setPriorEnd(String(json.error.suggested_end_odometer ?? start));
      return;
    }
    if (!res.ok) {
      toast.error(json.error?.message ?? "Could not start session");
      return;
    }
    toast.success("Mileage session started");
    setState((s) => ({ ...s, hasOpenSession: true, vehicleReady: true }));
    window.dispatchEvent(new Event("ops:refresh"));
    router.refresh();
  }, [router, toast]);

  async function startMileage() {
    const odo = Number(startOdometer);
    if (!Number.isInteger(odo) || odo < 0) {
      toast.error("Enter a valid start odometer");
      return;
    }
    await postStart(vehicleId || null, odo);
  }

  async function resolvePrior() {
    if (!prior) return;
    const end = Number(priorEnd);
    if (!Number.isInteger(end) || end < 1) {
      toast.error("Enter the end odometer for the open session");
      return;
    }
    setPending(true);
    const res = await fetch(`/api/v1/sessions/${prior.openSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ end_odometer: end }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setPending(false);
      toast.error(json.error?.message ?? "Could not close the open session");
      return;
    }
    const retry = prior.retry;
    setPrior(null);
    setPending(false);
    toast.success("Prior session closed");
    await retry();
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
              onClick={onVehicleReady}>
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

      <Modal
        open={!!prior}
        onClose={() => setPrior(null)}
        title="Close the open session first"
        data-testid="prior-session-prompt"
        zIndex={520}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <p style={{ margin: 0 }}>
            This vehicle still has an open mileage session from a prior day. Enter its end odometer to close it before starting today&apos;s session.
          </p>
          <label style={{ display: "flex", flexDirection: "column", gap: 6, fontWeight: 600, fontSize: "var(--text-sm)" }}>
            End odometer
            <input
              value={priorEnd}
              onChange={(e) => setPriorEnd(e.target.value)}
              inputMode="numeric"
              style={{ minHeight: 44, padding: "0 var(--space-3)", borderRadius: "var(--radius-md)", border: "1px solid var(--border)" }}
            />
          </label>
          <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setPrior(null)} disabled={pending}>Cancel</Button>
            <Button variant="primary" onClick={resolvePrior} loading={pending} disabled={pending}>Close &amp; continue</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}