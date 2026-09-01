/**
 * POST /api/v1/captures — store an immutable voice capture (optional photo).
 * Owner/admin only. Capture succeeds even if later processing will fail.
 */
import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { randomUUID } from "crypto";
import { z } from "zod";
import { withRole } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { captureDir, captureFilePath } from "./files";

export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 20_000;

function clientTranscript(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_TRANSCRIPT_CHARS);
}

const ALLOWED_AUDIO = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/aac",
  "audio/x-m4a",
  "video/webm",
  "video/mp4",
]);

const ALLOWED_PHOTO = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/aac": "aac",
  "audio/x-m4a": "m4a",
  "video/webm": "webm",
  "video/mp4": "m4a",
};

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
  "image/heif": "heif",
};

function baseMime(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

function asFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string") return null;
  return value;
}

function safeExtension(file: File, mimeMap: Record<string, string>, fallback: string): string {
  const fromName = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (fromName && fromName.length > 0 && fromName.length <= 5) return fromName;
  return mimeMap[baseMime(file.type)] ?? fallback;
}

function errorJson(session: AuthSession, status: number, code: string, message: string) {
  return NextResponse.json(
    { error: { code, message, traceId: session.traceId } },
    { status },
  );
}

export const POST = withRole(["owner", "admin"], async (request: NextRequest, session: AuthSession) => {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorJson(session, 422, "VALIDATION_ERROR", "Expected multipart form data");
  }

  const audio = asFile(formData.get("audio"));
  const photo = asFile(formData.get("photo"));

  if (!audio || audio.size === 0) {
    return errorJson(session, 422, "VALIDATION_ERROR", "audio is required");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return errorJson(session, 422, "VALIDATION_ERROR", "Audio exceeds 25 MB limit");
  }
  const audioMime = baseMime(audio.type);
  if (audioMime && !ALLOWED_AUDIO.has(audioMime)) {
    return errorJson(session, 422, "VALIDATION_ERROR", "Only audio files are allowed");
  }

  if (photo) {
    if (photo.size === 0) {
      return errorJson(session, 422, "VALIDATION_ERROR", "photo is empty");
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      return errorJson(session, 422, "VALIDATION_ERROR", "Photo exceeds 10 MB limit");
    }
    const photoMime = baseMime(photo.type);
    if (photoMime && !ALLOWED_PHOTO.has(photoMime)) {
      return errorJson(session, 422, "VALIDATION_ERROR", "Only image files are allowed for photo");
    }
  }

  const transcript = clientTranscript(formData.get("transcript"));
  const clientIdRaw = formData.get("client_id");
  const clientId =
    typeof clientIdRaw === "string" && z.string().uuid().safeParse(clientIdRaw).success
      ? clientIdRaw
      : randomUUID();

  const existing = await withDbSession(session, async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `SELECT id FROM capture_evidence WHERE id = $1 AND account_id = $2`,
      [clientId, session.accountId],
    );
    return rows[0] ?? null;
  });
  if (existing) {
    return NextResponse.json({ data: { id: existing.id } }, { status: 200 });
  }

  const captureId = clientId;
  const audioFilename = `audio-${randomUUID()}.${safeExtension(audio, AUDIO_EXT, "webm")}`;
  const photoFilename = photo
    ? `photo-${randomUUID()}.${safeExtension(photo, PHOTO_EXT, "jpg")}`
    : null;
  const audioPath = captureFilePath(captureId, audioFilename);
  const photoPath = photoFilename ? captureFilePath(captureId, photoFilename) : null;
  if (!audioPath || (photoFilename && !photoPath)) {
    return errorJson(session, 500, "INTERNAL_ERROR", "Failed to save file");
  }

  const uploadDir = captureDir(captureId);
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(audioPath, Buffer.from(await audio.arrayBuffer()));
    if (photo && photoPath) {
      fs.writeFileSync(photoPath, Buffer.from(await photo.arrayBuffer()));
    }
  } catch (err) {
    logger.error("[captures POST] file write failed", err, { traceId: session.traceId });
    return errorJson(session, 500, "INTERNAL_ERROR", "Failed to save file");
  }

  try {
    const row = await withDbSession(session, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO capture_evidence (
           id, account_id, created_by, source,
           audio_filename, audio_original_name, audio_mime_type, audio_size_bytes,
           photo_filename, photo_original_name, photo_mime_type, photo_size_bytes,
           processing_state, transcript
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id`,
        [
          captureId,
          session.accountId,
          session.userId,
          "recorder",
          audioFilename,
          audio.name,
          audio.type || "audio/webm",
          audio.size,
          photoFilename,
          photo?.name ?? null,
          photo?.type || (photo ? "image/jpeg" : null),
          photo?.size ?? null,
          "pending",
          transcript,
        ],
      );
      return rows[0];
    });

    return NextResponse.json({ data: { id: row.id } }, { status: 201 });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json({ data: { id: captureId } }, { status: 200 });
    }
    try { fs.unlinkSync(audioPath); } catch { /* ignore */ }
    if (photoPath) {
      try { fs.unlinkSync(photoPath); } catch { /* ignore */ }
    }
    logger.error("[captures POST] db insert failed", err, { traceId: session.traceId });
    return errorJson(session, 500, "INTERNAL_ERROR", "Failed to save capture record");
  }
});
