import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "pg";
import { extractFirmCommitments } from "@ai-fsm/domain/promise-capture";
import { logger } from "./logger.js";

const CAPTURE_UPLOAD_ROOT = "/app/uploads/captures";
const ERROR_MAX = 500;

export type CaptureEvidenceRow = {
  id: string;
  captured_at: Date | string;
  audio_filename: string | null;
  audio_mime_type: string | null;
  transcript: string | null;
  processing_state: string;
  proposed_title: string | null;
  proposed_due_at: Date | string | null;
  proposed_span: string | null;
  confidence: string | null;
  processing_error: string | null;
};

export type TranscribeCaptureAudio = (args: {
  captureId: string;
  audioFilename: string;
  mimeType: string | null;
  filePath: string;
}) => Promise<string>;

export type ProcessCapturesDeps = {
  transcribe?: TranscribeCaptureAudio;
};

export interface ProcessCapturesResult {
  processed: number;
  proposed: number;
  lowConfidence: number;
  failed: number;
  errors: number;
}

export function captureAudioPath(captureId: string, audioFilename: string): string {
  return path.join(CAPTURE_UPLOAD_ROOT, captureId, path.basename(audioFilename));
}

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.slice(0, ERROR_MAX);
  return String(err).slice(0, ERROR_MAX);
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const MONTHS: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, sept: 8,
  october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
};

/** Only explicit calendar dates, today, or tomorrow. Weekdays and "this week" stay null. */
export function parseProposedDueAt(
  transcript: string,
  capturedAt: Date | string,
): Date | null {
  const captured = asDate(capturedAt);
  if (Number.isNaN(captured.getTime())) return null;
  const text = transcript.toLowerCase();

  if (/\btomorrow\b/.test(text)) {
    const due = new Date(captured);
    due.setUTCDate(due.getUTCDate() + 1);
    due.setUTCHours(12, 0, 0, 0);
    return due;
  }
  if (/\btoday\b/.test(text)) {
    const due = new Date(captured);
    due.setUTCHours(12, 0, 0, 0);
    return due;
  }

  const iso = transcript.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) {
    const due = new Date(`${iso[1]}T12:00:00.000Z`);
    return Number.isNaN(due.getTime()) ? null : due;
  }

  const named = transcript.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i,
  );
  if (!named) return null;
  const month = MONTHS[named[1].toLowerCase()];
  if (month == null) return null;
  const day = Number(named[2]);
  const year = named[3] ? Number(named[3]) : captured.getUTCFullYear();
  const due = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (Number.isNaN(due.getTime()) || due.getUTCMonth() !== month || due.getUTCDate() !== day) {
    return null;
  }
  if (!named[3] && due.getTime() < captured.getTime() - 24 * 60 * 60 * 1000) {
    return null;
  }
  return due;
}

async function markFailed(client: Client, id: string, message: string): Promise<void> {
  await client.query(
    `UPDATE capture_evidence
        SET processing_state = 'failed',
            processing_error = $2,
            updated_at = now()
      WHERE id = $1`,
    [id, message.slice(0, ERROR_MAX)],
  );
}

