import { describe, expect, it } from "vitest";
import { placeAttentionPanel } from "../place-panel";

const panel = { width: 340, maxHeight: 420 };

describe("placeAttentionPanel", () => {
  it("opens to the right of a left-sidebar bell so the list stays on screen", () => {
    // Desktop: 240px sidebar, bell near its right edge (matches AppShell).
    const box = placeAttentionPanel(
      { left: 164, right: 200, top: 10, bottom: 46 },
      { width: 1440, height: 900 },
      panel,
    );
    expect(box.left).toBe(164);
    expect(box.left + box.width).toBeLessThanOrEqual(1440 - 12);
    expect(box.left).toBeGreaterThanOrEqual(12);
    expect(box.top).toBe(54);
  });

  it("flips left when the trigger is on the right edge (mobile More sheet)", () => {
    const box = placeAttentionPanel(
      { left: 700, right: 736, top: 12, bottom: 48 },
      { width: 768, height: 900 },
      panel,
    );
    expect(box.left + box.width).toBeLessThanOrEqual(768 - 12);
    expect(box.left).toBeGreaterThanOrEqual(12);
    expect(box.left).toBe(736 - box.width);
  });

  it("does not invent height when the viewport is shorter than 120px below the bell", () => {
    const box = placeAttentionPanel(
      { left: 164, right: 200, top: 10, bottom: 46 },
      { width: 1440, height: 100 },
      panel,
    );
    expect(box.top + box.maxHeight).toBeLessThanOrEqual(100 - 12);
  });

  it("never starts left of the viewport (the old desktop bug)", () => {
    const box = placeAttentionPanel(
      { left: 164, right: 200, top: 10, bottom: 46 },
      { width: 1440, height: 900 },
      panel,
    );
    expect(box.left).toBeGreaterThanOrEqual(0);
  });
});
