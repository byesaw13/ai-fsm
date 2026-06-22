import { NextResponse } from "next/server";
import { withRole } from "@/lib/auth/middleware";
import { withDbSession } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  loadSquareSettings,
  testSquareConnection,
} from "@/lib/integrations/square";

export const dynamic = "force-dynamic";

// === POST /api/v1/integrations/square/test — verify Square connection (owner) ===
// Lists Square locations with the stored token and persists connected/error
// status. Returns the result so the settings UI can show it immediately.

export const POST = withRole(["owner"], async (_request, session) => {
  try {
    const result = await withDbSession(session, async (client) => {
      const row = await loadSquareSettings(client, session.accountId);
      if (!row) {
        return { ok: false, detail: "Square is not configured yet" };
      }

      const test = await testSquareConnection(row);

      await client.query(
        `UPDATE integration_settings
         SET status = $2, status_detail = $3, last_checked_at = now()
         WHERE account_id = $1 AND provider = 'square'`,
        [session.accountId, test.ok ? "connected" : "error", test.detail]
      );

      return test;
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    logger.error("POST /api/v1/integrations/square/test error", error, {
      traceId: session.traceId,
    });
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to test Square connection",
          traceId: session.traceId,
        },
      },
      { status: 500 }
    );
  }
});
