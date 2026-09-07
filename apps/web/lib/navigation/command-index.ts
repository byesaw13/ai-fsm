import type { Role } from "@ai-fsm/domain";
import {
  FAB_QUICK_ACTIONS,
  FIELD_QUICK_ACTIONS,
  OWNER_QUICK_ACTIONS,
  type QuickAction,
} from "./quick-actions";
import { MONEY_HUB_LINKS, PEOPLE_HUB_LINKS, WORK_HUB_LINKS } from "./hubs";

export type CommandItem = {
  id: string;
  label: string;
  href: string;
  keywords: string;
  roles: Role[];
};

const OWNER_ADMIN: Role[] = ["owner", "admin"];
const ALL: Role[] = ["owner", "admin", "tech"];

const DESTINATIONS: CommandItem[] = [
  { id: "my-day", label: "My Day", href: "/app/my-work", keywords: "today field home clock", roles: ["owner", "tech"] },
  { id: "overview", label: "Overview", href: "/app", keywords: "office dashboard numbers", roles: OWNER_ADMIN },
  { id: "capture", label: "Capture", href: "/app/capture", keywords: "voice promise record", roles: OWNER_ADMIN },
  { id: "day-review", label: "Day Review", href: "/app/day-review", keywords: "end close evening", roles: ALL },
  { id: "tracking", label: "Tracking", href: "/app/timeline", keywords: "timeline mileage gps vehicle", roles: OWNER_ADMIN },
  { id: "visits", label: "Visits", href: "/app/visits", keywords: "today schedule stop", roles: ALL },
  { id: "price-book", label: "Price book", href: "/app/price-book", keywords: "services rates", roles: OWNER_ADMIN },
  { id: "settings", label: "Settings", href: "/app/settings", keywords: "company team square", roles: OWNER_ADMIN },
  ...WORK_HUB_LINKS.map((l) => ({
    id: `work-${l.href}`,
    label: l.label,
    href: l.href,
    keywords: l.label.toLowerCase(),
    roles: l.href === "/app/visits" ? ALL : OWNER_ADMIN,
  })),
  ...PEOPLE_HUB_LINKS.map((l) => ({
    id: `people-${l.href}`,
    label: l.label,
    href: l.href,
    keywords: l.label.toLowerCase(),
    roles: OWNER_ADMIN,
  })),
  ...MONEY_HUB_LINKS.map((l) => ({
    id: `money-${l.href}`,
    label: l.label,
    href: l.href,
    keywords: l.label.toLowerCase(),
    roles: OWNER_ADMIN,
  })),
];

function fromQuick(actions: QuickAction[], roles: Role[], prefix: string): CommandItem[] {
  return actions
    .filter((a) => !a.action)
    .map((a) => ({
      id: `${prefix}-${a.label}`,
      label: a.label,
      href: a.href,
      keywords: a.label.toLowerCase(),
      roles,
    }));
}

function dedupe(items: CommandItem[]): CommandItem[] {
  const seen = new Set<string>();
  const out: CommandItem[] = [];
  for (const item of items) {
    const key = `${item.label.toLowerCase()}|${item.href}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export const COMMAND_INDEX: CommandItem[] = dedupe([
  ...DESTINATIONS,
  ...fromQuick(OWNER_QUICK_ACTIONS, OWNER_ADMIN, "owner"),
  ...fromQuick(FIELD_QUICK_ACTIONS, ALL, "field"),
  ...fromQuick(FAB_QUICK_ACTIONS, OWNER_ADMIN, "fab"),
]);

export function filterCommands(query: string, role: Role, index: CommandItem[] = COMMAND_INDEX): CommandItem[] {
  const forRole = index.filter((item) => item.roles.includes(role));
  const q = query.trim().toLowerCase();
  if (!q) return forRole;
  return forRole.filter((item) => {
    const hay = `${item.label} ${item.keywords} ${item.href}`.toLowerCase();
    return hay.includes(q);
  });
}
