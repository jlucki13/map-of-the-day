import { MAX_GUESSES } from "@/lib/config";
import type {
  GuessSessionState,
  Hint,
  PublicPuzzleView,
  PublicSessionView,
  Puzzle,
  PuzzleReveal,
} from "@/types";

/**
 * THE ONLY PATH TO CLIENT JSON.
 *
 * Route handlers must never call NextResponse.json(puzzle) or
 * NextResponse.json(session) directly — everything the client sees goes
 * through toPublicPuzzleView / toPublicSessionView. The anti-leak invariant:
 * title, aliases, description, attribution, originalImageUrl, redaction
 * geometry/sourceText, and guess text are withheld until the session is
 * finished (won or lost).
 */

export function buildShareGrid(
  puzzle: Puzzle,
  session: GuessSessionState,
): string {
  const day = puzzle.intervalStartAt.slice(0, 10);
  const score =
    session.status === "won"
      ? `${session.guesses.length}/${MAX_GUESSES}`
      : `X/${MAX_GUESSES}`;
  const pips = session.guesses
    .map((g) => (g.outcome === "correct" ? "\u{1F7E9}" : "\u{1F7E5}"))
    .join("");
  return `Map of the Day ${day} — ${score}\n${pips}`;
}

function buildReveal(puzzle: Puzzle, session: GuessSessionState): PuzzleReveal {
  return {
    title: puzzle.candidate.title,
    aliases: puzzle.candidate.aliases,
    description: puzzle.candidate.description,
    attribution: puzzle.candidate.attribution,
    originalImageUrl: puzzle.originalImageUrl,
    shareGrid: buildShareGrid(puzzle, session),
  };
}

export function toPublicSessionView(
  puzzle: Puzzle,
  session: GuessSessionState,
): PublicSessionView {
  const finished = session.status !== "in_progress";
  const hintsRevealed: Hint[] = puzzle.hints.slice(0, session.hintsRevealed);
  const view: PublicSessionView = {
    guessesUsed: session.guesses.length,
    guessesRemaining: Math.max(0, MAX_GUESSES - session.guesses.length),
    hintsRevealed,
    status: session.status,
    // outcome only — the raw guess text a visitor typed is not echoed back
    guessHistory: session.guesses.map((g) => ({ outcome: g.outcome })),
  };
  if (finished) {
    view.reveal = buildReveal(puzzle, session);
  }
  return view;
}

export function toPublicPuzzleView(
  puzzle: Puzzle,
  session: GuessSessionState,
): PublicPuzzleView {
  const nextRotationAt = new Date(
    new Date(puzzle.intervalStartAt).getTime() + puzzle.intervalSeconds * 1000,
  ).toISOString();
  return {
    puzzleId: puzzle.id,
    redactedImageUrl: puzzle.redactedImageUrl,
    intervalStartAt: puzzle.intervalStartAt,
    intervalSeconds: puzzle.intervalSeconds,
    nextRotationAt,
    session: toPublicSessionView(puzzle, session),
  };
}
