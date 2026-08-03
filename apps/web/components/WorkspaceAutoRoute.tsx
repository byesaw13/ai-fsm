"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    // Only act on the two workspace roots. Other pages are left alone.
    const onOffice = pathname === OFFICE_ROOT;
    const onField = pathname === FIELD_ROOT;
    if (!onOffice && !onField) return;

    const isPhone =
      typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    const target = resolvePostLoginHref("owner", {
      cookieHeader: typeof document !== "undefined" ? document.cookie : null,
      isPhone,
    });

    // Replace only when wrong — re-runs are no-ops once on the preferred root,
    // so logo/nav can still re-enter the other root and get steered again.
    if (target !== pathname) {
      router.replace(target as Route);
    }
  }, [pathname, router]);

  return null;
}
