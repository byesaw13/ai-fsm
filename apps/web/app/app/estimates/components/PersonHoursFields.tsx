"use client";

import { Input } from "@/components/ui";
import {
  HOURS_MISSING_LABEL,
  PERSON_HOURS_HINT,
  PERSON_HOURS_LABEL,
  hoursAreMissing,
} from "@/lib/estimates/stored-hours";

/** Staff range for one quote or one labor line. Blank stays blank. */
export function PersonHoursFields({
  low,
  high,
  onLow,
  onHigh,
  disabled,
  idPrefix = "person-hours",
  showMissing = true,
}: {
  low: string;
  high: string;
  onLow: (value: string) => void;
  onHigh: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
  showMissing?: boolean;
}) {
  const missing = showMissing && hoursAreMissing(low, high);
  return (
    <div>
      <div className="p7-form-grid p7-form-grid-2">
        <Input
          id={`${idPrefix}-low`}
          label={`${PERSON_HOURS_LABEL} low`}
          type="number"
          min="0"
          step="0.25"
          inputMode="decimal"
          placeholder="Low"
          value={low}
          disabled={disabled}
          onChange={(e) => onLow(e.target.value)}
          data-testid={`${idPrefix}-low`}
        />
        <Input
          id={`${idPrefix}-high`}
          label={`${PERSON_HOURS_LABEL} high`}
          type="number"
          min="0"
          step="0.25"
          inputMode="decimal"
          placeholder="High"
          value={high}
          disabled={disabled}
          onChange={(e) => onHigh(e.target.value)}
          data-testid={`${idPrefix}-high`}
        />
      </div>
      <p className="muted" style={{ fontSize: "var(--text-xs)", margin: "var(--space-1) 0 0" }}>
        {PERSON_HOURS_HINT}
      </p>
      {missing && (
        <p
          style={{ fontSize: "var(--text-xs)", color: "var(--color-danger)", margin: "var(--space-1) 0 0" }}
          data-testid={`${idPrefix}-missing`}
        >
          {HOURS_MISSING_LABEL}
        </p>
      )}
    </div>
  );
}
