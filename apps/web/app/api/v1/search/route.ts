import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/middleware";
import type { AuthSession } from "@/lib/auth/middleware";
import { queryForSession } from "@/lib/db";
import { PROPERTY_SEARCH_SQL, searchLikePattern, type PropertySearchHit } from "@/lib/search/property-search";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (request: NextRequest, session: AuthSession) => {
  const pattern = searchLikePattern(new URL(request.url).searchParams.get("q") ?? "");
  if (!pattern) return NextResponse.json({ data: [] });
  const rows = await queryForSession<PropertySearchHit & Record<string, string>>(
    session,
    PROPERTY_SEARCH_SQL,
    [session.accountId, pattern],
  );
  return NextResponse.json({ data: rows });
});
