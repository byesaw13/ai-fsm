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
