import { describe, it, expect } from "vitest";
import { buildPushPayload } from "@/lib/push/payload";

describe("buildPushPayload", () => {
  it("defaults url to / and derives a tag from it", () => {
    const p = buildPushPayload({ title: "Hi" });
    expect(p.data.url).toBe("/");
    expect(p.tag).toBe("dovetails-/");
    expect(p.body).toBe("");
  });

  it("keeps an app-relative url and an explicit tag", () => {
    const p = buildPushPayload({ title: "Arrived", body: "On site", url: "/app/my-work", tag: "arrival-1" });
    expect(p.data.url).toBe("/app/my-work");
    expect(p.tag).toBe("arrival-1");
  });

  it("rejects a non-relative url (no open-redirect via a push)", () => {
    expect(buildPushPayload({ title: "x", url: "https://evil.example/phish" }).data.url).toBe("/");
    expect(buildPushPayload({ title: "x", url: "app/my-work" }).data.url).toBe("/");
  });

  it("clamps an overlong title and body", () => {
    const p = buildPushPayload({ title: "T".repeat(200), body: "B".repeat(400) });
    expect(p.title.length).toBeLessThanOrEqual(80);
    expect(p.body.length).toBeLessThanOrEqual(180);
    expect(p.title.endsWith("…")).toBe(true);
  });

  it("falls back to a default title", () => {
    expect(buildPushPayload({ title: "" }).title).toBe("Dovetails");
  });
});
