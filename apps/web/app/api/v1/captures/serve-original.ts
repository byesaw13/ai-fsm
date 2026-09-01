import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import { captureFilePath } from "./files";

type OriginalKind = "audio" | "photo";

type CaptureOriginalRow = {
  audio_filename: string | null;
  audio_mime_type: string | null;
  audio_original_name: string | null;
  photo_filename: string | null;
  photo_mime_type: string | null;
  photo_original_name: string | null;
};

function captureIdFromPath(request: NextRequest, kind: OriginalKind): string | undefined {
  return request.nextUrl.pathname.match(new RegExp(`/captures/([^/]+)/${kind}`))?.[1];
}

function safeContentDisposition(name: string): string {
  const cleaned = name.replace(/[\r\n"]/g, "");
  return `inline; filename="${cleaned}"`;
}

export function serveCaptureOriginal(kind: OriginalKind) {
  return withRole(["owner", "admin"], async (request: NextRequest, session) => {
    const id = captureIdFromPath(request, kind);
    if (!id) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Capture not found", traceId: session.traceId } },
        { status: 404 },
      );
    }

    try {
      const row = await withDbSession(session, async (client) => {
        const { rows } = await client.query<CaptureOriginalRow>(
          `SELECT audio_filename, audio_mime_type, audio_original_name,
                  photo_filename, photo_mime_type, photo_original_name
           FROM capture_evidence
           WHERE id = $1 AND account_id = $2`,
          [id, session.accountId],
        );
        return rows[0] ?? null;
      });

      const filename = kind === "audio" ? row?.audio_filename : row?.photo_filename;
      const mimeType = kind === "audio" ? row?.audio_mime_type : row?.photo_mime_type;
      const originalName = kind === "audio" ? row?.audio_original_name : row?.photo_original_name;

      if (!filename) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: `${kind} original not found`, traceId: session.traceId } },
          { status: 404 },
        );
      }

      const filePath = captureFilePath(id, filename);
      if (!filePath || !fs.existsSync(filePath)) {
        return NextResponse.json(
          { error: { code: "NOT_FOUND", message: `${kind} file not found`, traceId: session.traceId } },
          { status: 404 },
        );
      }

      const buffer = fs.readFileSync(filePath);
      const fallbackMime = kind === "audio" ? "audio/webm" : "image/jpeg";
      return new NextResponse(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType || fallbackMime,
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": safeContentDisposition(originalName || filename),
        },
      });
    } catch (err) {
      logger.error(`[captures ${kind} GET]`, err, { traceId: session.traceId });
      return NextResponse.json(
        { error: { code: "INTERNAL_ERROR", message: `Failed to fetch ${kind}`, traceId: session.traceId } },
        { status: 500 },
      );
    }
  });
}
