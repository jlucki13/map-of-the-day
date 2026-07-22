import { NextResponse } from "next/server";
import { getLeaderboard, getViewerStanding } from "@/lib/leaderboard";
import { getOrCreateSessionId } from "@/lib/session";
import type { PublicLeaderboardView } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * GET /api/leaderboard?limit=20 — top named players plus the caller's own
 * standing. Never exposes raw sid values; only nickname/rank/score cross the
 * boundary.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const sessionId = await getOrCreateSessionId();

  const [entries, you] = await Promise.all([
    getLeaderboard(limit),
    getViewerStanding(sessionId),
  ]);

  const view: PublicLeaderboardView = { entries, you };
  return NextResponse.json(view);
}
