/**
 * Logger unit tests
 *
 * Tier: Unit (Tier 1) — no external dependencies.
 * Tests the structured JSON logger emitted by apps/web/lib/logger.ts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { logger, _setWriter } from "../logger";

// Capture log lines emitted during each test.
let lines: string[] = [];
let restore: (() => void) | null = null;

beforeEach(() => {
  lines = [];
  restore = _setWriter((line) => lines.push(line));
});

afterEach(() => {
  restore?.();
  restore = null;
  delete process.env.LOG_LEVEL;
});

function lastParsed(): Record<string, unknown> {
  const last = lines[lines.length - 1];
  if (!last) throw new Error("No log lines emitted");
  return JSON.parse(last) as Record<string, unknown>;
}

describe("logger", () => {
  it("emits valid JSON on logger.info", () => {
    logger.info("test message");
    const rec = lastParsed();
    expect(rec.level).toBe("info");
    expect(rec.msg).toBe("test message");
    expect(rec.service).toBe("web");
    expect(typeof rec.ts).toBe("string");
  });

  it("includes extra fields in the record", () => {
    logger.info("job created", { jobId: "abc-123", traceId: "t1" });
    const rec = lastParsed();
    expect(rec.jobId).toBe("abc-123");
    expect(rec.traceId).toBe("t1");
  });

  it("logger.warn emits level=warn", () => {
    logger.warn("slow query", { durationMs: 500 });
    expect(lastParsed().level).toBe("warn");
    expect(lastParsed().durationMs).toBe(500);
  });

  it("logger.error serialises Error into err.message and err.name", () => {
    const err = new Error("db connection refused");
    logger.error("db failed", err, { traceId: "t2" });
    const rec = lastParsed();
    expect(rec.level).toBe("error");
    expect((rec.err as Record<string, unknown>).message).toBe("db connection refused");
    expect((rec.err as Record<string, unknown>).name).toBe("Error");
    expect(rec.traceId).toBe("t2");
  });

  it("logger.error handles non-Error catch values", () => {
    logger.error("something went wrong", "plain string error");
    const err = (lastParsed().err as Record<string, unknown>);
    expect(err.message).toBe("plain string error");
    expect(err.name).toBe("UnknownError");
  });

  it("logger.error with no err argument omits err field", () => {
    logger.error("manual error log");
    const rec = lastParsed();
    expect(rec.err).toBeUndefined();
  });

  it("ts field is a valid ISO 8601 string", () => {
    logger.info("ping");
    const ts = lastParsed().ts as string;
    expect(() => new Date(ts).toISOString()).not.toThrow();
  });

  it("respects LOG_LEVEL=error — suppresses info and warn", () => {
    process.env.LOG_LEVEL = "error";
    logger.info("should be suppressed");
    logger.warn("also suppressed");
    expect(lines).toHaveLength(0);

    logger.error("this should appear");
    expect(lines).toHaveLength(1);
  });

  it("debug messages are suppressed at default info level", () => {
    logger.debug("verbose debug output");
    expect(lines).toHaveLength(0);
  });

  it("emits debug when LOG_LEVEL=debug", () => {
    process.env.LOG_LEVEL = "debug";
    logger.debug("debug output");
    expect(lastParsed().level).toBe("debug");
  });

  it("each call emits exactly one newline-delimited JSON line", () => {
    logger.info("a");
    logger.info("b");
    logger.info("c");
    expect(lines).toHaveLength(3);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
