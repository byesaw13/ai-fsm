import { describe, it, expect, vi, afterEach } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { describeAiFailure } from "../ai-failure";

function apiError(status: number, message: string) {
  return Anthropic.APIError.generate(status, { type: "error", error: { type: "invalid_request_error", message } }, undefined, new Headers());
}

afterEach(() => vi.unstubAllEnvs());

describe("describeAiFailure", () => {
  it("says the key is missing before anything else", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(describeAiFailure(new Error("x")).code).toBe("AI_NOT_CONFIGURED");
  });

  it("names an out-of-credit account, a rejected key and a busy service", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const credit = describeAiFailure(apiError(400, "Your credit balance is too low to access the Anthropic API."));
    expect(credit.code).toBe("AI_OUT_OF_CREDIT");
    expect(credit.message).toMatch(/console\.anthropic\.com/);
    expect(describeAiFailure(apiError(401, "invalid x-api-key")).code).toBe("AI_AUTH_FAILED");
    expect(describeAiFailure(apiError(529, "Overloaded")).code).toBe("AI_BUSY");
  });

  it("falls back to a plain try-again for anything else, including an unusable answer", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    expect(describeAiFailure(new Error("socket hang up")).code).toBe("AI_UNAVAILABLE");
    expect(describeAiFailure(null).code).toBe("AI_UNAVAILABLE");
  });
});
