"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Workspace mode = which landing surface the owner uses: Office (/app, run the
// business) or Field (/app/my-day, do the work). Default is AUTOMATIC by device —
// phones open to Field, tablets/computers open to Office — with an explicit
// override saved from Settings (cookie dv_ws_mode). No popup, no on-screen toggle
// (TASK-058). This component renders nothing; it only steers the office root.

const COOKIE_MODE = "dv_ws_mode";
const OFFICE_ROOT = "/app";
const FIELD_ROOT = "/app/my-work";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

export function WorkspaceAutoRoute() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    // Steer BOTH workspace roots on entry (login lands everyone on /app/my-day,
    // so steering only the office root would never fire for desktop owners).
    // Other pages are left alone — never fight intentional navigation.
    const onOffice = pathname === OFFICE_ROOT;
    const onField = pathname === FIELD_ROOT;
    if (!onOffice && !onField) return;
    const explicit = readCookie(COOKIE_MODE); // 'field' | 'office' | null (auto)
    const isPhone =
      typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
    const mode =
      explicit === "field" || explicit === "office" ? explicit : isPhone ? "field" : "office";
    if (mode === "field" && onOffice) router.replace(FIELD_ROOT);
    else if (mode === "office" && onField) router.replace(OFFICE_ROOT);
  }, [pathname, router]);

  return null;
}
