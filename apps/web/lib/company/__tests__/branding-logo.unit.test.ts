import { describe, it, expect } from "vitest";
import { isWordmarkPng } from "../branding";
import { testPng } from "./test-png";

describe("isWordmarkPng (TASK-226)", () => {
  it("treats a wide lockup as a wordmark", () => {
    expect(isWordmarkPng(testPng(1200, 315))).toBe(true);
  });

  it("treats a square mark as a mark, not a wordmark", () => {
    expect(isWordmarkPng(testPng(170, 170))).toBe(false);
    expect(isWordmarkPng(testPng(200, 100))).toBe(false);
  });

  it("treats a JPEG or unreadable bytes as not a wordmark", () => {
    expect(isWordmarkPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(false);
    expect(isWordmarkPng(Buffer.alloc(0))).toBe(false);
  });
});
