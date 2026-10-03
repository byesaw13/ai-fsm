"use client";

import { useEffect } from "react";

/** The next unresolved stop is the saved progress. Reopening the day scrolls to it. */
export function ScrollToNextUnresolved({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return;
    document.getElementById("next-unresolved")?.scrollIntoView({ block: "start" });
  }, [active]);
  return null;
}
