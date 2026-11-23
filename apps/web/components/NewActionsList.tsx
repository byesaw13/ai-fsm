"use client";

import Link from "next/link";
import type { Route } from "next";
import { useState, type CSSProperties, type ReactNode } from "react";
import { CAPTURE_HREF, CaptureLink } from "./CaptureLink";
import { QuickBookButton } from "./jobs/QuickBookButton";
import {
  NEW_ACTIONS,
  NEW_MORE_ACTIONS,
  newActionHref,
  type QuickAction,
} from "@/lib/navigation/quick-actions";

/**
 * The New choices (TASK-236), rendered the same everywhere: three plain
 * choices, then a More row for the rarer starts.
 *
 * `onQuickJob` lets a parent that unmounts this list on pick (the + sheet,
 * the sidebar menu) own the quick-job form; without it the list opens the form
 * itself.
 */
export function NewActionsList({
  itemStyle,
  currentJobId = null,
  onPick,
  onQuickJob,
}: {
  itemStyle: CSSProperties;
  currentJobId?: string | null;
  onPick?: () => void;
  onQuickJob?: () => void;
}) {
  const [showMore, setShowMore] = useState(false);

  const render = (action: QuickAction): ReactNode => {
    const inner = (
      <>
        <span style={{ fontSize: "var(--text-lg)" }} aria-hidden="true">
          {action.icon}
        </span>
        <span>{action.label}</span>
      </>
    );
    if (action.action === "quick-book") {
      return onQuickJob ? (
        <button
          key={action.label}
          type="button"
          data-testid="new-quick-job"
          style={{ ...itemStyle, cursor: "pointer" }}
          onClick={onQuickJob}
        >
          {inner}
        </button>
      ) : (
        <QuickBookButton key={action.label} style={itemStyle} testId="new-quick-job">
          {inner}
        </QuickBookButton>
      );
    }
    if (action.href === CAPTURE_HREF) {
      return (
        <CaptureLink key={action.label} onClick={onPick} style={itemStyle} data-testid="new-capture">
          {inner}
        </CaptureLink>
      );
    }
    return (
      <Link
        key={action.label}
        href={newActionHref(action, currentJobId) as Route}
        onClick={onPick}
        style={itemStyle}
      >
        {inner}
      </Link>
    );
  };

  return (
    <>
      {NEW_ACTIONS.map(render)}
      {showMore ? (
        NEW_MORE_ACTIONS.map(render)
      ) : (
        <button
          type="button"
          data-testid="new-more"
          onClick={() => setShowMore(true)}
          style={{ ...itemStyle, cursor: "pointer", color: "var(--fg-muted)", fontWeight: 500 }}
        >
          <span aria-hidden="true">⋯</span>
          <span>More</span>
        </button>
      )}
    </>
  );
}
