import { ALL_NODES, BRANCHES, WORK, type MapNode, type WorkItem, type WorkStatus } from "./map-data";

export function nodeById(id: string): MapNode | undefined {
  return ALL_NODES.find((node) => node.id === id);
}

/** Move along the job path. Lenses and the floor stay put. Stops at the ends. */
export function neighborId(id: string, direction: 1 | -1): string {
  const index = BRANCHES.findIndex((node) => node.id === id);
  if (index === -1) return id;
  const next = index + direction;
  if (next < 0 || next >= BRANCHES.length) return id;
  return BRANCHES[next].id;
}

export function workFor(branch: string, statuses?: readonly WorkStatus[]): WorkItem[] {
  return WORK.filter((item) => item.branch === branch && (!statuses || statuses.includes(item.status)));
}

export function workById(id: string): WorkItem | undefined {
  return WORK.find((item) => item.id === id);
}

/** Every open backlog id is placed once, on a node that exists. */
export function placementProblems(): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const nodeIds = new Set(ALL_NODES.map((node) => node.id));
  for (const item of WORK) {
    if (seen.has(item.id)) problems.push(`duplicate ${item.id}`);
    seen.add(item.id);
    if (!nodeIds.has(item.branch)) problems.push(`${item.id} sits on unknown ${item.branch}`);
  }
  return problems;
}
