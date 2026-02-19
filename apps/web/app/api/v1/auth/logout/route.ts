import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { randomUUID } from "crypto";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const traceId = randomUUID();

  try {
    await clearSessionCookie();

    return NextResponse.json({ message: "ok" });
  } catch (error) {
    logger.error("Logout error", error, { traceId });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
          traceId,
        },
      },
      { status: 500 }
    );
  }
}
