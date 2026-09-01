import { describe, expect, it, vi } from "vitest";
import type { Client } from "pg";
import { extractFirmCommitments } from "@ai-fsm/domain/promise-capture";
import {
  processCaptures,
  transcribeCaptureAudio,
  type CaptureEvidenceRow,
  type TranscribeCaptureAudio,
} from "./process-captures.js";

const CHEN =
  "I told Mrs. Chen I would call tomorrow about the deposit.";
const UNCERTAIN = "I might replace that compressor cabinet.";
const MIXED =
  "The flashing is shot, I might replace it, and I told her I'd send a price this week.";

function baseRow(over: Partial<CaptureEvidenceRow> = {}): CaptureEvidenceRow {
  return {
    id: "cap-1",
    captured_at: new Date("2026-09-01T18:00:00.000Z"),
    audio_filename: "audio.webm",
    audio_mime_type: "audio/webm",
    transcript: null,
    processing_state: "pending",
    proposed_title: null,
    proposed_due_at: null,
    proposed_span: null,
    confidence: null,
    processing_error: null,
    ...over,
  };
}

function mockClient(rows: CaptureEvidenceRow[]) {
  const updates: { sql: string; params: unknown[] }[] = [];
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (/SELECT/i.test(sql) && /capture_evidence/i.test(sql)) {
      return { rows, rowCount: rows.length };
    }
    updates.push({ sql, params: params ?? [] });
    return { rows: [], rowCount: 1 };
  });
  return { client: { query } as unknown as Client, query, updates };
}

describe("processCaptures", () => {
  it("pending audio → proposed for a firm customer promise", async () => {
    const { client, updates } = mockClient([baseRow()]);
    const transcribe: TranscribeCaptureAudio = vi.fn(async ({ filePath }) => {
      expect(filePath).toBe("/app/uploads/captures/cap-1/audio.webm");
      return CHEN;
    });

    const result = await processCaptures(client, { transcribe });

    expect(transcribe).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ proposed: 1, lowConfidence: 0, failed: 0 });
    expect(updates).toHaveLength(1);
    const { sql, params } = updates[0];
    expect(sql).not.toMatch(/action_items/);
    expect(sql).toMatch(/processing_state\s*=\s*'proposed'/);
    expect(sql).toMatch(/confidence\s*=\s*'high'/);
    expect(params).toContain(CHEN.replace(/[.]+$/, "").trim());
    const title = params.find((p) => typeof p === "string" && /chen/i.test(p));
    expect(title).toBeTruthy();
    expect(String(title).toLowerCase()).toMatch(/call|deposit/);
  });

  it("uncertain language → low_confidence with no proposed title", async () => {
    const { client, updates } = mockClient([baseRow({ id: "cap-2" })]);
    const transcribe: TranscribeCaptureAudio = vi.fn(async () => UNCERTAIN);

    const result = await processCaptures(client, { transcribe });

    expect(result).toMatchObject({ proposed: 0, lowConfidence: 1, failed: 0 });
    expect(updates).toHaveLength(1);
    const { sql, params } = updates[0];
    expect(sql).toMatch(/processing_state\s*=\s*'low_confidence'/);
    expect(sql).toMatch(/confidence\s*=\s*'low'/);
    expect(sql).toMatch(/proposed_title\s*=\s*NULL/);
    expect(params).not.toContain("proposed");
  });

  it("transcribe throw → failed with original fields unchanged", async () => {
    const original = baseRow({
      proposed_title: "leave me",
      proposed_span: "original span",
      confidence: null,
      processing_error: null,
      transcript: null,
    });
    const { client, updates } = mockClient([original]);
    const transcribe: TranscribeCaptureAudio = vi.fn(async () => {
      throw new Error("whisper down");
    });

    const result = await processCaptures(client, { transcribe });

    expect(result).toMatchObject({ proposed: 0, failed: 1 });
    expect(updates).toHaveLength(1);
    const { sql, params } = updates[0];
    expect(sql).toMatch(/processing_state\s*=\s*'failed'/);
    expect(params).toContain("whisper down");
    expect(sql).not.toMatch(/proposed_title/);
    expect(sql).not.toMatch(/proposed_span/);
    expect(sql).not.toMatch(/proposed_due_at/);
    expect(sql).not.toMatch(/confidence/);
    expect(sql).not.toMatch(/\btranscript\s*=/);
    expect(params).not.toContain("leave me");
    expect(params).not.toContain("original span");
  });

  it("mixed utterance uses domain extract (only the price promise)", async () => {
    expect(extractFirmCommitments(MIXED)).toHaveLength(1);
    expect(extractFirmCommitments(MIXED)[0].title.toLowerCase()).toMatch(/price/);
    expect(extractFirmCommitments(MIXED)[0].title.toLowerCase()).not.toMatch(/replace/);

    const { client, updates } = mockClient([
      baseRow({
        id: "cap-mixed",
        transcript: MIXED,
        audio_filename: "audio.webm",
      }),
    ]);
    const transcribe: TranscribeCaptureAudio = vi.fn(async () => {
      throw new Error("should not transcribe when transcript exists");
    });

    const result = await processCaptures(client, { transcribe });

    expect(transcribe).not.toHaveBeenCalled();
    expect(result).toMatchObject({ proposed: 1, lowConfidence: 0 });
    const { sql, params } = updates[0];
    expect(sql).toMatch(/processing_state\s*=\s*'proposed'/);
    expect(sql).toMatch(/confidence\s*=\s*'high'/);
    expect(params[1]).toBe(MIXED);
    const title = String(params[2]);
    const span = String(params[3]);
    expect(title.toLowerCase()).toMatch(/price/);
    expect(title.toLowerCase()).not.toMatch(/replace/);
    expect(span.toLowerCase()).toMatch(/price/);
    expect(span.toLowerCase()).not.toMatch(/replace/);
    expect(params[4]).toBeNull();
  });

  it("retries failed rows with the existing recording", async () => {
    const { client, updates } = mockClient([
      baseRow({ processing_state: "failed", processing_error: "previous" }),
    ]);
    const transcribe: TranscribeCaptureAudio = vi.fn(async () => CHEN);

    const result = await processCaptures(client, { transcribe });

    expect(transcribe).toHaveBeenCalledOnce();
    expect(result.proposed).toBe(1);
    expect(updates[0].sql).toMatch(/processing_state\s*=\s*'proposed'/);
  });

  it("swallows per-row errors so one bad capture does not abort the poll", async () => {
    const rows = [
      baseRow({ id: "ok-1", transcript: CHEN, audio_filename: null }),
      baseRow({ id: "bad", transcript: CHEN, audio_filename: null }),
      baseRow({ id: "ok-2", transcript: UNCERTAIN, audio_filename: null }),
    ];
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (/SELECT/i.test(sql) && /capture_evidence/i.test(sql)) {
        return { rows, rowCount: rows.length };
      }
      if (params?.[0] === "bad") {
        throw new Error("db write failed");
      }
      return { rows: [], rowCount: 1 };
    });
    const client = { query } as unknown as Client;

    const result = await processCaptures(client, {
      transcribe: vi.fn(async () => {
        throw new Error("should not transcribe");
      }),
    });

    expect(result.proposed).toBe(1);
    expect(result.lowConfidence).toBe(1);
    expect(result.errors).toBe(1);
  });

  it("does not insert action_items or mark confirmed", async () => {
    const { client, query } = mockClient([baseRow({ transcript: CHEN })]);
    await processCaptures(client, { transcribe: vi.fn(async () => CHEN) });
    const sql = query.mock.calls.map((c) => String(c[0])).join("\n");
    expect(sql).not.toMatch(/action_items/);
    expect(sql).not.toMatch(/confirmed/);
  });
});

