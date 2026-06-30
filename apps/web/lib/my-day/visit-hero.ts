export type HeroVisit = {
  id: string;
  status: string;
  scheduled_start: string;
  job_title: string | null;
  property_address: string | null;
  client_name: string | null;
  client_phone: string | null;
};

function isOverdueScheduled(visit: HeroVisit, nowMs: number): boolean {
  return visit.status === "scheduled" && new Date(visit.scheduled_start).getTime() < nowMs;
}

function priority(visit: HeroVisit, nowMs: number): number {
  if (visit.status === "in_progress" || visit.status === "arrived") return 0;
  if (isOverdueScheduled(visit, nowMs)) return 1;
  if (visit.status === "scheduled") return 2;
  return 99;
}

export function pickHeroVisit<T extends HeroVisit>(visits: T[], nowMs = Date.now()): T | null {
  const pending = visits.filter((v) => v.status !== "completed" && v.status !== "cancelled");
  if (pending.length === 0) return null;
  return [...pending].sort((a, b) => {
    const pa = priority(a, nowMs);
    const pb = priority(b, nowMs);
    if (pa !== pb) return pa - pb;
    return new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime();
  })[0];
}

export function buildMapsUrl(address: string | null | undefined): string | null {
  const trimmed = address?.trim();
  if (!trimmed) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(trimmed)}`;
}

export function buildTelUrl(phone: string | null | undefined): string | null {
  const digits = phone?.replace(/\D/g, "");
  if (!digits) return null;
  return `tel:${digits}`;
}

export function heroPrimaryAction(status: string): "start" | "complete" | null {
  if (status === "scheduled") return "start";
  if (status === "arrived" || status === "in_progress") return "complete";
  return null;
}

export function excludeHeroVisit<T extends { id: string }>(visits: T[], heroId: string | null): T[] {
  if (!heroId) return visits;
  return visits.filter((v) => v.id !== heroId);
}