async function processOne(
  client: Client,
  row: CaptureEvidenceRow,
  transcribe: TranscribeCaptureAudio,
): Promise<"proposed" | "low_confidence" | "failed"> {
  let transcript = row.transcript?.trim() ?? "";

  if (!transcript) {
    if (!row.audio_filename) {
      await markFailed(client, row.id, "no audio or transcript");
      return "failed";
    }
    const filePath = captureAudioPath(row.id, row.audio_filename);
    try {
      transcript = (await transcribe({
        captureId: row.id,
        audioFilename: row.audio_filename,
        mimeType: row.audio_mime_type,
        filePath,
      })).trim();
    } catch (err) {
      await markFailed(client, row.id, errorMessage(err));
      return "failed";
    }
    if (!transcript) {
      await markFailed(client, row.id, "empty transcript");
      return "failed";
    }
  }

  const commitments = extractFirmCommitments(transcript);
  if (commitments.length === 0) {
    await client.query(
      `UPDATE capture_evidence
          SET transcript = $2,
              processing_state = 'low_confidence',
              confidence = 'low',
              proposed_title = NULL,
              proposed_span = NULL,
              proposed_due_at = NULL,
              processing_error = NULL,
              updated_at = now()
        WHERE id = $1`,
      [row.id, transcript],
    );
    return "low_confidence";
  }

  const first = commitments[0];
  const proposedDueAt = parseProposedDueAt(transcript, row.captured_at);
  await client.query(
    `UPDATE capture_evidence
        SET transcript = $2,
            processing_state = 'proposed',
            confidence = 'high',
            proposed_title = $3,
            proposed_span = $4,
            proposed_due_at = $5,
            processing_error = NULL,
            updated_at = now()
      WHERE id = $1`,
    [row.id, transcript, first.title, first.excerpt, proposedDueAt],
  );
  return "proposed";
}

/**
 * Optional Whisper fallback when OPENAI_API_KEY is set.
 * Anthropic Messages cannot transcribe audio (document/audio blocks 400).
 * Chrome SpeechRecognition stores the transcript on POST, so this path is
 * usually skipped. Never deletes the file. Throws so the poll can mark failed.
 */
export async function transcribeCaptureAudio(args: {
  captureId: string;
  audioFilename: string;
  mimeType: string | null;
  filePath: string;
}): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    throw new Error(
      "transcription unavailable: no stored transcript and no OPENAI_API_KEY",
    );
  }

  const bytes = await readFile(args.filePath);
  const mimeType = args.mimeType && args.mimeType.startsWith("audio/")
    ? args.mimeType
    : guessAudioMime(args.audioFilename);

  return transcribeWithWhisper(bytes, args.audioFilename, mimeType, openaiKey);
}

function guessAudioMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".wav") return "audio/wav";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".m4a" || ext === ".mp4") return "audio/mp4";
  if (ext === ".ogg" || ext === ".oga") return "audio/ogg";
  return "audio/webm";
}

async function transcribeWithWhisper(
  bytes: Buffer,
  filename: string,
  mimeType: string,
  apiKey: string,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    path.basename(filename) || "audio.webm",
  );
  form.append("model", "whisper-1");
  form.append("language", "en");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`whisper transcribe HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { text?: string };
  const text = payload.text?.trim();
  if (!text) throw new Error("whisper transcribe returned no text");
  return text;
}

export async function processCaptures(
  client: Client,
  deps: ProcessCapturesDeps = {},
): Promise<ProcessCapturesResult> {
  const transcribe = deps.transcribe ?? transcribeCaptureAudio;
  const result: ProcessCapturesResult = {
    processed: 0,
    proposed: 0,
    lowConfidence: 0,
    failed: 0,
    errors: 0,
  };

  let rows: CaptureEvidenceRow[] = [];
  try {
    const loaded = await client.query<CaptureEvidenceRow>(
      `SELECT id, captured_at, audio_filename, audio_mime_type, transcript,
              processing_state, proposed_title, proposed_due_at, proposed_span,
              confidence, processing_error
         FROM capture_evidence
        WHERE processing_state IN ('pending', 'failed')
          AND (
            audio_filename IS NOT NULL
            OR (transcript IS NOT NULL AND btrim(transcript) <> '')
          )
        ORDER BY captured_at ASC`,
    );
    rows = loaded.rows;
  } catch (error) {
    logger.error("process-captures: load failed", error);
    return { ...result, errors: 1 };
  }

  for (const row of rows) {
    try {
      const outcome = await processOne(client, row, transcribe);
      result.processed += 1;
      if (outcome === "proposed") result.proposed += 1;
      else if (outcome === "low_confidence") result.lowConfidence += 1;
      else result.failed += 1;
    } catch (error) {
      result.errors += 1;
      logger.error("process-captures: row failed", error, { captureId: row.id });
    }
  }

  return result;
}
