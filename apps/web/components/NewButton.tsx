"use client";

import { useState, type CSSProperties } from "react";
import { QuickBookModal } from "./jobs/QuickBookModal";
import { NewActionsList } from "./NewActionsList";
import { QUICK_JOB_SUCCESS_HREF } from "@/lib/jobs/quick-book";

const SHEET_ITEM: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "var(--space-3)",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-full)",
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
  color: "var(--fg)",
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const MENU_ITEM: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  width: "100%",
  padding: "8px 12px",
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--fg)",
  fontSize: 13,
  fontWeight: 600,
  textAlign: "left",
  textDecoration: "none",
};

/**
 * The one New button (TASK-236). `fab` is the phone + button (CSS-gated to
 * phones by .p7-fab-wrap); `sidebar` is the desktop sidebar button. Both open
 * the same choices from NewActionsList.
 */
export function NewButton({ placement }: { placement: "fab" | "sidebar" }) {
  const [open, setOpen] = useState(false);
  const [quickJobOpen, setQuickJobOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const list = (itemStyle: CSSProperties) => (
    <NewActionsList
      itemStyle={itemStyle}
      onPick={() => setOpen(false)}
      onQuickJob={() => {
        setOpen(false);
        setQuickJobOpen(true);
      }}
    />
  );

  const backdrop = open && (
    <button
      type="button"
      aria-label="Close New"
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: placement === "fab" ? "rgba(0,0,0,0.35)" : "transparent",
        border: "none",
        cursor: "pointer",
        zIndex: 399,
      }}
    />
  );

  const quickJob = quickJobOpen && (
    <QuickBookModal
      initialDate={today}
      startNow
      assignSelf
      successHref={QUICK_JOB_SUCCESS_HREF}
      onClose={() => setQuickJobOpen(false)}
    />
  );

  if (placement === "sidebar") {
    return (
      <div style={{ position: "relative" }}>
        <button
          type="button"
          data-testid="new-button-sidebar"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
            padding: "8px 12px",
            margin: "4px 0 8px",
            borderRadius: 6,
            border: "1px solid var(--accent, #0f172a)",
            background: "var(--accent, #0f172a)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 16 }} aria-hidden="true">+</span>
          New
        </button>
        {backdrop}
        {open && (
          <div
            role="menu"
            data-testid="new-menu-sidebar"
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              right: 0,
              minWidth: 220,
              zIndex: 400,
              padding: 4,
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15))",
            }}
          >
            {list(MENU_ITEM)}
          </div>
        )}
        {quickJob}
      </div>
    );
  }

  return (
    <>
      <div className="p7-fab-wrap">
        {backdrop}
        {open && (
          <div
            data-testid="new-menu-fab"
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
            {list(SHEET_ITEM)}
          </div>
        )}
        <button
          type="button"
          data-testid="new-button-fab"
          aria-label={open ? "Close New" : "New"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            position: "fixed",
            bottom: "calc(72px + env(safe-area-inset-bottom))",
            right: "var(--space-4)",
            zIndex: 402,
            width: 56,
            height: 56,
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
      {quickJob}
    </>
  );
}
