import { describe, expect, it } from "vitest";
import { isAutomatedUserAgent } from "../bots";

describe("isAutomatedUserAgent", () => {
  it("lets real phone and desktop browsers through", () => {
    expect(isAutomatedUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAutomatedUserAgent("Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36")).toBe(false);
  });
  it("blocks previewers, scanners, scripts and empty agents", () => {
    for (const ua of [
      "facebookexternalhit/1.1",
      "WhatsApp/2.23",
      "Slackbot-LinkExpanding 1.0",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
      "Mozilla/5.0 HeadlessChrome/120",
      "curl/8.5.0",
      "python-requests/2.31",
      "",
      null,
    ]) {
      expect(isAutomatedUserAgent(ua), String(ua)).toBe(true);
    }
  });
});
