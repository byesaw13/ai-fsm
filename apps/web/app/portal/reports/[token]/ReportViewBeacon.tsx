"use client";

import { useEffect } from "react";

/** Counts an open only when a real browser shows the page (see the /viewed route). */
export function ReportViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    const send = () =>
      fetch(`/api/portal/reports/${token}/viewed`, { method: "POST", keepalive: true }).catch(() => undefined);
    if (document.visibilityState === "visible") {
      send();
      return;
    }
    // Opened in a background tab: count it once the person actually looks.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      send();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token]);
  return null;
}
