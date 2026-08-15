/**
 * Day draft — TASK-107.
 *
 * Turns a day's GPS segments, visit matches, receipts, and clock into one
 * proposed timeline. Pure. The owner accepts ready items; exceptions stay
 * for a human. Nothing here writes the ledger.
 */

import { detectGaps } from "./day-review";
import { isPrivateLocation, suggestActivityForSegment } from "./location";
import type { ActivityType } from "./activities";
import {
  CLASSIFICATION_TO_ACTIVITY,
  VISIT_CONFIDENCE_FLOOR,
  type VisitClassification,
} from "./visit-matching";

export const DAY_DRAFT_HIGH_VISIT_SCORE = 70;

export type DayDraftConfidence = "high" | "medium" | "low";

export type DayDraftEvidenceSegment = {
  id: string;
  kind: "stop" | "drive";
  startedAt: string;
  endedAt: string | null;
  placeLabel: string | null;
  zone: string | null;
  status: string;
  activityEntryId: string | null;
  suggestedActivity: ActivityType | null;
  vehicleId: string | null;
  estimatedMiles: number | null;
  isLikelyNoise: boolean;
};

export type DayDraftEvidenceCandidate = {
  id: string;
  segmentId: string | null;
  clientName: string | null;
  propertyAddress: string | null;
  score: number;
  jobId: string | null;
  visitId: string | null;
  workOrderId: string | null;
  clientId: string | null;
  woResolution: string | null;
  visitType: string | null;
};

export type DayDraftEvidenceExpense = {
  vendor: string | null;
  category: string | null;
  notes: string | null;
};

export type DayDraftEvidenceEntry = {
  startedAt: string;
  endedAt: string;
};

export type DayDraftEvidence = {
  segments: DayDraftEvidenceSegment[];
  candidates: DayDraftEvidenceCandidate[];
  expenses: DayDraftEvidenceExpense[];
  loggedEntries: DayDraftEvidenceEntry[];
  clockedMinutes: number | null;
  defaultVehicleId: string | null;
  visitScoreFloor?: number;
};

export type DayDraftItem = {
  key: string;
  kind: "stop" | "drive" | "gap";
  startedAt: string;
  endedAt: string;
  minutes: number;
  placeLabel: string;
  proposedActivity: ActivityType | null;
  proposedClassification: Exclude<VisitClassification, "ignore"> | null;
  label: string;
  confidence: DayDraftConfidence;
  reasons: string[];
  exception: string | null;
  ready: boolean;
  alreadyLogged: boolean;
  segmentId: string | null;
  candidateId: string | null;
  visitId: string | null;
  jobId: string | null;
  workOrderId: string | null;
  clientId: string | null;
  vehicleId: string | null;
  estimatedMiles: number | null;
  expenseHint: string | null;
};

export type DayDraft = {
  items: DayDraftItem[];
  readyCount: number;
  exceptionCount: number;
  alreadyLoggedCount: number;
  attributedMinutes: number;
  clockedMinutes: number | null;
  reconciliation: string;
};

function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

export function unionMinutes(spans: { startedAt: string; endedAt: string }[]): number {
  const sorted = spans
    .map((s) => ({ a: new Date(s.startedAt).getTime(), b: new Date(s.endedAt).getTime() }))
    .filter((s) => s.b > s.a)
    .sort((x, y) => x.a - y.a);
  if (sorted.length === 0) return 0;
  let total = 0;
  let curA = sorted[0].a;
  let curB = sorted[0].b;
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.a <= curB) {
      curB = Math.max(curB, next.b);
    } else {
      total += curB - curA;
      curA = next.a;
      curB = next.b;
    }
  }
  total += curB - curA;
  return Math.round(total / 60000);
}

function coverageOf(start: string, end: string, entries: DayDraftEvidenceEntry[]): "none" | "full" | "overlap" {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  let covered = false;
  let overlaps = false;
  for (const e of entries) {
    const ea = new Date(e.startedAt).getTime();
    const eb = new Date(e.endedAt).getTime();
    if (ea <= a && eb >= b) covered = true;
    if (ea < b && eb > a) overlaps = true;
  }
  if (covered) return "full";
  if (overlaps) return "overlap";
  return "none";
}

function workOrderIsResolved(match: DayDraftEvidenceCandidate): boolean {
  if (match.workOrderId) return true;
  const res = (match.woResolution ?? "").toLowerCase();
  return res === "clear" || res === "resolved" || res === "none";
}

const STORE_TOKENS = [
  "home depot",
  "lowe",
  "ferguson",
  "grainger",
  "harbor freight",
  "menards",
  "ace hardware",
] as const;

