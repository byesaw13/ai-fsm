/**
 * GET /api/v1/production-rates: every production rate with its modifiers and
 * calibration (TASK-193). Owner and admin only, like editing them.
 */
import { NextRequest, NextResponse } from "next/server";
import { withRole, type AuthSession } from "@/lib/auth/middleware";
import { withEstimateContext } from "@/lib/estimates/db";
import { listProductionRates } from "@/lib/db/production-rates";
import { loadPricingSettings } from "@/lib/pricing/settings";

export const dynamic = "force-dynamic";

export const GET = withRole(["owner", "admin"], async (_request: NextRequest, session: AuthSession) => {
  const data = await withEstimateContext(session, async (client) => ({
    rates: await listProductionRates(client),
    hours_per_day: (await loadPricingSettings(client, session.accountId)).hours_per_day,
  }));
  return NextResponse.json({ data });
});
