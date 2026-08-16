"use client";

import Link from "next/link";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatBadgeCount } from "@/lib/attention/counts";
import { placeAttentionPanel } from "./place-panel";

export type AttentionSummary = {
  requestsCount: number;
  invoicesCount: number;
  estimatesCount: number;
  unreadEventCount: number;
};

type AttentionEvent = {
  id: string;
  type: string;
  title: string;
  summary: string | null;
  href: string;
  created_at: string;
  read_at: string | null;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function useAttentionSummary(enabled: boolean) {
  const [summary, setSummary] = useState<AttentionSummary>({
    requestsCount: 0,
    invoicesCount: 0,
    estimatesCount: 0,
    unreadEventCount: 0,
  });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch("/api/v1/attention/summary", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.data) setSummary(json.data as AttentionSummary);
    } catch {
      // ignore poll errors
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 50_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, [enabled, refresh]);

  return { summary, refresh, setSummary };
}

export function AttentionBell({
  summary,
  onChanged,
}: {
  summary: AttentionSummary;
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AttentionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [box, setBox] = useState<ReturnType<typeof placeAttentionPanel> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const badge = formatBadgeCount(summary.unreadEventCount);

  const place = useCallback(() => {
    const el = buttonRef.current;
    if (!el) return;
    setBox(
      placeAttentionPanel(el.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      }),
    );
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/attention/events?limit=30", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = await res.json();
      setEvents((json?.data ?? []) as AttentionEvent[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadEvents();
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, loadEvents, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function markOne(id: string) {
    await fetch(`/api/v1/attention/events/${id}/read`, {
      method: "POST",
      credentials: "same-origin",
    });
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, read_at: e.read_at ?? new Date().toISOString() } : e)),
    );
    onChanged?.();
  }

  async function markAll() {
    await fetch("/api/v1/attention/events/read-all", {
      method: "POST",
      credentials: "same-origin",
    });
    setEvents((prev) =>
      prev.map((e) => ({ ...e, read_at: e.read_at ?? new Date().toISOString() })),
    );
    onChanged?.();
  }

  return (
    <div ref={panelRef} style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) place();
            return next;
          });
        }}
        aria-expanded={open}
        aria-label={badge ? `${badge} unread notifications` : "Notifications"}
        data-testid="attention-bell"
        style={{
          position: "relative",
          width: 36,
          height: 36,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--bg-elevated, var(--bg))",
          color: "var(--fg)",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge && (
          <span
            data-testid="attention-bell-count"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 999,
              background: "#dc2626",
              color: "#fff",
              fontSize: 10,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </button>

      {open && box && (
        <div
          data-testid="attention-bell-panel"
          style={{
            position: "fixed",
            left: box.left,
            top: box.top,
            width: box.width,
            maxHeight: box.maxHeight,
            overflow: "auto",
            background: "var(--bg-elevated, #fff)",
            color: "var(--fg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-lg)",
            zIndex: "var(--z-modal)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 14px",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: 14,
              position: "sticky",
              top: 0,
              background: "var(--bg-elevated, #fff)",
            }}
          >
            <span>Recent activity</span>
            {summary.unreadEventCount > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                style={{
                  border: "none",
                  background: "none",
                  color: "var(--color-success, #166534)",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {loading && (
            <div style={{ padding: 16, fontSize: 13, color: "var(--fg-muted)" }}>Loading…</div>
          )}
          {!loading && events.length === 0 && (
            <div style={{ padding: 16, fontSize: 13, color: "var(--fg-muted)" }}>
              Nothing new in the last 90 days.
            </div>
          )}
          {!loading &&
            events.map((e) => {
              const unread = !e.read_at;
              return (
                <Link
                  key={e.id}
                  href={e.href as Route}
                  onClick={() => {
                    if (unread) void markOne(e.id);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    padding: "10px 14px",
                    borderBottom: "1px solid var(--border)",
                    textDecoration: "none",
                    color: "inherit",
                    background: unread
                      ? "color-mix(in srgb, var(--color-success, #16a34a) 8%, transparent)"
                      : "transparent",
                    opacity: unread ? 1 : 0.72,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500 }}>{e.title}</div>
                  {(e.summary || e.created_at) && (
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                      {[e.summary, relativeTime(String(e.created_at))].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </Link>
              );
            })}
        </div>
      )}
    </div>
  );
}

export function NavCountBadge({ count }: { count: number }) {
  const label = formatBadgeCount(count);
  if (!label) return null;
  return (
    <span
      data-testid="nav-count-badge"
      style={{
        marginLeft: "auto",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 999,
        background: "#dc2626",
        color: "#fff",
        fontSize: 11,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}
