"use client";

import { useEffect, useRef } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { resolvePostLoginHref } from "@/lib/auth/post-login-destination";

// Workspace mode = which landing surface the owner uses: Office (/app, run the
// business) or Field (/app/my-work, do the work). Default is AUTOMATIC by device —
// phones open to Field, tablets/computers open to Office — with an explicit
// override saved from Settings (cookie dv_ws_mode). No popup, no on-screen toggle
// (TASK-058). This component renders nothing; it only steers the workspace roots.

const OFFICE_ROOT = "/app";
const FIELD_ROOT = "/app/my-work";

export function WorkspaceAutoRoute() {
  const pathname = usePathname();
  const router = useRouter();
  // One steer per pathname visit — avoid replace thrash if effect re-runs.
  const steeredFor = useRef<string | null>(null);

  useEffect(() => {
    // Only act on the two workspace roots. Other pages are left alone.
    const onOffice = pathname === OFFICE_ROOT;
    const onField = pathname === FIELD_ROOT;
    if (!onOffice && !onField) return;
    if (steeredFor.current === pathname) return;

    const isPhone =
      typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    const target = resolvePostLoginHref("owner", {
      cookieHeader: typeof document !== "undefined" ? document.cookie : null,
      isPhone,
    });

    if (target !== pathname) {
      steeredFor.current = pathname;
      router.replace(target as Route);
    }
  }, [pathname, router]);

  return null;
}
