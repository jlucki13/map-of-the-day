import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { ensureFreshPuzzle } from "@/lib/ensureFreshPuzzle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/cron/generate-puzzle — Vercel cron convenience trigger, guarded by
 * `Authorization: Bearer ${CRON_SECRET}` (Vercel attaches this automatically
 * when CRON_SECRET is set). The lazy path in GET /api/puzzle is the real
 * rotation mechanism; this just makes rotation proactive when cron fires.
 *
 * Responses deliberately expose only non-answer metadata (never the
 * candidate/hints — cron responses could be observed).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (config.cronSecret) {
    if (authHeader !== `Bearer ${config.cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (config.isVercel) {
    // Never allow an unauthenticated trigger in a deployed environment.
    return NextResponse.json(
      { error: "cron_secret_not_configured" },
      { status: 401 },
    );
  }
  // Local dev without CRON_SECRET: allowed, for manual testing.

  try {
    const result = await ensureFreshPuzzle("cron");
    return NextResponse.json({
      ok: true,
      puzzleId: result.puzzle.id,
      stale: result.stale,
      regenerationStarted: result.regenerationStarted,
      nextRotationAt: result.puzzle.nextRotationAt,
    });
  } catch (err) {
    console.error("GET /api/cron/generate-puzzle failed:", err);
    return NextResponse.json({ ok: false, error: "generation_failed" }, { status: 500 });
  }
}
