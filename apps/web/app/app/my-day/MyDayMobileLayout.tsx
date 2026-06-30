"use client";

import { useState } from "react";
import { StartMyDayWizard } from "./StartMyDayWizard";
import { DayStatusPill } from "./DayStatusPill";
import { NextVisitHero } from "./NextVisitHero";
import { FieldQuickActions } from "./FieldQuickActions";
import { ClockBar } from "../ClockBar";
import { BusinessDayBar } from "../BusinessDayBar";
import { WorkdayPanel } from "../WorkdayPanel";
import { isDaySetupComplete, type DaySetupState } from "@/lib/my-day/day-setup";
import type { HeroVisit } from "@/lib/my-day/visit-hero";
import type { OpenSession, VehicleOption } from "../WorkdayPanel";
import type { ActivityEntryDto } from "../ActivityTracker";
import type { DayMileageSummary } from "@/lib/mileage/sessions";

export function MyDayMobileLayout({
  todayLabel,
  openSession,
  vehicles,
  activityEntries,
  dayMileage,
  yesterdayMiles,
  heroVisit,
  clockedIn,
  children,
}: {
  todayLabel: string;
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
  yesterdayMiles: number;
  heroVisit: HeroVisit | null;
  clockedIn: boolean;
  children: React.ReactNode;
}) {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [vehicleStepDone, setVehicleStepDone] = useState(!!openSession);
  const setup: DaySetupState = {
    clockedIn,
    hasOpenSession: !!openSession,
    vehicleReady: !!openSession || vehicleStepDone,
  };
  const complete = isDaySetupComplete(setup);

  return (
    <>
      {!complete ? (
        <button
          type="button"
          data-testid="start-my-day-button"
          className="p7-btn p7-btn-primary"
          style={{ width: "100%", minHeight: 48, marginBottom: "var(--space-4)", fontWeight: 700 }}
          onClick={() => setWizardOpen(true)}
        >
          Start My Day
        </button>
      ) : (
        <>
          <div style={{ marginBottom: "var(--space-4)" }}>
            <DayStatusPill
              state={setup}
              vehicleLabel={openSession?.vehicle_nickname ?? null}
              milesToday={dayMileage.totalMiles}
              onReopen={() => setWizardOpen(true)}
            />
          </div>
          <ClockBar />
          <BusinessDayBar />
        </>
      )}

      <StartMyDayWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onVehicleReady={() => setVehicleStepDone(true)}
        initialState={setup}
        vehicles={vehicles}
      />

      {heroVisit && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <NextVisitHero visit={heroVisit} />
        </div>
      )}

      <div style={{ marginBottom: "var(--space-6)" }}>
        <FieldQuickActions />
      </div>

      {children}

      <details style={{ marginTop: "var(--space-6)" }}>
        <summary style={{ fontWeight: 700, cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>
          Manage day
        </summary>
        <div style={{ marginTop: "var(--space-4)" }}>
          <WorkdayPanel
            surface="my_day"
            todayLabel={todayLabel}
            openSession={openSession}
            vehicles={vehicles}
            activityEntries={activityEntries}
            dayMileage={dayMileage}
            yesterdayMiles={yesterdayMiles}
          />
        </div>
      </details>
    </>
  );
}