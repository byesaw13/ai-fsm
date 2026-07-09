"use client";

import { useEffect, useState } from "react";
import type { FieldSiteContext } from "@/lib/field/site-context";

/** Owner timeline: shows who you're likely with right now (appointment or GPS). */
export function LikelySiteBanner() {
  const [ctx, setCtx] = useState<FieldSiteContext | null>(null);

  useEffect(() => {
    void fetch("/api/v1/field/site-context")
      .then((r) => r.json())
      .then((d: { data?: FieldSiteContext }) => setCtx(d.data ?? null))
      .catch(() => setCtx(null));
  }, []);

  const likely = ctx?.likely;
  const confirmed = ctx?.confirmedStop;
  if (!likely || !confirmed) return null;

  return (
    <div
      data-testid="likely-site-banner"
      style={{
        marginBottom: "var(--space-4)",
        padding: "var(--space-3)",
        borderRadius: "var(--radius-md)",
        border: "1px solid color-mix(in srgb, var(--accent) 35%, var(--border))",
        background: "color-mix(in srgb, var(--accent) 8%, var(--bg-card))",
        fontSize: "var(--text-sm)",
      }}
    >
      <strong>GPS stop confirmed:</strong> {likely.clientName}
      {likely.propertyAddress ? ` · ${likely.propertyAddress}` : ""}
      <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>
        ({confirmed.distanceMeters}m from property pin)
      </span>
      {confirmed.travelBefore && (
        <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>
          · Drive in: ~{confirmed.travelBefore.durationMinutes} min
        </span>
      )}
      {ctx?.activeSiteSession && (
        <span style={{ marginLeft: 8, color: "var(--accent)", fontWeight: 600 }}>
          · Timer running
        </span>
      )}
    </div>
  );
}