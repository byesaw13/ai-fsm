import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("CaptureLink", () => {
  it("is a real <a href> so Capture gets a fresh Permissions-Policy", () => {
    const src = readFileSync(join(__dirname, "../CaptureLink.tsx"), "utf8");
    expect(src).toContain('href={CAPTURE_HREF}');
    expect(src).toContain("<a ");
    expect(src).not.toMatch(/from ["']next\/link["']/);
  });
});
