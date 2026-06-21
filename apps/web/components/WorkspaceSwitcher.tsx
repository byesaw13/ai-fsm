"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";

// EPIC-006 Phase 5: the owner wears two hats — "run the business" (Office) and
// "do the work" (Field). This control lets them pick a mode for the day and
// flip between them at will. Office = the dashboard (/app); Field = My Day.
//
// Mode is derived from the route the owner is on, so the toggle always reflects
// reality. A cookie records the choice for the day so we only prompt once.

type Mode = "office" | "field";

const COOKIE_MODE = "dv_ws_mode";
const COOKIE_DAY = "dv_ws_day";
const OFFICE_HREF = "/app" as Route;
const FIELD_HREF = "/app/my-day" as Route;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  // 14-day persistence is plenty; the daily prompt re-confirms intent anyway.
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 14}; samesite=lax`;
}

export function WorkspaceSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const currentMode: Mode = pathname.startsWith(FIELD_HREF) ? "field" : "office";
  const [showPrompt, setShowPrompt] = useState(false);

  // Prompt once per day, the first time the owner lands in the app.
  useEffect(() => {
    if (readCookie(COOKIE_DAY) !== todayKey()) {
      setShowPrompt(true);
    }
  }, []);

  function choose(mode: Mode, navigate: boolean) {
    writeCookie(COOKIE_MODE, mode);
    writeCookie(COOKIE_DAY, todayKey());
    setShowPrompt(false);
    if (navigate && mode !== currentMode) {
      router.push(mode === "field" ? FIELD_HREF : OFFICE_HREF);
    }
  }

  return (
    <>
      <div className="dv-ws-bar" role="group" aria-label="Workspace mode">
        <span className="dv-ws-label">Workspace</span>
        <div className="dv-ws-toggle">
          <button
            type="button"
            className={`dv-ws-opt ${currentMode === "office" ? "dv-ws-on" : ""}`}
            aria-pressed={currentMode === "office"}
            onClick={() => choose("office", true)}
          >
            Office
          </button>
          <button
            type="button"
            className={`dv-ws-opt ${currentMode === "field" ? "dv-ws-on" : ""}`}
            aria-pressed={currentMode === "field"}
            onClick={() => choose("field", true)}
          >
            Field
          </button>
        </div>
      </div>

      {showPrompt && (
        <div className="dv-ws-overlay" role="dialog" aria-modal="true" aria-label="Choose your workspace">
          <div className="dv-ws-card">
            <h2 className="dv-ws-title">Where are you working today?</h2>
            <p className="dv-ws-sub">You can switch anytime from the toggle up top.</p>
            <div className="dv-ws-choices">
              <button type="button" className="dv-ws-choice" onClick={() => choose("field", true)}>
                <span className="dv-ws-choice-emoji" aria-hidden="true">🛠️</span>
                <span className="dv-ws-choice-title">Field</span>
                <span className="dv-ws-choice-desc">Do the work — My Day, visits, mileage</span>
              </button>
              <button type="button" className="dv-ws-choice" onClick={() => choose("office", true)}>
                <span className="dv-ws-choice-emoji" aria-hidden="true">📊</span>
                <span className="dv-ws-choice-title">Office</span>
                <span className="dv-ws-choice-desc">Run the business — dashboard, money, schedule</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