export function expenseMatchesPlace(
  place: string,
  expenses: DayDraftEvidenceExpense[],
): string | null {
  const p = place.trim().toLowerCase();
  if (!p) return null;
  for (const e of expenses) {
    const vendor = (e.vendor ?? "").trim();
    const hay = `${vendor} ${e.notes ?? ""} ${e.category ?? ""}`.toLowerCase();
    if (!hay.trim()) continue;
    if (vendor && (p.includes(vendor.toLowerCase()) || vendor.toLowerCase().includes(p))) {
      return vendor;
    }
    for (const token of STORE_TOKENS) {
      const stem = token.split(" ")[0] ?? token;
      if (p.includes(token) && hay.includes(stem)) return vendor || token;
    }
  }
  return null;
}

export function classificationFromSignals(input: {
  visitType: string | null;
  suggestedActivity: ActivityType | null;
}): Exclude<VisitClassification, "ignore"> {
  const vt = (input.visitType ?? "").toLowerCase();
  if (vt.includes("estimate")) return "estimate_visit";
  if (vt.includes("warranty")) return "warranty_callback";
  if (vt.includes("walkthrough")) return "walkthrough";
  if (input.suggestedActivity === "estimate_visit") return "estimate_visit";
  if (input.suggestedActivity === "material_run") return "material_drop";
  return "job_work";
}

function emptyItem(over: Partial<DayDraftItem> & Pick<DayDraftItem, "key" | "kind" | "startedAt" | "endedAt">): DayDraftItem {
  return {
    minutes: minutesBetween(over.startedAt, over.endedAt),
    placeLabel: "",
    proposedActivity: null,
    proposedClassification: null,
    label: "",
    confidence: "low",
    reasons: [],
    exception: null,
    ready: false,
    alreadyLogged: false,
    segmentId: null,
    candidateId: null,
    visitId: null,
    jobId: null,
    workOrderId: null,
    clientId: null,
    vehicleId: null,
    estimatedMiles: null,
    expenseHint: null,
    ...over,
  };
}

function draftOneSegment(
  seg: DayDraftEvidenceSegment,
  candidates: DayDraftEvidenceCandidate[],
  expenses: DayDraftEvidenceExpense[],
  loggedEntries: DayDraftEvidenceEntry[],
  defaultVehicleId: string | null,
  visitScoreFloor: number,
): DayDraftItem | null {
  if (!seg.endedAt) return null;
  if (seg.status === "dismissed") return null;
  if (seg.isLikelyNoise && seg.status !== "confirmed") return null;
  if (isPrivateLocation(seg.zone, seg.placeLabel)) return null;

  const place = seg.placeLabel ?? seg.zone ?? (seg.kind === "drive" ? "Driving" : "Stop");
  const suggested = seg.suggestedActivity ?? suggestActivityForSegment({ kind: seg.kind, zone: seg.zone ?? seg.placeLabel });
  const match = candidates.find((c) => c.segmentId === seg.id) ?? null;
  const coverage = coverageOf(seg.startedAt, seg.endedAt, loggedEntries);
  const alreadyLogged =
    seg.status === "confirmed" || seg.activityEntryId != null || coverage === "full";
  const expenseHint = seg.kind === "stop" ? expenseMatchesPlace(place, expenses) : null;

  const item = emptyItem({
    key: `segment:${seg.id}`,
    kind: seg.kind,
    startedAt: seg.startedAt,
    endedAt: seg.endedAt,
    placeLabel: place,
    segmentId: seg.id,
    alreadyLogged,
    expenseHint,
    vehicleId: seg.vehicleId ?? defaultVehicleId,
    estimatedMiles: seg.estimatedMiles,
    candidateId: match?.id ?? null,
    visitId: match?.visitId ?? null,
    jobId: match?.jobId ?? null,
    workOrderId: match?.workOrderId ?? null,
    clientId: match?.clientId ?? null,
  });

  if (alreadyLogged) {
    item.label = place;
    item.proposedActivity = suggested;
    item.confidence = "high";
    item.reasons = coverage === "full" && !seg.activityEntryId
      ? ["Time already on the ledger"]
      : ["Already on the ledger"];
    return item;
  }

  if (coverage === "overlap") {
    item.label = place;
    item.proposedActivity = suggested ?? (seg.kind === "drive" ? "travel" : null);
    item.exception = "Overlaps logged time";
    item.reasons = ["Partial overlap with an existing activity"];
    item.confidence = "low";
    item.ready = false;
    return item;
  }

  if (seg.kind === "drive") {
    item.proposedActivity = "travel";
    item.label = "Driving";
    if (item.estimatedMiles != null && item.estimatedMiles > 0 && item.vehicleId) {
      item.confidence = "medium";
      item.ready = true;
      item.reasons = [`GPS estimate ${item.estimatedMiles} mi`];
    } else {
      item.confidence = "low";
      item.exception = item.estimatedMiles == null || item.estimatedMiles <= 0
        ? "No GPS miles to confirm"
        : "Pick a vehicle for this drive";
      item.reasons = [item.exception];
    }
    return item;
  }

  if (match) {
    const classification = classificationFromSignals({
      visitType: match.visitType,
      suggestedActivity: suggested,
    });
    item.proposedClassification = classification;
    item.proposedActivity = CLASSIFICATION_TO_ACTIVITY[classification];
    const who = match.clientName ?? "Customer";
    item.label = match.propertyAddress ? `${who} · ${match.propertyAddress}` : who;
    item.reasons = [`${match.score}% match`];
    if (match.visitId) item.reasons.push("Scheduled visit today");
    if (!workOrderIsResolved(match)) {
      item.confidence = "medium";
      item.exception = "Pick a work order";
      item.ready = false;
      return item;
    }
    if (match.visitId || match.score >= DAY_DRAFT_HIGH_VISIT_SCORE) {
      item.confidence = "high";
      item.ready = true;
    } else if (match.score >= visitScoreFloor) {
      item.confidence = "medium";
      item.ready = true;
    } else {
      item.confidence = "low";
      item.exception = "Low-confidence customer match";
      item.ready = false;
    }
    return item;
  }

  if (suggested === "material_run" || expenseHint) {
    item.proposedActivity = "material_run";
    item.label = place;
    item.confidence = "high";
    item.ready = true;
    item.reasons = expenseHint
      ? [`Receipt: ${expenseHint}`]
      : ["Known supply house"];
    return item;
  }

  item.label = place;
  item.confidence = "low";
  item.exception = "No matching job";
  item.reasons = ["Unlabeled stop"];
  return item;
}

