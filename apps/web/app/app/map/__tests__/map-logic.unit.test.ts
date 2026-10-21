import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_NODES, BRANCHES, EDGES, LENSES, WORK } from "../map-data";
import { neighborId, nodeById, noteTargetId, placementProblems, workById, workFor } from "../map-logic";

const readmePath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../../docs/backlog/README.md");

function backlogBucket(status: string): "progress" | "backlog" | "deferred" | null {
  if (status === "Done" || status.startsWith("Cancelled")) return null;
  if (/^in progress$/i.test(status)) return "progress";
  if (status === "Proposed" || status === "Ready") return "backlog";
  if (status === "Deferred") return "deferred";
  throw new Error(`Unmapped backlog status: ${status}`);
}

describe("system map path", () => {
  it("walks the job path from request to house history", () => {
    expect(BRANCHES.map((node) => node.id)).toEqual([
      "request",
      "person",
      "house",
      "quote",
      "job",
      "visit",
      "bill",
      "history",
    ]);
  });

  it("moves to the next and previous branch and stops at the ends", () => {
    expect(neighborId("request", -1)).toBe("request");
    expect(neighborId("request", 1)).toBe("person");
    expect(neighborId("quote", 1)).toBe("job");
    expect(neighborId("history", 1)).toBe("history");
    expect(neighborId("history", -1)).toBe("bill");
  });

  it("does not move a lens or the floor along the path", () => {
    expect(neighborId("today", 1)).toBe("today");
    expect(neighborId("desk", -1)).toBe("desk");
    expect(neighborId("floor", 1)).toBe("floor");
    expect(LENSES.map((node) => node.kind)).toEqual(["lens", "lens", "lens"]);
  });

  it("names the line from a quote to a job", () => {
    expect(nodeById("quote")?.label).toBe("Quote");
    expect(EDGES.find((edge) => edge.from === "quote" && edge.to === "job")?.label).toBe("approves");
    expect(EDGES).toHaveLength(8);
  });

  it("places every open backlog task once, and no finished task", () => {
    expect(placementProblems()).toEqual([]);
    const readme = readFileSync(readmePath, "utf8");
    const table = readme.slice(readme.indexOf("| ID | Title |"), readme.indexOf("## Status legend"));
    const rows = [...table.matchAll(/^\| (TASK-\d+) \|.*?\| ([^|]+) \|$/gm)].map((match) => ({
      id: match[1],
      bucket: backlogBucket(match[2].trim()),
    }));
    const open = rows.filter((row) => row.bucket !== null);
    const placed = WORK.filter((item) => item.id.startsWith("TASK-"));
    expect(placed.map((item) => item.id).sort()).toEqual(open.map((row) => row.id).sort());
    for (const row of open) {
      expect(workById(row.id)?.status).toBe(row.bucket);
      expect(ALL_NODES.some((node) => node.id === workById(row.id)?.branch)).toBe(true);
    }
  });

  it("keeps a typed request on the same bubble when a satellite or outgoing line is chosen", () => {
    const quote = { type: "node" as const, id: "quote" };
    const outgoing = EDGES.findIndex((edge) => edge.from === "quote" && edge.to === "job");
    expect(noteTargetId({ type: "work", id: "ask-lines" })).toBe(noteTargetId(quote));
    expect(noteTargetId({ type: "edge", id: outgoing })).toBe(noteTargetId(quote));
  });

  it("moves a typed request when the owner picks another step, an incoming line, or a lens", () => {
    const quote = noteTargetId({ type: "node", id: "quote" });
    const incoming = EDGES.findIndex((edge) => edge.to === "quote");
    expect(noteTargetId({ type: "work", id: "ask-moved" })).toBe("visit");
    expect(noteTargetId({ type: "work", id: "ask-moved" })).not.toBe(quote);
    expect(noteTargetId({ type: "edge", id: incoming })).toBe("house");
    expect(noteTargetId({ type: "lens", id: "today" })).toBe("today");
    expect(noteTargetId({ type: "node", id: "floor" })).toBe("floor");
  });

  it("keeps the asked-for gaps on the step they belong to", () => {
    expect(workFor("quote").some((item) => item.id === "ask-lines" && item.status === "asked")).toBe(true);
    expect(workFor("request").some((item) => item.id === "ask-photos")).toBe(true);
    expect(workFor("visit").some((item) => item.id === "ask-moved")).toBe(true);
    expect(workFor("history").some((item) => item.id === "TASK-165")).toBe(true);
    expect(workFor("floor").length).toBeGreaterThan(0);
    expect(workFor("today")).toEqual([]);
  });
});
