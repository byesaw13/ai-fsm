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
 * The Schedule view switcher: Week / Month / Year, plus a List (triage) tab for
 * owner/admin. Shared by the calendar and the List view so the two never drift.
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
    <div style={{ display: "flex", gap: 2, background: "var(--bg-muted, #f4f4f5)", padding: 2, borderRadius: 8 }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => router.push(t.url as Route)}
          style={{
            padding: "4px 12px",
            borderRadius: 6,
            border: "none",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            cursor: "pointer",
            background: current === t.key ? "#fff" : "transparent",
            color: current === t.key ? "var(--fg)" : "var(--fg-muted)",
            boxShadow: current === t.key ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            transition: "all 0.1s",
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