export function assembleDayDraft(input: DayDraftEvidence): DayDraft {
  const visitScoreFloor = input.visitScoreFloor ?? VISIT_CONFIDENCE_FLOOR;
  const items: DayDraftItem[] = [];

  const usable = [...input.segments].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
  );
  for (const seg of usable) {
    const item = draftOneSegment(
      seg,
      input.candidates,
      input.expenses,
      input.loggedEntries,
      input.defaultVehicleId,
      visitScoreFloor,
    );
    if (item) items.push(item);
  }

  const signalSpans = items
    .filter((i) => i.kind !== "gap")
    .map((i) => ({ startedAt: i.startedAt, endedAt: i.endedAt }));
  const gaps = detectGaps(signalSpans, input.loggedEntries, 5);
  for (const gap of gaps) {
    items.push(emptyItem({
      key: `gap:${gap.startsAt}`,
      kind: "gap",
      startedAt: gap.startsAt,
      endedAt: gap.endsAt,
      minutes: Math.round(gap.durationMinutes),
      placeLabel: "Untracked",
      label: "Untracked gap",
      exception: "Untracked time",
      reasons: ["GPS gap with no ledger entry"],
      confidence: "low",
    }));
  }

  items.sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());

  const readyCount = items.filter((i) => i.ready).length;
  const exceptionCount = items.filter((i) => i.exception && !i.alreadyLogged).length;
  const alreadyLoggedCount = items.filter((i) => i.alreadyLogged).length;
  const attributedMinutes = unionMinutes([
    ...items
      .filter((i) => i.kind !== "gap" && (i.ready || i.alreadyLogged))
      .map((i) => ({ startedAt: i.startedAt, endedAt: i.endedAt })),
    ...input.loggedEntries,
  ]);

  return {
    items,
    readyCount,
    exceptionCount,
    alreadyLoggedCount,
    attributedMinutes,
    clockedMinutes: input.clockedMinutes,
    reconciliation: reconcile(attributedMinutes, input.clockedMinutes, readyCount, exceptionCount),
  };
}

export function reconcile(
  attributedMinutes: number,
  clockedMinutes: number | null,
  readyCount: number,
  exceptionCount: number,
): string {
  const attr = formatHours(attributedMinutes);
  const readyBit = readyCount === 0
    ? "Nothing ready to accept"
    : `${readyCount} ready item${readyCount === 1 ? "" : "s"}`;
  const exBit = exceptionCount === 0
    ? "no exceptions"
    : `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"}`;
  if (clockedMinutes == null || clockedMinutes <= 0) {
    return `${readyBit} · ${exBit} · attributed ${attr}.`;
  }
  const clocked = formatHours(clockedMinutes);
  const delta = attributedMinutes - clockedMinutes;
  if (Math.abs(delta) <= 20) {
    return `${readyBit} · ${exBit} · attributed ${attr} matches the clocked day (${clocked}).`;
  }
  if (delta < 0) {
    return `${readyBit} · ${exBit} · attributed ${attr}, clocked ${clocked} — ${formatHours(-delta)} unaccounted.`;
  }
  return `${readyBit} · ${exBit} · attributed ${attr}, clocked ${clocked} — ${formatHours(delta)} over the clock.`;
}

export function formatHours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
