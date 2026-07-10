import { describe, it, expect } from "vitest";
import {
  canEstimateBoardDrop,
  canJobBoardDrop,
  canWorkOrderBoardDrop,
} from "../board-transitions";

describe("canJobBoardDrop", () => {
  it("allows draft → scheduled", () => {
    expect(canJobBoardDrop("draft", "scheduled")).toBe(true);
  });
  it("blocks draft → invoiced", () => {
    expect(canJobBoardDrop("draft", "invoiced")).toBe(false);
  });
  it("blocks invoiced anywhere", () => {
    expect(canJobBoardDrop("invoiced", "completed")).toBe(false);
  });
});

describe("canEstimateBoardDrop", () => {
  it("allows sent → approved", () => {
    expect(canEstimateBoardDrop("sent", "approved")).toBe(true);
  });
  it("blocks draft → sent (must use Send action)", () => {
    expect(canEstimateBoardDrop("draft", "sent")).toBe(false);
  });
  it("blocks terminal approved moves", () => {
    expect(canEstimateBoardDrop("approved", "sent")).toBe(false);
  });
});

describe("canWorkOrderBoardDrop", () => {
  it("allows draft → ready", () => {
    expect(canWorkOrderBoardDrop("draft", "ready")).toBe(true);
  });
  it("blocks completed → draft", () => {
    expect(canWorkOrderBoardDrop("completed", "draft")).toBe(false);
  });
});
