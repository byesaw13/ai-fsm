"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js in production only.
 *
 * In development we intentionally skip registration so a stale worker never
 * intercepts requests during local work. Registration is also a no-op on a
 * non-secure origin (the browser rejects it) — see TASK-020: an HTTP `.local`
 * production origin will silently fail this and remain non-installable until
 * served over HTTPS or localhost.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal (e.g. insecure origin) */
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
