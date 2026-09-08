"use client";

import { formatBusinessDate, formatBusinessDateTime } from "@/lib/time/business-tz";

interface Props {
  iso: string;
  dateOnly?: boolean;
}

/** Instant timestamps in Eastern (EST/EDT). Not the browser zone, not UTC. */
export function LocalTime({ iso, dateOnly = false }: Props) {
  return <>{dateOnly ? formatBusinessDate(iso) : formatBusinessDateTime(iso)}</>;
}
