"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** True when the user is mid-edit in a field/menu we shouldn't yank out from under. */
export function isEditing(active: Element | null): boolean {
  if (!active) return false;
  const tag = active.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((active as HTMLElement).isContentEditable) return true;
  return active.getAttribute("aria-expanded") === "true";
}

/**
 * Passively re-runs server components (router.refresh) so newly-arrived
 * server data — arrival proposals, attention items, etc. — surfaces without
 * a manual reload. Mounted once in AppShell, so every page benefits.
 *
 * ponytail: polling, not push. SSE/WebSocket only if sub-30s cross-user
 * latency ever matters; for a handful of field users this is plenty.
 */
export function LiveRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (isEditing(document.activeElement)) return;
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const id = window.setInterval(refresh, intervalMs);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.clearInterval(id);
    };
  }, [router, intervalMs]);

  return null;
}
