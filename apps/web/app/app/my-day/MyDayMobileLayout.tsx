"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StartMyDayWizard } from "./StartMyDayWizard";
import { DayStatusPill } from "./DayStatusPill";
import { NextVisitHero } from "./NextVisitHero";
import { FieldQuickActions } from "./FieldQuickActions";
import { FieldRightNowCard } from "../my-work/FieldRightNowCard";
import { PushPermissionPrompt } from "@/components/push/PushPermissionPrompt";
import { useToast } from "@/components/ui";
import { isDaySetupComplete, startDayMode, type DaySetupState } from "@/lib/my-day/day-setup";
import { shouldShowVisitHero, type HeroVisit } from "@/lib/my-day/visit-hero";
import { pickStartVehicle } from "@/lib/mileage/start-day";
import type { OpenSession, VehicleOption } from "@/lib/my-work/field-day-types";
import type { ActivityEntryDto } from "@/lib/my-work/field-day-types";
import type { DayMileageSummary } from "@/lib/mileage/sessions";

export function MyDayMobileLayout({
  openSession,
  vehicles,
  activityEntries,
  dayMileage,
  heroVisit,
  clockedIn,
  hasParkProposal = false,
  currentJobId = null,
  canCapture = false,
  canQuickBook = false,
  children,
}: {
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
  heroVisit: HeroVisit | null;
  clockedIn: boolean;
  hasParkProposal?: boolean;
  currentJobId?: string | null;
  canCapture?: boolean;
  canQuickBook?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [vehicleStepDone, setVehicleStepDone] = useState(!!openSession);
  const [starting, setStarting] = useState(false);
  const setup: DaySetupState = {
    clockedIn,
    hasOpenSession: !!openSession,
    vehicleReady: !!openSession || vehicleStepDone,
  };
  const complete = isDaySetupComplete(setup);
  const defaultVehicle = useMemo(() => pickStartVehicle(vehicles), [vehicles]);
  const mode = startDayMode({
    clockedIn,
    hasOpenSession: !!openSession,
    hasVehicle: !!defaultVehicle,
    lastOdometer: defaultVehicle?.current_odometer ?? null,
  });
  const showHero = !!heroVisit && shouldShowVisitHero({ hasParkProposal });

  async function oneTapStart() {
    setStarting(true);
    try {
      if (!clockedIn) {
        const clock = await fetch("/api/v1/time-clock/clock-in", { method: "POST" });
        if (!clock.ok) {
          const json = await clock.json().catch(() => ({}));
          toast.error(json.error?.message ?? "Could not clock in");
          setWizardOpen(true);
          return;
        }
      }
      const vehicle = pickStartVehicle(vehicles);
      const odo = vehicle?.current_odometer;
      if (!vehicle || odo == null) {
        setWizardOpen(true);
        return;
      }
      const session = await fetch("/api/v1/sessions/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vehicle_id: vehicle.id, start_odometer: odo }),
      });
      if (!session.ok) {
        setWizardOpen(true);
        return;
      }
      window.dispatchEvent(new Event("ops:refresh"));
      router.refresh();
    } finally {
      setStarting(false);
    }
  }

  function onStartDay() {
    if (mode === "one_tap") {
      void oneTapStart();
      return;
    }
    setWizardOpen(true);
  }

  return (
    <>
      {showHero && heroVisit ? (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <NextVisitHero visit={heroVisit} />
        </div>
      ) : null}

      <PushPermissionPrompt enabled={!!canCapture} />

      {!complete ? (
        <div className="p7-field-hero" style={{ marginBottom: "var(--space-4)" }}>
          <div className="p7-field-hero__kicker">Today</div>
          <div className="p7-field-hero__title">
            {mode === "odometer" ? "Enter today’s miles" : "Start your day"}
          </div>
          <p className="p7-field-hero__meta" style={{ margin: 0 }}>
            {mode === "one_tap"
              ? `${defaultVehicle?.nickname ?? "Truck"} · ${defaultVehicle?.current_odometer?.toLocaleString()} mi`
              : mode === "odometer"
                ? "One number. Then you’re tracking."
                : "Clock in, pick the truck, start mileage."}
          </p>
          <div className="p7-field-hero__actions">
            <button
              type="button"
              data-testid="start-my-day-button"
              className="p7-field-hero__primary"
              disabled={starting}
              onClick={onStartDay}
            >
              {starting ? "…" : "Start day"}
            </button>
            {mode === "one_tap" ? (
              <button
                type="button"
                data-testid="start-day-more"
                className="p7-field-hero__secondary"
                onClick={() => setWizardOpen(true)}
              >
                Different truck
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <DayStatusPill
            state={setup}
            vehicleLabel={openSession?.vehicle_nickname ?? null}
            milesToday={dayMileage.totalMiles}
            onReopen={() => setWizardOpen(true)}
          />
        </div>
      )}

      {complete ? (
        <>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <FieldRightNowCard
              openSession={openSession}
              vehicles={vehicles}
              activityEntries={activityEntries}
              milesToday={dayMileage.totalMiles}
              onStartMileage={() => setWizardOpen(true)}
            />
          </div>
          <Link
            href="/app/day-review"
            data-testid="end-my-day-button"
            className="p7-btn p7-btn-secondary"
            style={{
              width: "100%",
              minHeight: 48,
              marginBottom: "var(--space-4)",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "var(--space-2)",
            }}
          >
            End day
          </Link>
        </>
      ) : null}

      <StartMyDayWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onVehicleReady={() => setVehicleStepDone(true)}
        initialState={setup}
        vehicles={vehicles}
      />

      <div style={{ marginBottom: "var(--space-6)" }}>
        <FieldQuickActions canQuickBook={canQuickBook} currentJobId={currentJobId} />
      </div>

      {children}
    </>
  );
}
