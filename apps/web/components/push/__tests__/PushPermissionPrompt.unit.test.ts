import { afterEach, describe, expect, it } from "vitest";
import {
  PUSH_PROMPT_STORAGE_KEY,
  dismissPushPrompt,
  shouldShowPushPrompt,
} from "../PushPermissionPrompt";

const show = {
  permission: "default",
  prompted: false,
  configured: true,
  hasSubscription: false,
  supported: true,
};

describe("shouldShowPushPrompt", () => {
  it("shows when default, not prompted, configured, no sub, supported", () => {
    expect(shouldShowPushPrompt(show)).toBe(true);
  });

  it("hides when permission is denied", () => {
    expect(shouldShowPushPrompt({ ...show, permission: "denied" })).toBe(false);
  });

  it("hides when permission is granted", () => {
    expect(shouldShowPushPrompt({ ...show, permission: "granted" })).toBe(false);
  });

  it("hides after Not now", () => {
    expect(shouldShowPushPrompt({ ...show, prompted: true })).toBe(false);
  });

  it("hides when push is unconfigured", () => {
    expect(shouldShowPushPrompt({ ...show, configured: false })).toBe(false);
  });

  it("hides when a subscription already exists", () => {
    expect(shouldShowPushPrompt({ ...show, hasSubscription: true })).toBe(false);
  });

  it("hides when Web Push is unsupported", () => {
    expect(shouldShowPushPrompt({ ...show, supported: false })).toBe(false);
  });
});

describe("dismissPushPrompt", () => {
  afterEach(() => {
    try {
      localStorage.removeItem(PUSH_PROMPT_STORAGE_KEY);
    } catch {
      // node vitest has no localStorage unless we stubbed it
    }
  });

  it("writes dovetails.push.prompted = 1", () => {
    const store: Record<string, string> = {};
    dismissPushPrompt({
      setItem(key, value) {
        store[key] = value;
      },
    });
    expect(store[PUSH_PROMPT_STORAGE_KEY]).toBe("1");
  });
});
