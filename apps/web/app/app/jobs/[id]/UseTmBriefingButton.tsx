"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";
import {
  TM_BRIEFING_STORAGE_KEY,
  tmEstimateHref,
} from "@/lib/estimates/job-tm-briefing";

interface UseTmBriefingButtonProps {
  jobId: string;
  clientId: string | null;
  briefing: string;
  /** primary | secondary visual weight */
  variant?: "primary" | "secondary";
  label?: string;
  /** When true, open T&M flow and auto-run generate */
  autoGenerate?: boolean;
  className?: string;
  size?: "sm" | "default" | "lg";
}

/**
 * One-click: stash job briefing (if any extra client-side paste was needed
 * later) and open the T&M estimate entry path. Server also reloads job notes
 * for the same job_id, so the sessionStorage write is a belt-and-suspenders
 * prefill for the textarea before the generate call.
 */
export function UseTmBriefingButton({
  jobId,
  clientId,
  briefing,
  variant = "secondary",
  label = "Estimate from notes (T&M)",
  autoGenerate = true,
  className,
  size = "default",
}: UseTmBriefingButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  function handleClick() {
    if (pending) return;
    setPending(true);
    try {
      if (briefing.trim()) {
        window.sessionStorage.setItem(TM_BRIEFING_STORAGE_KEY, briefing.trim());
      }
    } catch {
      /* private mode / quota — server-side job prefill still works */
    }
    router.push(
      tmEstimateHref({ jobId, clientId, autoGenerate }) as Parameters<
        typeof router.push
      >[0]
    );
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      loading={pending}
      onClick={handleClick}
      className={className}
      data-testid="use-tm-briefing-button"
      disabled={!briefing.trim()}
      title={
        briefing.trim()
          ? "Open T&M estimate with this job’s notes prefilled"
          : "Add a job description or notes first"
      }
    >
      {label}
    </Button>
  );
}
