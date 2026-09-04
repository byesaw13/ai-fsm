"use client";

import Link from "next/link";
import { useState } from "react";
import { StartMyDayWizard } from "./StartMyDayWizard";
import { DayStatusPill } from "./DayStatusPill";
import { NextVisitHero } from "./NextVisitHero";
import { FieldQuickActions } from "./FieldQuickActions";
import { ClockBar } from "../ClockBar";
import { FieldRightNowCard } from "../my-work/FieldRightNowCard";
import { SitePresenceCard } from "@/components/field/SitePresenceCard";
import { isDaySetupComplete, type DaySetupState } from "@/lib/my-day/day-setup";
import type { HeroVisit } from "@/lib/my-day/visit-hero";
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
  canCapture = false,
  children,
}: {
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  dayMileage: DayMileageSummary;
  heroVisit: HeroVisit | null;
  clockedIn: boolean;
  canCapture?: boolean;
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
  const partial = !complete && clockedIn;

  return (
    <>
      {/* Next visit first when present so Navigate / Call / Open stay above the
          fixed bottom nav without scrolling (QA ISSUE-005). */}
      {heroVisit && (
        <div style={{ marginBottom: "var(--space-4)" }}>
          <NextVisitHero visit={heroVisit} />
        </div>
      )}

      {!complete ? (
        <div className="p7-field-hero" style={{ marginBottom: "var(--space-4)" }}>
          <div className="p7-field-hero__kicker">Home · My Day</div>
          <div className="p7-field-hero__title">
            {partial ? "Finish starting your day" : "Start your day"}
          </div>
          <p className="p7-field-hero__meta" style={{ margin: 0 }}>
            {partial
              ? "Clock, vehicle, and mileage — confirm what’s left."
              : "One flow: clock in, pick the truck, start mileage."}
          </p>
          <div className="p7-field-hero__actions">
            <button
              type="button"
              data-testid="start-my-day-button"
              className="p7-field-hero__primary"
              onClick={() => setWizardOpen(true)}
            >
              {partial ? "Continue My Day" : "Start My Day"}
            </button>
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

      {clockedIn && (
        <>
          <ClockBar />
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
            End My Day
          </Link>
          <SitePresenceCard />
          <div style={{ marginBottom: "var(--space-4)" }}>
            <FieldRightNowCard
              openSession={openSession}
              vehicles={vehicles}
              activityEntries={activityEntries}
              milesToday={dayMileage.totalMiles}
              onStartMileage={() => setWizardOpen(true)}
            />
          </div>
        </>
      )}

      <StartMyDayWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onVehicleReady={() => setVehicleStepDone(true)}
        initialState={setup}
        vehicles={vehicles}
      />

      <div style={{ marginBottom: "var(--space-6)" }}>
        <FieldQuickActions showCapture={canCapture} />
      </div>

      {children}
    </>
  );
}