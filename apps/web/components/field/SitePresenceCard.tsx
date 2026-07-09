"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { Button, Card, Modal, SectionHeader, useToast } from "@/components/ui";
import type { FieldSiteContext, LikelySiteCustomer } from "@/lib/field/site-context";

function formatElapsed(startedAt: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function sourceLabel(source: LikelySiteCustomer["source"]): string {
  switch (source) {
    case "location":
      return "GPS stop confirmed at address";
    case "activity":
      return "On-site timer";
  }
}

export function SitePresenceCard() {
  const router = useRouter();
  const toast = useToast();
  const [ctx, setCtx] = useState<FieldSiteContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [leaveSummary, setLeaveSummary] = useState<{
    durationMinutes: number;
    clientName: string | null;
    propertyAddress: string | null;
    jobId: string | null;
    visitId: string | null;
    suggestEstimate: boolean;
  } | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/field/site-context");
      const data = (await res.json()) as { data?: FieldSiteContext };
      setCtx(data.data ?? null);
    } catch {
      setCtx(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (ctx?.activeSiteSession) setTick((t) => t + 1);
  }, [ctx?.activeSiteSession, tick]);

  async function startTimer() {
    if (!ctx?.likely) {
      toast.error("No customer detected — use “I'm at customer site” to pick one");
      return;
    }
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        activity_type: ctx.likely.visitId ? "estimate_visit" : "job_work",
        source: "manual",
      };
      if (ctx.likely.visitId) {
        body.entity_type = "visit";
        body.entity_id = ctx.likely.visitId;
      } else if (ctx.likely.jobId) {
        body.entity_type = "job";
        body.entity_id = ctx.likely.jobId;
      }
      const res = await fetch("/api/v1/activities/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error((j as { error?: { message?: string } }).error?.message ?? "Could not start timer");
        return;
      }
      toast.success("Site timer started");
      await refresh();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function leaveSite() {
    setPending(true);
    try {
      const res = await fetch("/api/v1/field/end-site-timer", { method: "POST" });
      const data = (await res.json()) as {
        data?: typeof leaveSummary;
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.error(data.error?.message ?? "No site timer running");
        return;
      }
      setLeaveSummary(data.data ?? null);
      await refresh();
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (loading) return null;

  const likely = ctx?.likely;
  const session = ctx?.activeSiteSession;
  const confirmed = ctx?.confirmedStop;
  const showCard = !!session || !!confirmed;
  if (!showCard) return null;

  return (
    <>
      <Card style={{ marginBottom: "var(--space-4)" }} data-testid="site-presence-card">
        <SectionHeader title="At customer site" />
        {session ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>
                {session.clientName ?? "On site"}
              </div>
              {session.propertyAddress && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  {session.propertyAddress}
                </div>
              )}
              <div style={{ fontSize: "var(--text-sm)", color: "var(--accent)", marginTop: 4 }}>
                Timer: {formatElapsed(session.startedAt)}
              </div>
            </div>
            <Button variant="primary" onClick={() => void leaveSite()} loading={pending} data-testid="leave-site-button">
              Leaving site — stop timer
            </Button>
          </div>
        ) : likely ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Likely customer · {sourceLabel(likely.source)}
                {likely.confidence < 100 ? ` (${likely.confidence}% match)` : ""}
              </div>
              <div style={{ fontWeight: 700, fontSize: "var(--text-base)", marginTop: 4 }}>
                {likely.clientName}
              </div>
              {likely.propertyAddress && (
                <div style={{ fontSize: "var(--text-sm)", color: "var(--fg-muted)" }}>
                  {likely.propertyAddress}
                </div>
              )}
              {ctx?.openStopMinutes != null && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 4 }}>
                  GPS stop: ~{ctx.openStopMinutes} min
                  {likely.distanceMeters != null ? ` · ${likely.distanceMeters}m from pin` : ""}
                </div>
              )}
              {confirmed?.travelBefore && (
                <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 4 }}>
                  Travel to site: ~{confirmed.travelBefore.durationMinutes} min
                </div>
              )}
            </div>
            <Button variant="primary" onClick={() => void startTimer()} loading={pending} data-testid="start-site-timer">
              Start site timer
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        open={!!leaveSummary}
        onClose={() => setLeaveSummary(null)}
        title="Left customer site"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveSummary(null)}>
              Done
            </Button>
            {leaveSummary?.suggestEstimate && leaveSummary.jobId && (
              <Link
                href={`/app/estimates/new?job_id=${leaveSummary.jobId}` as Route}
                className="p7-btn p7-btn-primary"
                style={{ textDecoration: "none" }}
              >
                Create estimate
              </Link>
            )}
          </>
        }
      >
        {leaveSummary && (
          <div style={{ fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 var(--space-2)" }}>
              <strong>{leaveSummary.clientName ?? "Customer"}</strong>
              {leaveSummary.propertyAddress ? ` · ${leaveSummary.propertyAddress}` : ""}
            </p>
            <p style={{ margin: 0 }}>
              Time on site: <strong>{leaveSummary.durationMinutes} minutes</strong> (logged to your activity timeline).
            </p>
            {leaveSummary.suggestEstimate && (
              <p style={{ margin: "var(--space-2) 0 0", color: "var(--fg-muted)" }}>
                No estimate on this job yet — create one while the walkthrough is fresh.
              </p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}