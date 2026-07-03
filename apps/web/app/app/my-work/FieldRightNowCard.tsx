"use client";

import { NowBar, type ActivityEntryDto } from "../ActivityTracker";
import type { OpenSession, VehicleOption } from "../WorkdayPanel";
import { VehicleRow } from "./VehicleRow";

export function FieldRightNowCard({
  openSession,
  vehicles,
  activityEntries,
  milesToday,
  onStartMileage,
}: {
  openSession: OpenSession | null;
  vehicles: VehicleOption[];
  activityEntries: ActivityEntryDto[];
  milesToday: number;
  onStartMileage?: () => void;
}) {
  const activeEntry = activityEntries.find((e) => e.ended_at === null) ?? null;

  return (
    <div className="field-right-now" data-testid="field-right-now">
      <div className="field-right-now__label">Right now</div>
      <div className="field-right-now__section">
        <NowBar
          active={activeEntry}
          quickTypes={["travel", "job_work", "material_run", "admin", "personal"]}
        />
      </div>
      <div className="field-right-now__section">
        <VehicleRow
          openSession={openSession}
          vehicles={vehicles}
          milesToday={milesToday}
          onStartMileage={onStartMileage}
        />
      </div>
    </div>
  );
}