describe("transcribeCaptureAudio", () => {
  it("throws a retryable error when no stored transcript and no Whisper key", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      await expect(
        transcribeCaptureAudio({
          captureId: "cap-1",
          audioFilename: "audio.webm",
          mimeType: "audio/webm",
          filePath: "/app/uploads/captures/cap-1/audio.webm",
        }),
      ).rejects.toThrow(/no stored transcript and no OPENAI_API_KEY/i);
    } finally {
      if (prevA != null) process.env.ANTHROPIC_API_KEY = prevA;
      else delete process.env.ANTHROPIC_API_KEY;
      if (prevO != null) process.env.OPENAI_API_KEY = prevO;
      else delete process.env.OPENAI_API_KEY;
    }
  });

  it("does not treat Anthropic as speech-to-text even when ANTHROPIC_API_KEY is set", async () => {
    const prevA = process.env.ANTHROPIC_API_KEY;
    const prevO = process.env.OPENAI_API_KEY;
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    delete process.env.OPENAI_API_KEY;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    try {
      await expect(
        transcribeCaptureAudio({
          captureId: "cap-1",
          audioFilename: "audio.webm",
          mimeType: "audio/webm",
          filePath: "/app/uploads/captures/cap-1/audio.webm",
        }),
      ).rejects.toThrow(/no stored transcript and no OPENAI_API_KEY/i);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
      if (prevA != null) process.env.ANTHROPIC_API_KEY = prevA;
      else delete process.env.ANTHROPIC_API_KEY;
      if (prevO != null) process.env.OPENAI_API_KEY = prevO;
      else delete process.env.OPENAI_API_KEY;
    }
  });
});
