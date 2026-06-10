"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

interface QuickAction {
  href: string;
  label: string;
  emoji: string;
}

const ACTIONS: QuickAction[] = [
  { href: "/app/estimates/quick", label: "Quick Estimate", emoji: "⚡" },
  { href: "/app/jobs/new",        label: "New Job",        emoji: "🧰" },
  { href: "/app/intake/new",      label: "New Request",    emoji: "📋" },
  { href: "/app/expenses/new?mode=run", label: "Material Run", emoji: "🧾" },
  { href: "/app/mileage/new",     label: "Log Mileage",    emoji: "🚗" },
];

/**
 * Persistent floating action button for Mobile Workspace.
 * Tapping the + opens a small sheet of the most common field actions.
 * Rendered only on mobile screens (CSS-gated by .p7-fab-wrap).
 */
export function FloatingActionButton() {
  const [open, setOpen] = useState(false);

  return (
    <div className="p7-fab-wrap">
      {/* Backdrop */}
      {open && (
        <button
          type="button"
          aria-label="Close quick actions"
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)",
            border: "none", cursor: "pointer", zIndex: 399,
          }}
        />
      )}

      {/* Action sheet */}
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "calc(76px + env(safe-area-inset-bottom))",
            right: "var(--space-4)",
            zIndex: 401,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            alignItems: "flex-end",
          }}
        >
          {ACTIONS.map((action) => (
            <Link
              key={action.href}
              href={action.href as Route}
              onClick={() => setOpen(false)}
              style={{
                display: "inline-flex", alignItems: "center", gap: "var(--space-3)",
                padding: "var(--space-3) var(--space-4)", borderRadius: "var(--radius-full)",
                background: "var(--bg-card)", border: "1px solid var(--border)",
                boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
                color: "var(--fg)", fontWeight: 600, fontSize: "var(--text-sm)",
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              <span style={{ fontSize: "var(--text-lg)" }}>{action.emoji}</span>
              {action.label}
            </Link>
          ))}
        </div>
      )}

      {/* The + button */}
      <button
        type="button"
        aria-label={open ? "Close quick actions" : "Open quick actions"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "fixed",
          bottom: "calc(72px + env(safe-area-inset-bottom))",
          right: "var(--space-4)",
          zIndex: 402,
          width: 56, height: 56,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          fontSize: 28,
          lineHeight: 1,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.15s",
          transform: open ? "rotate(45deg)" : "none",
        }}
      >
        +
      </button>
    </div>
  );
}
