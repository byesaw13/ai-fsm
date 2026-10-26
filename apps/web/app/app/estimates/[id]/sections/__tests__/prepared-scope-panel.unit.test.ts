import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PreparedScope, PreparedTask } from "@ai-fsm/domain";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/components/ui", () => ({
  Button: (p: { children?: unknown }) => createElement("button", null, p.children as never),
  useToast: () => ({ success: () => {}, error: () => {} }),
}));

// The component is compiled with the classic JSX runtime under vitest.
(globalThis as { React?: typeof React }).React = React;

import { PreparedScopePanel } from "../PreparedScopePanel";

function task(t: Partial<PreparedTask> & Pick<PreparedTask, "id" | "group_key">): PreparedTask {
  return {
    room_id: null, description: `Task ${t.id}`, kind: "requested", confirmed: true, quantity_key: null, count: null, quantity: null,
    hours_low: 2, hours_high: 4, hours_source: "ai_allowance", materials_cents: 1000, ...t,
  };
}

const SCOPE: PreparedScope = {
  version: 1,
  source: { visit_id: "v", assessment_id: "a", assessment_updated_at: null },
  groups: [{ key: "kitchen", label: "Kitchen" }, { key: "hall", label: "Hall" }],
  tasks: [task({ id: "t1", group_key: "kitchen" }), task({ id: "t2", group_key: "kitchen" }), task({ id: "t3", group_key: "hall" })],
  questions: [{ id: "q1", task_ids: ["t3"], text: "Color?", answer: null }],
  alternatives: [],
  exclusions: [],
};

describe("PreparedScopePanel work areas (TASK-185)", () => {
  const html = renderToStaticMarkup(
    createElement(PreparedScopePanel, {
      estimateId: "e1", initialScope: SCOPE, roomNames: {}, laborRateCents: 8500, laborCostCents: 5000, editable: true, showInternal: false,
    }),
  );

  it("shows one collapsed row per work area, not every task", () => {
    expect(html).toContain('data-testid="work-area-kitchen"');
    expect(html).toContain('data-testid="work-area-hall"');
    expect(html).not.toContain("prepared-task-t1");
    expect(html).toContain('aria-expanded="false"');
  });

  it("shows each area's money and what needs attention", () => {
    // Kitchen: 6 h x $85 + $20 = $530; Hall: 3 h x $85 + $10 = $265
    expect(html).toContain("$530.00");
    expect(html).toContain("1 open question");
    expect(html).toMatch(/data-testid="work-area-total">\$795\.00/);
  });
});

describe("PreparedScopePanel with no work listed", () => {
  it("says so and names the rooms, not a blank table", () => {
    const empty: PreparedScope = { ...SCOPE, tasks: [], questions: [] };
    const html = renderToStaticMarkup(
      createElement(PreparedScopePanel, {
        estimateId: "e1", initialScope: empty, roomNames: {}, laborRateCents: 8500, laborCostCents: 5000, editable: true, showInternal: false,
      }),
    );
    expect(html).toContain('data-testid="prepared-scope-empty"');
    expect(html).toContain("for Kitchen, Hall");
  });
});
