"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** TASK-163: take a job off the reports-to-send list. */
export function SkipReportButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function skip() {
    setBusy(true);
    setFailed(false);
    const res = await fetch(`/api/v1/jobs/${jobId}/customer-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "skip" }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) router.refresh();
    else setFailed(true);
  }

  return (
    <button type="button" className="p7-btn p7-btn-sm" disabled={busy} onClick={skip} title="Don't send a report for this job">
      {busy ? "Skipping…" : failed ? "Try again" : "Skip"}
    </button>
  );
}
