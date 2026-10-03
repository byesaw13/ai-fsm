import { formatBusinessTime } from "@/lib/time/business-tz";

export type ScheduleSlot = {
  id: string;
  assignedUserId: string | null;
  start: string;
  end: string;
  status: string;
  label: string;
};

const CLOSED = new Set(["cancelled", "completed"]);

/** First visit that occupies the same assignee and overlaps the proposed window. */
export function assigneeOverlap(
  proposed: { id: string; assignedUserId: string | null; start: string; end: string },
  existing: ScheduleSlot[],
): ScheduleSlot | null {
  if (!proposed.assignedUserId) return null;
  const start = new Date(proposed.start).getTime();
  const end = new Date(proposed.end).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  for (const slot of existing) {
    if (slot.id === proposed.id) continue;
    if (slot.assignedUserId !== proposed.assignedUserId) continue;
    if (CLOSED.has(slot.status)) continue;
    const slotStart = new Date(slot.start).getTime();
    const slotEnd = new Date(slot.end).getTime();
    if (!Number.isFinite(slotStart) || !Number.isFinite(slotEnd)) continue;
    if (slotStart < end && slotEnd > start) return slot;
  }
  return null;
}

export function scheduleConflictMessage(slot: Pick<ScheduleSlot, "label" | "start" | "end">): string {
  return `${slot.label} is already booked ${formatBusinessTime(slot.start)}–${formatBusinessTime(slot.end)}.`;
}

export function scheduleSlotLabel(clientName: string | null, address: string | null): string {
  const who = clientName?.trim() || "Another visit";
  const where = address?.trim();
  return where ? `${who} · ${where}` : who;
}
