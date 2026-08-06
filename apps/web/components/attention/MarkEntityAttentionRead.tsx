"use client";

import { useEffect, useRef } from "react";
import type { AttentionEntityType } from "@/lib/attention/types";

/**
 * Fires once after the user has actually navigated to the entity page.
 * Avoids clearing attention events during Next.js Link RSC prefetch.
 */
export function MarkEntityAttentionRead({
  entityType,
  entityId,
}: {
  entityType: AttentionEntityType;
  entityId: string;
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    if (!entityId) return;
    fired.current = true;
    void fetch("/api/v1/attention/entity-read", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entityType, entityId }),
    }).catch(() => {
      // non-fatal
    });
  }, [entityType, entityId]);

  return null;
}
