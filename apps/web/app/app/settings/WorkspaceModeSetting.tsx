"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The workspace-mode selector (TASK-058). Replaces the old daily popup + top
// toggle: workspace defaults to the device (phone → Field, tablet/computer →
// Office) and is overridden only here.

const COOKIE_MODE = "dv_ws_mode";
type Choice = "auto" | "field" | "office";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
function clearCookie(name: string) {
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

const OPTIONS: { key: Choice; label: string; desc: string }[] = [
  { key: "auto", label: "Auto (by device)", desc: "Phone → Field · Tablet/computer → Office" },
  { key: "field", label: "Field", desc: "Always do the work — My Day, visits, mileage" },
  { key: "office", label: "Office", desc: "Always run the business — dashboard, money, schedule" },
];

export function WorkspaceModeSetting() {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>("auto");

  useEffect(() => {
    const c = readCookie(COOKIE_MODE);
    setChoice(c === "field" || c === "office" ? c : "auto");
  }, []);

  function pick(next: Choice) {
    setChoice(next);
    if (next === "auto") clearCookie(COOKIE_MODE);
    else writeCookie(COOKIE_MODE, next);
    if (next === "field") router.push("/app/my-work");
    else if (next === "office") router.push("/app");
    else router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {OPTIONS.map((o) => {
        const on = choice === o.key;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            aria-pressed={on}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 2,
              textAlign: "left",
              padding: "var(--space-3)",
              borderRadius: "var(--radius-md)",
              border: `1px solid ${on ? "var(--color-green-600, #16a34a)" : "var(--border)"}`,
              background: on ? "var(--color-green-50, #f0fdf4)" : "var(--surface, #fff)",
              cursor: "pointer",
            }}
          >
            <strong style={{ fontSize: "var(--text-sm)" }}>
              {on ? "✓ " : ""}
              {o.label}
            </strong>
            <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>{o.desc}</span>
          </button>
        );
      })}
    </div>
  );
}
