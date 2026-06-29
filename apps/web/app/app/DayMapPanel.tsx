"use client";

import dynamic from "next/dynamic";
import { SectionHeader } from "@/components/ui";

// Leaflet touches `window`, so load the map client-side only.
const DayMap = dynamic(() => import("./DayMap"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: 320,
        borderRadius: "var(--radius-lg)",
        border: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
        fontSize: "0.85rem",
      }}
    >
      Loading map…
    </div>
  ),
});

// TASK-026: the day map on the activity timeline.
export function DayMapPanel({ day }: { day?: string }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
      <SectionHeader title="Day map" />
      <DayMap day={day} />
    </section>
  );
}
