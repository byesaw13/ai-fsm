"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkspaceMode } from "@/components/AppShell";

const OPTIONS: { mode: WorkspaceMode; label: string; description: string }[] = [
  {
    mode: "mobile",
    label: "Mobile Workspace",
    description: "Optimized for field work — visits, jobs, invoices, inbox.",
  },
  {
    mode: "desktop",
    label: "Desktop Workspace",
    description: "Full business management with all dashboards and tools.",
  },
  {
    mode: "auto",
    label: "Auto",
    description: "Switches automatically based on your screen size.",
  },
];

interface Props {
  currentMode: WorkspaceMode;
}

export function WorkspaceSwitcher({ currentMode }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<WorkspaceMode>(currentMode);
  const [pending, setPending] = useState(false);

  async function handleSelect(mode: WorkspaceMode) {
    if (mode === selected || pending) return;
    setSelected(mode);
    setPending(true);
    try {
      await fetch("/api/v1/workspace-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      {OPTIONS.map((opt) => {
        const active = selected === opt.mode;
        return (
          <button
            key={opt.mode}
            type="button"
            onClick={() => handleSelect(opt.mode)}
            disabled={pending}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-3)",
              padding: "var(--space-3) var(--space-4)",
              background: active ? "var(--color-indigo-50, #eef2ff)" : "var(--bg-card)",
              border: `1.5px solid ${active ? "var(--accent)" : "var(--border)"}`,
              borderRadius: "var(--radius-md, 8px)",
              cursor: pending ? "wait" : "pointer",
              textAlign: "left",
              width: "100%",
              opacity: pending ? 0.75 : 1,
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            {/* Radio indicator */}
            <span
              style={{
                marginTop: 2,
                flexShrink: 0,
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `2px solid ${active ? "var(--accent)" : "var(--border)"}`,
                background: active ? "var(--accent)" : "transparent",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-hidden="true"
            >
              {active && (
                <span
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }}
                />
              )}
            </span>
            <span>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  color: active ? "var(--accent)" : "var(--fg)",
                  marginBottom: 2,
                }}
              >
                {opt.label}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--text-xs)",
                  color: "var(--fg-muted)",
                  lineHeight: 1.5,
                }}
              >
                {opt.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
