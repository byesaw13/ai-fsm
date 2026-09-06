"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { QuickBookModal } from "./QuickBookModal";
import { QUICK_JOB_SUCCESS_HREF } from "@/lib/jobs/quick-book";

export function QuickBookButton({
  children,
  className,
  style,
  testId = "quick-job-launch",
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        className={className}
        style={{ ...style, cursor: "pointer" }}
        data-testid={testId}
        onClick={() => setOpen(true)}
      >
        {children}
      </button>
      {open && (
        <QuickBookModal
          initialDate={today}
          startNow
          successHref={QUICK_JOB_SUCCESS_HREF}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
