import type { DayReviewPayload } from "@/lib/day-review/queries";
import { HybridMileageStrip } from "@/components/mileage/HybridMileageStrip";

type Mileage = DayReviewPayload["mileage"];

export function MileageSection({
  mileage,
  date,
}: {
  mileage: Mileage;
  date: string;
}) {
  return (
    <HybridMileageStrip
      title="Hybrid mileage (tax dual path)"
      exportHref={`/api/v1/reports/mileage-export?from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`}
      mileage={{
        vehicleSessionId: mileage.vehicleSessionId,
        vehicleName: mileage.vehicleName,
        startOdometer: mileage.startOdometer,
        endOdometer: mileage.endOdometer,
        primaryMiles: mileage.odometerMiles,
        primarySource: mileage.primarySource,
        gpsMiles: mileage.gpsMiles,
        deltaPercent: mileage.deltaPercent,
        flagged: mileage.flagged,
        reason: mileage.reason,
      }}
    />
  );
}
