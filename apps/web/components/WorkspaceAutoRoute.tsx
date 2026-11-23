"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import {
  HOME_ENTRY_PARAM,
  resolvePostLoginHref,
  shouldSteerToPreferredHome,
} from "@/lib/auth/post-login-destination";

// Workspace mode = which landing surface the owner uses: Office (/app, run the
// business) or Field (/app/my-work, do the work). Default is AUTOMATIC by device —
// phones open to Field, tablets/computers open to Office — with an explicit
// override saved from Settings (cookie dv_ws_mode) (TASK-058).
//
// TASK-238: it steers only when the app opens (first page of this browser
// session) or from the logo (?home=1). A tap on Desk or Today in the menu stays
// where it was tapped. Renders nothing.

const SESSION_KEY = "dv_ws_steered";

function takeFirstInSession(): boolean {
  try {
    const first = window.sessionStorage.getItem(SESSION_KEY) !== "1";
    window.sessionStorage.setItem(SESSION_KEY, "1");
    return first;
  } catch {
    // No storage (private mode): behave as if already steered, so taps stay put.
    return false;
  }
}

export function WorkspaceAutoRoute() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const firstInSession = takeFirstInSession();
    const homeEntry = new URLSearchParams(window.location.search).get(HOME_ENTRY_PARAM) === "1";
    if (!shouldSteerToPreferredHome({ pathname, firstInSession, homeEntry })) return;

    const target = resolvePostLoginHref("owner", {
      cookieHeader: document.cookie,
      isPhone: window.matchMedia("(max-width: 767px)").matches,
    });
    // Replace even when already there, so ?home=1 leaves the address bar.
    if (target !== pathname || homeEntry) router.replace(target as Route);
  }, [pathname, router]);

  return null;
}
