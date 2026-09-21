"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Suggestion = { entity_type: string; entity_id: string; label: string };

export function TagClaimControl({
  sessionId,
  date,
}: {
  sessionId: string;
  date: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [jobs, setJobs] = useState<Suggestion[]>([]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch(`/api/v1/sessions/suggestions?date=${date}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setJobs(json.data?.jobs ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, date]);

  async function tag(job: Suggestion) {
    setPending(true);
    try {
      const res = await fetch(`/api/v1/sessions/${sessionId}/activities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "job",
          entity_id: job.entity_id,
          label: job.label,
        }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        className="p7-btn p7-btn-ghost p7-btn-sm"
        onClick={() => setOpen((v) => !v)}
        data-testid="tag-claim-toggle"
      >
        Tag job
      </button>
      {open ? (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {jobs.length === 0 ? (
            <span style={{ color: "var(--fg-muted)", fontSize: "var(--text-xs)" }}>
              No jobs on this day. Open a visit or pick from Jobs.
            </span>
          ) : (
            jobs.map((j) => (
              <button
                key={j.entity_id}
                type="button"
                className="p7-btn p7-btn-secondary p7-btn-sm"
                disabled={pending}
                onClick={() => void tag(j)}
              >
                {j.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
