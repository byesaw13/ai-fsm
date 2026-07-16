"use client";

import { useRouter } from "next/navigation";

function shiftDay(day: string, deltaDays: number): string {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return d.toLocaleDateString("en-CA");
}

/** Shared day picker for the activity timeline page. */
export function TimelineDayNav({ date }: { date: string }) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
      <button
        type="button"
        className="p7-btn p7-btn-secondary p7-btn-sm"
        onClick={() => router.push(`/app/timeline?date=${shiftDay(date, -1)}`)}
      >
        ← Prev
      </button>
      <button
        type="button"
        className="p7-btn p7-btn-secondary p7-btn-sm"
        onClick={() => router.push(`/app/timeline?date=${new Date().toLocaleDateString("en-CA")}`)}
      >
        Today
      </button>
      <button
        type="button"
        className="p7-btn p7-btn-secondary p7-btn-sm"
        onClick={() => router.push(`/app/timeline?date=${shiftDay(date, 1)}`)}
      >
        Next →
      </button>
    </div>
  );
}
