"use client";

interface Props {
  iso: string;
  dateOnly?: boolean;
}

/**
 * Renders a timestamp in the browser's local timezone.
 * Must be a client component — server-side toLocaleString() uses server TZ (UTC).
 */
export function LocalTime({ iso, dateOnly = false }: Props) {
  const d = new Date(iso);
  return (
    <>
      {dateOnly
        ? d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
        : d.toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
    </>
  );
}
