"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StartMyDayWizard } from "./StartMyDayWizard";
import { DayStatusPill } from "./DayStatusPill";
import { NextVisitHero, TodayStopRail } from "./NextVisitHero";
import { FieldQuickActions } from "./FieldQuickActions";
import { PushPermissionPrompt } from "@/components/push/PushPermissionPrompt";
import { useToast } from "@/components/ui";
import { isDaySetupComplete, startDayMode, type DaySetupState } from "@/lib/my-day/day-setup";
import { shouldShowVisitHero, type HeroVisit } from "@/lib/my-day/visit-hero";
import { showLeaveList } from "@/lib/field/face";
import { ACTIVITY_TYPE_META, type ActivityType } from "@ai-fsm/domain";
import { ClockBar } from "../ClockBar";
import { pickStartVehicle } from "@/lib/mileage/start-day";
import type { OpenSession, VehicleOption } from "@/lib/my-work/field-day-types";
import type { ActivityEntryDto } from "@/lib/my-work/field-day-types";
import type { DayMileageSummary } from "@/lib/mileage/sessions";

export function MyDayMobileLayout({
  openSession,
  activityEntries,
  vehicles,
  dayMileage,
  heroVisit,
  clockedIn,
  hasParkProposal = false,
  currentJobId = null,
  canCapture = false,
  canQuickBook = false,
  priorDayNeedsMileage = false,
  priorOpenSession = null,
  more = null,
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
  priorDayNeedsMileage?: boolean;
  priorOpenSession?: OpenSession | null;
  more?: React.ReactNode;
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
    priorDayNeedsMileage,
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
    } catch {
      toast.error("Could not start the day. Open day setup to retry.");
      setWizardOpen(true);
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

  const showCommand = showHero && !!heroVisit && (complete || showLeaveList(heroVisit.status));
  const activity = activityEntries.find(e => !e.ended_at);
  const activityLabel = activity ? ACTIVITY_TYPE_META[activity.activity_type as ActivityType]?.label ?? "Activity recorded" : "No activity running";

  return (
    <div className={showCommand ? "field-today field-today--split" : "field-today"}>
      <div className="field-today__main">
      <PushPermissionPrompt enabled={!!canCapture} />

      {!complete ? (
        <div className="p7-field-hero" style={{ marginBottom: "var(--space-4)" }}>
          <div className="p7-field-hero__kicker">Today</div>
          <div className="p7-field-hero__title">
            {priorDayNeedsMileage
              ? "Enter the truck’s miles"
              : mode === "odometer"
                ? "Enter today’s miles"
                : "Start your day"}
          </div>
          <p className="p7-field-hero__meta" style={{ margin: 0 }}>
            {priorDayNeedsMileage
              ? "A previous day has no closing reading. Add it before starting mileage today."
              : mode === "one_tap"
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
      ) : null}
      <>
          {showCommand && heroVisit ? <NextVisitHero visit={heroVisit} /> : null}
          {complete ? <DayStatusPill
            state={setup}
            activityLabel={activityLabel}
            vehicleLabel={openSession?.vehicle_nickname ?? null}
            milesToday={dayMileage.totalMiles}
            onReopen={() => setWizardOpen(true)}
          /> : null}
      </>

      {children}

      <details className="field-more" data-testid="today-more">
        <summary>Day details &amp; history</summary>
        <div className="field-more__body">
          <FieldQuickActions canQuickBook={canQuickBook} currentJobId={currentJobId} />
          <ClockBar />
          {more}
        </div>
      </details>

      {complete || clockedIn ? (
        <div style={{ marginTop: "var(--space-6)", textAlign: "center" }}>
          <Link
            href="/app/day-review"
            data-testid="end-my-day-button"
            style={{
              color: "var(--fg-muted)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textDecoration: "underline",
            }}
          >
            Review &amp; end day
          </Link>
        </div>
      ) : null}
      </div>
      {showCommand && heroVisit ? <TodayStopRail visit={heroVisit} /> : null}
      <StartMyDayWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onVehicleReady={() => setVehicleStepDone(true)}
        initialState={setup}
        vehicles={vehicles}
        priorOpenSession={priorOpenSession}
      />
    </div>
  );
}
