import Anthropic from "@anthropic-ai/sdk";

export interface AiFailure {
  code: "AI_NOT_CONFIGURED" | "AI_OUT_OF_CREDIT" | "AI_AUTH_FAILED" | "AI_BUSY" | "AI_UNAVAILABLE";
  message: string;
}

/**
 * Plain reason an AI step could not run, for the owner (Prepare Quote, Revise).
 * `err` is what the call threw, or null when it returned nothing usable.
 */
export function describeAiFailure(err: unknown): AiFailure {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { code: "AI_NOT_CONFIGURED", message: "AI isn't set up on this server (ANTHROPIC_API_KEY is missing)." };
  }
  if (err instanceof Anthropic.APIError) {
    const text = err.message.toLowerCase();
    if (text.includes("credit balance")) {
      return {
        code: "AI_OUT_OF_CREDIT",
        message: "The AI account is out of credit. Add credit at console.anthropic.com (Plans & Billing), then try again.",
      };
    }
    if (err.status === 401 || err.status === 403) {
      return { code: "AI_AUTH_FAILED", message: "The AI key was rejected. Check ANTHROPIC_API_KEY." };
    }
    if (err.status === 429 || err.status === 529 || (err.status ?? 0) >= 500) {
      return { code: "AI_BUSY", message: "The AI is busy right now. Try again in a minute." };
    }
  }
  return { code: "AI_UNAVAILABLE", message: "The AI couldn't do this right now. Try again." };
}
