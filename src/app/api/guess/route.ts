import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentPipeline } from "@/agents";
import { MAX_GUESSES } from "@/lib/config";
import { getCurrentPuzzle } from "@/lib/ensureFreshPuzzle";
import { appendGuess } from "@/lib/gameState";
import { matchGuessLocally } from "@/lib/guessMatch";
import { toPublicSessionView } from "@/lib/publicViews";
import { getOrCreateSessionId, loadSession, saveSession } from "@/lib/session";
import type { GuessOutcome } from "@/types";

// NOTE: this interactive route must stay light — it must NOT import
// generatePuzzle/ocr/imageRedact (sharp + tesseract.js would bloat its bundle
// and cold start). Only the judge agent is reachable from here.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  puzzleId: z.string().min(1),
  guess: z.string().min(1).max(200),
});

/**
 * POST /api/guess — body { puzzleId, guess }.
 *
 * Guess-consumption asymmetry (deliberate, important): a judge FAILURE
 * (timeout/5xx/refusal => thrown error) returns 503 and does NOT consume a
 * guess — the client retries the same submission. A judge success returning
 * "incorrect" DOES consume a guess.
 *
 * Anti-leak: the response body is produced EXCLUSIVELY by toPublicSessionView.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const puzzle = await getCurrentPuzzle();
  if (!puzzle) {
    return NextResponse.json({ error: "no_active_puzzle" }, { status: 409 });
  }
  if (puzzle.id !== body.puzzleId) {
    // The puzzle rotated since the client loaded it — tell it to refetch.
    return NextResponse.json({ error: "stale_puzzle" }, { status: 409 });
  }

  const sessionId = await getOrCreateSessionId();
  const { state } = await loadSession(puzzle.id, sessionId);

  // Finished (or somehow over-full) sessions: no-op, return current view.
  if (state.status !== "in_progress" || state.guesses.length >= MAX_GUESSES) {
    return NextResponse.json(toPublicSessionView(puzzle, state));
  }

  const { title, aliases } = puzzle.candidate;

  // Cheap deterministic pass first; the LLM only sees genuinely ambiguous
  // guesses, keeping the interactive path fast.
  const local = matchGuessLocally(body.guess, title, aliases);

  let outcome: GuessOutcome;
  if (local === "ambiguous") {
    try {
      outcome = await getAgentPipeline().judge.judgeGuess({
        guess: body.guess,
        title,
        aliases,
        description: puzzle.candidate.description,
      });
    } catch (err) {
      console.error("POST /api/guess: judge failed (guess NOT consumed):", err);
      return NextResponse.json(
        { error: "judge_unavailable" },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }
  } else {
    outcome = local;
  }

  const nextState = appendGuess(state, body.guess, outcome);
  await saveSession(nextState);

  return NextResponse.json(toPublicSessionView(puzzle, nextState));
}
