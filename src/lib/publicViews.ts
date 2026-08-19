import { MAX_GUESSES } from "@/lib/config";
import { etCalendarDateLabel } from "@/lib/rotationSchedule";
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
  // ET calendar date, not a raw UTC slice: generation happens right at/after
  // the 8 PM ET reveal, which is already past midnight UTC — a UTC slice
  // would misdate a puzzle generated between 8 PM ET and midnight ET as "the
  // next day."
  const day = etCalendarDateLabel(new Date(puzzle.createdAt));
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
  scoreAwarded?: { points: number; hasNickname: boolean },
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
  // Populated only on the response where a win was just recorded — this is the
  // single sanctioned place scoreAwarded reaches the client (never bolted on
  // by a route handler after the fact).
  if (scoreAwarded) {
    view.scoreAwarded = scoreAwarded;
  }
  return view;
}

export function toPublicPuzzleView(
  puzzle: Puzzle,
  session: GuessSessionState,
): PublicPuzzleView {
  return {
    puzzleId: puzzle.id,
    redactedImageUrl: puzzle.redactedImageUrl,
    nextRotationAt: puzzle.nextRotationAt,
    session: toPublicSessionView(puzzle, session),
  };
}
