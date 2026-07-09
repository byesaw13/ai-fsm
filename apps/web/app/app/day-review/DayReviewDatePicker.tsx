"use client";

import { useRouter } from "next/navigation";

export function DayReviewDatePicker({ date }: { date: string }) {
  const router = useRouter();

  return (
    <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "0.85rem" }}>
      <span style={{ color: "var(--text-muted)" }}>Date</span>
      <input
        type="date"
        value={date}
        onChange={(e) => {
          const next = e.target.value;
          if (next) router.push(`/app/day-review?date=${next}`);
        }}
        style={{
          padding: "var(--space-1) var(--space-2)",
          borderRadius: "var(--radius-md)",
          border: "1px solid var(--border)",
        }}
      />
    </label>
  );
}