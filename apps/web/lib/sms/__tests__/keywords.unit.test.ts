import { describe, expect, it } from "vitest";
import { detectSmsKeyword, replyForSmsKeyword } from "../keywords";
import { SMS_HELP_REPLY, SMS_START_REPLY, SMS_STOP_REPLY } from "../consent";

describe("detectSmsKeyword", () => {
  it("detects STOP family keywords", () => {
    for (const word of ["STOP", "stop", "Stopall", "UNSUBSCRIBE", "cancel", "END", "quit"]) {
      expect(detectSmsKeyword(word)).toBe("stop");
    }
  });

  it("detects HELP family keywords", () => {
    expect(detectSmsKeyword("HELP")).toBe("help");
    expect(detectSmsKeyword("info")).toBe("help");
    expect(detectSmsKeyword("Help!")).toBe("help");
  });

  it("detects START family keywords", () => {
    expect(detectSmsKeyword("START")).toBe("start");
    expect(detectSmsKeyword("unstop")).toBe("start");
    expect(detectSmsKeyword("YES")).toBe("start");
  });

  it("ignores free-text messages", () => {
    expect(detectSmsKeyword("please stop by tomorrow")).toBeNull();
    expect(detectSmsKeyword("I need help with a leak")).toBeNull();
    expect(detectSmsKeyword("yes that works")).toBeNull();
    expect(detectSmsKeyword("")).toBeNull();
    expect(detectSmsKeyword("  ")).toBeNull();
  });
});

describe("replyForSmsKeyword", () => {
  it("returns carrier-friendly replies", () => {
    expect(replyForSmsKeyword("stop")).toBe(SMS_STOP_REPLY);
    expect(replyForSmsKeyword("help")).toBe(SMS_HELP_REPLY);
    expect(replyForSmsKeyword("start")).toBe(SMS_START_REPLY);
  });

  it("includes STOP or HELP guidance in replies", () => {
    expect(SMS_HELP_REPLY).toMatch(/STOP/i);
    expect(SMS_STOP_REPLY).toMatch(/START/i);
    expect(SMS_START_REPLY).toMatch(/STOP/i);
  });
});
