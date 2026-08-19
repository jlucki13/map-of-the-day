import { NextResponse } from "next/server";
import { getLeaderboardView } from "@/lib/leaderboard";
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
 *
 * Rows are one-per-nickname, not one-per-session: getLeaderboardView sums the
 * scores of every session id sharing a name. The list and the caller's `you`
 * row come from a single snapshot so the two always agree.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const sessionId = await getOrCreateSessionId();
  const view: PublicLeaderboardView = await getLeaderboardView(
    sessionId,
    limit,
  );
  return NextResponse.json(view);
}
