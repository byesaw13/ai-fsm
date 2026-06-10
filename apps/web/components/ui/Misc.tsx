"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";

// ---------------------------------------------------------------------------
// Tabs — horizontal tab bar with optional count badges
// ---------------------------------------------------------------------------

export interface TabDef {
  key: string;
  label: string;
  count?: number;
  href?: Route;
}

interface TabsProps {
  tabs: TabDef[];
  activeKey: string;
  onTabChange?: (key: string) => void;
  compact?: boolean;
  "data-testid"?: string;
}

export function Tabs({ tabs, activeKey, onTabChange, compact, "data-testid": testId }: TabsProps) {
  return (
    <div
      className="p7-tabs"
      data-testid={testId}
      role="tablist"
      style={{ display: "flex", gap: compact ? "0" : "var(--space-1)", borderBottom: compact ? undefined : "1px solid var(--border)" }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeKey;
        const content = (
          <button
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange?.(tab.key)}
            className={`p7-tab ${isActive ? "p7-tab-active" : ""} ${compact ? "p7-tab-compact" : ""}`}
            data-testid={`tab-${tab.key}`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && tab.count > 0 && (
              <span className="p7-tab-count">{tab.count}</span>
            )}
          </button>
        );

        if (tab.href && !onTabChange) {
          return (
            <Link key={tab.key} href={tab.href} style={{ textDecoration: "none" }}>
              {content}
            </Link>
          );
        }

        return <span key={tab.key}>{content}</span>;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Breadcrumbs — hierarchical navigation trail
// ---------------------------------------------------------------------------

interface BreadcrumbItem {
  label: string;
  href?: Route;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav className="p7-breadcrumbs" aria-label="Breadcrumb">
      <ol style={{ display: "flex", alignItems: "center", gap: "var(--space-1)", padding: 0, margin: "0 0 var(--space-4)", listStyle: "none", fontSize: "var(--text-sm)" }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            {i > 0 && (
              <span style={{ color: "var(--fg-muted)" }}>/</span>
            )}
            {item.href && i < items.length - 1 ? (
              <Link href={item.href} style={{ color: "var(--fg-muted)", textDecoration: "none" }}>
                {item.label}
              </Link>
            ) : (
              <span style={{ color: i < items.length - 1 ? "var(--fg-muted)" : "var(--fg)", fontWeight: i === items.length - 1 ? "var(--font-semibold)" : "var(--font-normal)" }}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Avatar — user initials or image
// ---------------------------------------------------------------------------

interface AvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  color?: string;
}

const AVATAR_COLORS = [
  "var(--color-forest-700)",
  "var(--color-blue-500)",
  "var(--color-green-500)",
  "var(--color-amber-500)",
  "var(--color-violet-600)",
  "var(--color-rose-600)",
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getColorIndex(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return Math.abs(hash) % AVATAR_COLORS.length;
}

const SIZE_MAP = {
  sm: { width: 28, height: 28, fontSize: "var(--text-xs)" },
  md: { width: 36, height: 36, fontSize: "var(--text-sm)" },
  lg: { width: 48, height: 48, fontSize: "var(--text-base)" },
};

export function Avatar({ name, size = "md", color }: AvatarProps) {
  const s = SIZE_MAP[size];
  const bg = color ?? AVATAR_COLORS[getColorIndex(name)];

  return (
    <span
      className="p7-avatar"
      style={{
        width: s.width,
        height: s.height,
        borderRadius: "var(--radius-full)",
        background: bg,
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: s.fontSize,
        fontWeight: "var(--font-bold)",
        flexShrink: 0,
        userSelect: "none",
      }}
      title={name}
    >
      {getInitials(name)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ProgressBar — horizontal progress indicator
// ---------------------------------------------------------------------------

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  color?: string;
  showValue?: boolean;
}

export function ProgressBar({ value, max = 100, label, color, showValue }: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const barColor = color ?? "var(--accent)";

  return (
    <div className="p7-progress-bar" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-1)", fontSize: "var(--text-xs)" }}>
          <span style={{ color: "var(--fg-muted)" }}>{label}</span>
          {showValue && <span style={{ fontWeight: "var(--font-semibold)", color: "var(--fg)" }}>{Math.round(pct)}%</span>}
        </div>
      )}
      <div style={{ height: 6, background: "var(--color-slate-100)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: barColor,
            borderRadius: "var(--radius-full)",
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}
