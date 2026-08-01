"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import type { ViewMode } from "./ScheduleCalendar";

interface Props {
  current: ViewMode;
  isAdmin: boolean;
  weekUrl: string;
  monthUrl: string;
  yearUrl: string;
  listUrl?: string;
}

/**
 * Schedule view switcher: Week / Month / Year (+ List for owner/admin).
 * Field-friendly touch targets via .p7-schedule-toggle CSS.
 */
export function ScheduleViewToggle({
  current,
  isAdmin,
  weekUrl,
  monthUrl,
  yearUrl,
  listUrl = "/app/schedule?view=list",
}: Props) {
  const router = useRouter();

  const tabs: { key: ViewMode; label: string; url: string }[] = [
    { key: "week", label: "Week", url: weekUrl },
    { key: "month", label: "Month", url: monthUrl },
    { key: "year", label: "Year", url: yearUrl },
  ];
  if (isAdmin) tabs.push({ key: "list", label: "List", url: listUrl });

  return (
    <div className="p7-schedule-toggle" role="tablist" aria-label="Schedule view">
      {tabs.map((t) => {
        const active = current === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            className={`p7-schedule-toggle__btn${active ? " p7-schedule-toggle__btn--active" : ""}`}
            onClick={() => router.push(t.url as Route)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
