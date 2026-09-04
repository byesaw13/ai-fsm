"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** A focused field counts as "editing" only if the user typed this recently. */
export const IDLE_MS = 5_000;

/**
 * True when refreshing would disrupt the user: an open menu/combobox, or a
 * text field they've typed in within the last `msSinceTyped` window. Lingering
 * focus after the app is backgrounded (no recent typing) does NOT block a
 * refresh — otherwise resume would leave new server state stale indefinitely.
 */
export function isEditing(active: Element | null, msSinceTyped: number): boolean {
  if (!active) return false;
  // An open menu/combobox — a refresh would close it under the user.
  if (active.getAttribute("aria-expanded") === "true") return true;
  const tag = active.tagName;
  const isTextField =
    tag === "INPUT" || tag === "TEXTAREA" || (active as HTMLElement).isContentEditable;
  return isTextField && msSinceTyped < IDLE_MS;
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
  const lastTypedRef = useRef(0);

  useEffect(() => {
    const onType = () => {
      lastTypedRef.current = Date.now();
    };
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (isEditing(document.activeElement, Date.now() - lastTypedRef.current)) return;
      router.refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("keydown", onType, true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const id = window.setInterval(refresh, intervalMs);
    return () => {
      document.removeEventListener("keydown", onType, true);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.clearInterval(id);
    };
  }, [router, intervalMs]);

  return null;
}
