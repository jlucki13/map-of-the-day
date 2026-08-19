import { NextResponse } from "next/server";
import { ensureFreshPuzzle } from "@/lib/ensureFreshPuzzle";
import { toPublicPuzzleView } from "@/lib/publicViews";
import { getOrCreateSessionId, loadSession, saveSession } from "@/lib/session";

// Image processing + the Anthropic SDK need the Node runtime, and this route
// can trigger a (background or cold-start) generation.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Cold-start generation runs the full agent pipeline synchronously.
export const maxDuration = 300;

/**
 * GET /api/puzzle — the only way the client learns about the current puzzle.
 * Never awaits a full generation unless literally no puzzle exists yet; a
 * stale puzzle is served immediately while regeneration happens after the
 * response (see ensureFreshPuzzle).
 *
 * Anti-leak: the response body is produced EXCLUSIVELY by toPublicPuzzleView.
 */
export async function GET() {
  try {
    const { puzzle } = await ensureFreshPuzzle("lazy");

    const sessionId = await getOrCreateSessionId();
    const { state, isNew } = await loadSession(puzzle.id, sessionId);
    if (isNew) {
      await saveSession(state);
    }

    return NextResponse.json(toPublicPuzzleView(puzzle, state));
  } catch (err) {
    console.error("GET /api/puzzle failed:", err);
    return NextResponse.json(
      { error: "puzzle_unavailable" },
      { status: 503 },
    );
  }
}
