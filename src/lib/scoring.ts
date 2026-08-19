/**
 * Fixed points-per-guess scoring. Server-authoritative: the winning guess
 * number is derived from server-held session state at the moment status
 * transitions to "won" inside POST /api/guess — never client-supplied. A loss
 * awards nothing (no call needed).
 */

const POINTS_BY_GUESS_NUMBER: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 10,
  2: 8,
  3: 5,
  4: 2,
  5: 1,
};

export function scoreForWin(guessNumber: 1 | 2 | 3 | 4 | 5): number {
  return POINTS_BY_GUESS_NUMBER[guessNumber];
}
