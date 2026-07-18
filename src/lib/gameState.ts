/**
 * Pure game-state machine for a single visitor's guessing session. No I/O —
 * fully deterministic and unit-testable. Persistence lives in session.ts.
 */

import { MAX_GUESSES } from "@/lib/config";
import type { GuessOutcome, GuessSessionState } from "@/types";

function clamp02(n: number): 0 | 1 | 2 {
  if (n <= 0) return 0;
  if (n >= 2) return 2;
  return 1;
}

export function newSessionState(
  puzzleId: string,
  sessionId: string,
  now: Date = new Date(),
): GuessSessionState {
  const nowIso = now.toISOString();
  return {
    puzzleId,
    sessionId,
    guesses: [],
    hintsRevealed: 0,
    status: "in_progress",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * The round ends immediately on any correct guess, so every guess made while
 * status === "in_progress" is by construction wrong. That means
 * hintsRevealed can be derived purely from the guess log:
 *   - while in_progress: every guess so far is a wrong guess.
 *   - once finished ("won"): the LAST guess is the correct one that ended
 *     the round, so only guesses.length - 1 of them were wrong.
 *   - once finished ("lost"): all guesses were wrong (the round only ends in
 *     "lost" when the MAX_GUESSES-th guess is also incorrect).
 * Hint 1 unlocks after the 3rd wrong guess, hint 2 after the 4th.
 */
export function deriveHintsRevealed(
  state: Pick<GuessSessionState, "guesses" | "status">,
): 0 | 1 | 2 {
  const wrongCount =
    state.status === "won" ? state.guesses.length - 1 : state.guesses.length;
  return clamp02(wrongCount - 2);
}

/**
 * Returns a NEW state (does not mutate the input). Throws if the round is
 * already finished or the guess cap has already been reached.
 */
export function appendGuess(
  state: GuessSessionState,
  guessText: string,
  outcome: GuessOutcome,
  now: Date = new Date(),
): GuessSessionState {
  if (state.status !== "in_progress") {
    throw new Error(
      `Cannot append guess: session ${state.sessionId} is already "${state.status}"`,
    );
  }
  if (state.guesses.length >= MAX_GUESSES) {
    throw new Error(
      `Cannot append guess: session ${state.sessionId} already has ${state.guesses.length} guesses (max ${MAX_GUESSES})`,
    );
  }

  const nowIso = now.toISOString();
  const guesses = [
    ...state.guesses,
    { text: guessText, outcome, guessedAt: nowIso },
  ];

  const status =
    outcome === "correct"
      ? "won"
      : guesses.length >= MAX_GUESSES
        ? "lost"
        : "in_progress";

  const hintsRevealed = deriveHintsRevealed({ guesses, status });

  return {
    ...state,
    guesses,
    status,
    hintsRevealed,
    updatedAt: nowIso,
  };
}
