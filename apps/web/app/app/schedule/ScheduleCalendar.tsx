"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { QuickBookModal } from "./QuickBookModal";

export interface VisitRow {
  id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  job_title: string;
  client_name: string | null;
  property_address: string | null;
  tech_name: string | null;
  assigned_user_id: string | null;
  [key: string]: unknown;
}

export type ViewMode = "week" | "month" | "year";

interface Props {
  visits: VisitRow[];
  view: ViewMode;
  rangeStart: string; // YYYY-MM-DD
  isAdmin: boolean;
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: "#2563eb",
  arrived: "#d97706",
  in_progress: "#16a34a",
  completed: "#6b7280",
  cancelled: "#dc2626",
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getWeekStartFromStr(dateStr: string): Date {
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatTimeRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  return `${s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${e.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function computeNewSchedule(origStart: string, origEnd: string, targetDate: string) {
  const s = new Date(origStart);
  const durationMs = new Date(origEnd).getTime() - s.getTime();
  const [y, m, d] = targetDate.split("-").map(Number);
  const newStart = new Date(y, m - 1, d, s.getHours(), s.getMinutes(), 0, 0);
  return {
    start: newStart.toISOString(),
    end: new Date(newStart.getTime() + durationMs).toISOString(),
  };
}

function groupByDate(visits: VisitRow[]): Map<string, VisitRow[]> {
  const map = new Map<string, VisitRow[]>();
  for (const v of visits) {
    const key = toDateStr(new Date(v.scheduled_start));
    const arr = map.get(key) ?? [];
    arr.push(v);
    map.set(key, arr);
  }
  return map;
}

function getMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month - 1, 1);
  const startPad = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array<null>(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function weekUrl(date: Date) { return `/app/schedule?view=week&week=${toDateStr(date)}`; }
function monthUrl(year: number, month: number) { return `/app/schedule?view=month&month=${year}-${String(month).padStart(2, "0")}`; }
function yearUrl(year: number) { return `/app/schedule?view=year&year=${year}`; }

// ── Sub-components ────────────────────────────────────────────────────────────

interface VisitCardProps {
  visit: VisitRow;
  isAdmin: boolean;
  isDragging: boolean;
  compact?: boolean;
  onDragStart: (e: React.DragEvent, visit: VisitRow) => void;
  onDragEnd: () => void;
}

function VisitCard({ visit, isAdmin, isDragging, compact = false, onDragStart, onDragEnd }: VisitCardProps) {
  const color = STATUS_COLOR[visit.status] ?? "#6b7280";
  return (
    <a
      href={`/app/visits/${visit.id}`}
      draggable={isAdmin}
      onDragStart={(e) => onDragStart(e, visit)}
      onDragEnd={onDragEnd}
      style={{
        textDecoration: "none",
        display: "block",
        borderLeft: `3px solid ${color}`,
        background: "#fff",
        border: `1px solid var(--border)`,
        borderLeftColor: color,
        borderLeftWidth: 3,
        borderRadius: 6,
        padding: compact ? "2px 6px" : "var(--space-2)",
        cursor: isAdmin ? "grab" : "pointer",
        opacity: isDragging ? 0.4 : 1,
        transition: "opacity 0.15s",
      }}
    >
      <div style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {visit.job_title}
      </div>
      {!compact && visit.client_name && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {visit.client_name}
        </div>
      )}
      <div style={{ fontSize: "var(--text-xs)", color, fontWeight: 500, marginTop: 1 }}>
        {formatTimeRange(visit.scheduled_start, visit.scheduled_end)}
      </div>
      {!compact && visit.tech_name && (
        <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", marginTop: 1 }}>
          {visit.tech_name}
        </div>
      )}
    </a>
  );
}

interface DayCellProps {
  dateStr: string;
  isDropTarget: boolean;
  isDragging: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
  onDragOver: (e: React.DragEvent, dateStr: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, dateStr: string) => void;
}

function DayCell({ dateStr, isDropTarget, isDragging, children, style, onDragOver, onDragLeave, onDrop }: DayCellProps) {
  return (
    <div
      onDragOver={(e) => onDragOver(e, dateStr)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, dateStr)}
      style={{
        ...style,
        outline: isDropTarget && isDragging ? "2px dashed var(--accent)" : undefined,
        outlineOffset: isDropTarget && isDragging ? -2 : undefined,
        background: isDropTarget && isDragging ? "rgba(37,99,235,0.05)" : (style?.background as string | undefined),
        transition: "background 0.1s",
        borderRadius: style?.borderRadius ?? 6,
      }}
    >
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ScheduleCalendar({ visits, view, rangeStart, isAdmin }: Props) {
  const router = useRouter();
  const [localVisits, setLocalVisits] = useState<VisitRow[]>(visits);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const [quickBookDate, setQuickBookDate] = useState<string | null>(null);
  const visitsRef = useRef(visits);

  useEffect(() => {
    visitsRef.current = visits;
    setLocalVisits(visits);
  }, [visits]);

  const todayStr = toDateStr(new Date());
  const rangeDate = new Date(rangeStart + "T00:00:00");

  // ── Navigation ──────────────────────────────────────────────────────────────
  let prevUrl: string, nextUrl: string, todayUrl: string, rangeLabel: string;
  let currentYear: number, currentMonth: number;

  if (view === "week") {
    const ws = getWeekStartFromStr(rangeStart);
    prevUrl = weekUrl(addDays(ws, -7));
    nextUrl = weekUrl(addDays(ws, 7));
    todayUrl = weekUrl(getWeekStartFromStr(todayStr));
    rangeLabel = `${ws.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${addDays(ws, 6).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
    currentYear = ws.getFullYear();
    currentMonth = ws.getMonth() + 1;
  } else if (view === "month") {
    currentYear = rangeDate.getFullYear();
    currentMonth = rangeDate.getMonth() + 1;
    const pm = currentMonth === 1 ? [currentYear - 1, 12] : [currentYear, currentMonth - 1];
    const nm = currentMonth === 12 ? [currentYear + 1, 1] : [currentYear, currentMonth + 1];
    prevUrl = monthUrl(pm[0], pm[1]);
    nextUrl = monthUrl(nm[0], nm[1]);
    todayUrl = monthUrl(new Date().getFullYear(), new Date().getMonth() + 1);
    rangeLabel = rangeDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } else {
    currentYear = rangeDate.getFullYear();
    currentMonth = 1;
    prevUrl = yearUrl(currentYear - 1);
    nextUrl = yearUrl(currentYear + 1);
    todayUrl = yearUrl(new Date().getFullYear());
    rangeLabel = String(currentYear);
  }

  const isCurrent =
    view === "week" ? toDateStr(getWeekStartFromStr(rangeStart)) === toDateStr(getWeekStartFromStr(todayStr))
    : view === "month" ? currentYear === new Date().getFullYear() && currentMonth === new Date().getMonth() + 1
    : currentYear === new Date().getFullYear();

  const toWeekUrl = view === "month" ? weekUrl(getWeekStartFromStr(rangeStart))
    : view === "year" ? weekUrl(getWeekStartFromStr(todayStr))
    : weekUrl(getWeekStartFromStr(rangeStart));

  const toMonthUrl = view === "week" ? monthUrl(rangeDate.getFullYear(), rangeDate.getMonth() + 1)
    : view === "year" ? monthUrl(currentYear, new Date().getMonth() + 1)
    : monthUrl(currentYear, currentMonth);

  const toYearUrl = yearUrl(currentYear);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStart = useCallback((e: React.DragEvent, visit: VisitRow) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("visitId", visit.id);
    e.dataTransfer.setData("startISO", visit.scheduled_start);
    e.dataTransfer.setData("endISO", visit.scheduled_end);
    setDraggingId(visit.id);
    setDropError(null);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const visitId = e.dataTransfer.getData("visitId");
    const origStart = e.dataTransfer.getData("startISO");
    const origEnd = e.dataTransfer.getData("endISO");
    setDraggingId(null);
    setDropTarget(null);
    if (!visitId || !origStart || !origEnd) return;
    if (toDateStr(new Date(origStart)) === targetDateStr) return;
    const { start: newStart, end: newEnd } = computeNewSchedule(origStart, origEnd, targetDateStr);
    setLocalVisits(prev => prev.map(v => v.id === visitId ? { ...v, scheduled_start: newStart, scheduled_end: newEnd } : v));
    try {
      const res = await fetch(`/api/v1/visits/${visitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduled_start: newStart, scheduled_end: newEnd }),
      });
      if (!res.ok) {
        const data = await res.json() as { error?: { message?: string } };
        setDropError(data.error?.message ?? "Failed to reschedule");
        setLocalVisits(visitsRef.current);
      } else {
        router.refresh();
      }
    } catch {
      setDropError("Network error — reschedule failed");
      setLocalVisits(visitsRef.current);
    }
  }, [router]);

  const byDate = groupByDate(localVisits);

  // ── Week view ───────────────────────────────────────────────────────────────
  function renderWeekView() {
    const ws = getWeekStartFromStr(rangeStart);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "var(--space-2)", overflowX: "auto" }}>
        {DAY_LABELS.map((label, i) => {
          const dayDate = addDays(ws, i);
          const dayStr = toDateStr(dayDate);
          const isToday = dayStr === todayStr;
          const dayVisits = byDate.get(dayStr) ?? [];
          return (
            <DayCell key={label} dateStr={dayStr} isDropTarget={dropTarget === dayStr} isDragging={draggingId !== null} style={{ minWidth: 120 }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
              <div style={{ padding: "var(--space-2)", marginBottom: "var(--space-2)", borderRadius: 6, background: isToday ? "var(--accent)" : "var(--bg-muted, #f4f4f5)", textAlign: "center" }}>
                <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, color: isToday ? "#fff" : "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: isToday ? "#fff" : "var(--fg)", marginTop: 2 }}>{dayDate.getDate()}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {dayVisits.map(v => <VisitCard key={v.id} visit={v} isAdmin={isAdmin} isDragging={draggingId === v.id} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />)}
                {isAdmin && (
                  <button type="button" onClick={() => setQuickBookDate(dayStr)} style={{ height: dayVisits.length === 0 ? 40 : 28, borderRadius: 6, border: "1px dashed var(--border)", background: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: "var(--text-xs)", opacity: 0.6, transition: "opacity 0.1s" }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}>
                    + Book
                  </button>
                )}
                {!isAdmin && dayVisits.length === 0 && <div style={{ height: 40, borderRadius: 6, border: "1px dashed var(--border)", opacity: 0.4 }} />}
              </div>
            </DayCell>
          );
        })}
      </div>
    );
  }

  // ── Month view ──────────────────────────────────────────────────────────────
  function renderMonthView() {
    const year = rangeDate.getFullYear();
    const month = rangeDate.getMonth() + 1;
    const grid = getMonthGrid(year, month);
    return (
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
          {DAY_LABELS.map(l => (
            <div key={l} style={{ textAlign: "center", fontSize: "var(--text-xs)", fontWeight: 700, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.05em", padding: "var(--space-1) 0" }}>{l}</div>
          ))}
        </div>
        {grid.map((row, ri) => (
          <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "var(--space-1)", marginBottom: "var(--space-1)" }}>
            {row.map((day, ci) => {
              if (!day) return <div key={ci} style={{ minHeight: 90, border: "1px solid transparent" }} />;
              const dayStr = toDateStr(day);
              const isToday = dayStr === todayStr;
              const dayVisits = byDate.get(dayStr) ?? [];
              return (
                <DayCell key={ci} dateStr={dayStr} isDropTarget={dropTarget === dayStr} isDragging={draggingId !== null} style={{ minHeight: 90, border: `1px solid var(--border)`, borderRadius: 6, padding: "var(--space-1)", background: isToday ? "rgba(37,99,235,0.04)" : "#fff", cursor: isAdmin ? "default" : undefined }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
                    <div style={{ fontSize: "var(--text-xs)", fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--fg)" }}>{day.getDate()}</div>
                    {isAdmin && (
                      <button type="button" onClick={() => setQuickBookDate(dayStr)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg-muted)", fontSize: 14, lineHeight: 1, padding: "0 2px", opacity: 0.5 }} onMouseEnter={e => (e.currentTarget.style.opacity = "1")} onMouseLeave={e => (e.currentTarget.style.opacity = "0.5")} title="Quick book">+</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {dayVisits.slice(0, 3).map(v => <VisitCard key={v.id} visit={v} isAdmin={isAdmin} isDragging={draggingId === v.id} compact onDragStart={handleDragStart} onDragEnd={handleDragEnd} />)}
                    {dayVisits.length > 3 && (
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)", paddingLeft: 4 }}>+{dayVisits.length - 3} more</div>
                    )}
                  </div>
                </DayCell>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  // ── Year view ───────────────────────────────────────────────────────────────
  function renderYearView() {
    const year = rangeDate.getFullYear();
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-4)" }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
          const grid = getMonthGrid(year, m);
          const now = new Date();
          const isCurrentMonth = year === now.getFullYear() && m === now.getMonth() + 1;
          let monthTotal = 0;
          for (let d = 1; d <= new Date(year, m, 0).getDate(); d++) {
            monthTotal += byDate.get(toDateStr(new Date(year, m - 1, d)))?.length ?? 0;
          }
          return (
            <div key={m} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "var(--space-3)", background: isCurrentMonth ? "rgba(37,99,235,0.02)" : "#fff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "var(--space-2)" }}>
                <button type="button" onClick={() => router.push(monthUrl(year, m) as Route)} style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: isCurrentMonth ? "var(--accent)" : "var(--fg)", background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  {MONTH_NAMES[m - 1]}
                </button>
                {monthTotal > 0 && (
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--fg-muted)" }}>{monthTotal} visit{monthTotal !== 1 ? "s" : ""}</span>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 2 }}>
                {["M","T","W","T","F","S","S"].map((d, i) => (
                  <div key={i} style={{ textAlign: "center", fontSize: 9, color: "var(--fg-muted)", fontWeight: 600 }}>{d}</div>
                ))}
              </div>
              {grid.map((row, ri) => (
                <div key={ri} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, marginBottom: 1 }}>
                  {row.map((day, ci) => {
                    if (!day) return <div key={ci} />;
                    const dayStr = toDateStr(day);
                    const count = byDate.get(dayStr)?.length ?? 0;
                    const isToday = dayStr === todayStr;
                    const bg = isToday ? "var(--accent)" : count >= 4 ? "rgba(37,99,235,0.65)" : count >= 2 ? "rgba(37,99,235,0.38)" : count === 1 ? "rgba(37,99,235,0.18)" : "transparent";
                    const fg = isToday || count >= 4 ? "#fff" : "var(--fg)";
                    return (
                      <button key={ci} type="button" title={count > 0 ? `${count} visit${count !== 1 ? "s" : ""}` : undefined} onClick={() => router.push(weekUrl(getWeekStartFromStr(dayStr)) as Route)} style={{ background: bg, borderRadius: 3, border: "none", cursor: "pointer", padding: 0, aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: fg, fontWeight: isToday ? 700 : 400, minHeight: 18 }}>
                        {day.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* View toggle + navigation */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", marginBottom: "var(--space-4)", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: "var(--bg-muted, #f4f4f5)", padding: 2, borderRadius: 8 }}>
          {(["week", "month", "year"] as ViewMode[]).map(v => (
            <button key={v} type="button" onClick={() => router.push((v === "week" ? toWeekUrl : v === "month" ? toMonthUrl : toYearUrl) as Route)} style={{ padding: "4px 12px", borderRadius: 6, border: "none", fontSize: "var(--text-sm)", fontWeight: 500, cursor: "pointer", background: view === v ? "#fff" : "transparent", color: view === v ? "var(--fg)" : "var(--fg-muted)", boxShadow: view === v ? "0 1px 3px rgba(0,0,0,0.1)" : "none", transition: "all 0.1s" }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", fontSize: "var(--text-sm)" }}>
          <button type="button" onClick={() => router.push(prevUrl as Route)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--fg)", fontSize: "var(--text-sm)" }}>←</button>
          <span style={{ fontWeight: 500, color: "var(--fg)", minWidth: view === "year" ? 48 : view === "month" ? 150 : 200, textAlign: "center" }}>{rangeLabel}</span>
          <button type="button" onClick={() => router.push(nextUrl as Route)} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 10px", cursor: "pointer", color: "var(--fg)", fontSize: "var(--text-sm)" }}>→</button>
          {!isCurrent && (
            <button type="button" onClick={() => router.push(todayUrl as Route)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent)", fontSize: "var(--text-sm)", padding: "4px" }}>Today</button>
          )}
        </div>
      </div>

      {dropError && (
        <div style={{ marginBottom: "var(--space-3)", padding: "var(--space-2) var(--space-3)", background: "rgba(220,38,38,0.1)", borderRadius: 6, color: "#dc2626", fontSize: "var(--text-sm)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>{dropError}</span>
          <button type="button" onClick={() => setDropError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: "var(--text-base)", lineHeight: 1 }}>×</button>
        </div>
      )}

      {view === "week" && renderWeekView()}
      {view === "month" && renderMonthView()}
      {view === "year" && renderYearView()}

      {localVisits.length === 0 && view !== "year" && (
        <div style={{ marginTop: "var(--space-8)", textAlign: "center", color: "var(--fg-muted)", fontSize: "var(--text-sm)" }}>
          No visits scheduled for this {view}.{" "}
          <Link href="/app/visits" style={{ color: "var(--accent)" }}>View all visits →</Link>
        </div>
      )}

      {isAdmin && view !== "year" && draggingId === null && (
        <p style={{ marginTop: "var(--space-3)", fontSize: "var(--text-xs)", color: "var(--fg-muted)", textAlign: "center" }}>
          Drag visits to reschedule · Click + to quick book
        </p>
      )}

      {quickBookDate && (
        <QuickBookModal
          initialDate={quickBookDate}
          onClose={() => setQuickBookDate(null)}
        />
      )}
    </div>
  );
}
