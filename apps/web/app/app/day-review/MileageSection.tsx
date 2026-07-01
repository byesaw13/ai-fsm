import type { DayReviewPayload } from "@/lib/day-review/queries";

type Mileage = DayReviewPayload["mileage"];

export function MileageSection({ mileage }: { mileage: Mileage }) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-semibold mb-3">Mileage</h2>
      <div className="border rounded-lg p-4">
        {mileage.vehicleName ? (
          <>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Vehicle</span>
              <span className="text-sm font-medium">{mileage.vehicleName}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-sm text-muted-foreground">Odometer</span>
              <span className="text-sm font-medium">
                {mileage.odometerMiles != null ? `${mileage.odometerMiles} mi` : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-muted-foreground">GPS estimate</span>
              <span className="text-sm font-medium">{mileage.gpsMiles} mi</span>
            </div>
            {mileage.flagged && (
              <p className="text-xs text-yellow-600 mt-3">
                GPS and odometer differ by {mileage.deltaPercent}% — worth a double-check.
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No vehicle session recorded for this day.</p>
        )}
      </div>
    </section>
  );
}
