"use client";

/**
 * Client-component wrapper that loads JobEditForm with ssr: false.
 *
 * JobEditForm uses Date#getHours/getMinutes (local-time) to compute initial
 * ScheduleFields state from stored UTC ISO strings.  If rendered on the
 * server the output depends on the server timezone (UTC on Pi), while the
 * client hydrates using the user's local timezone — causing React hydration
 * error #418.  Loading client-side only eliminates the mismatch.
 */
import nextDynamic from "next/dynamic";

export const JobEditForm = nextDynamic(
  () => import("./JobEditForm").then((m) => ({ default: m.JobEditForm })),
  { ssr: false }
);
