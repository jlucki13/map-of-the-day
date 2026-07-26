export interface GuessPipsProps {
  guessHistory: { outcome: "correct" | "incorrect" }[];
  maxGuesses: number;
  /** Hides the forward-looking stake once the round is over. */
  finished?: boolean;
}

/** Points awarded for winning on the nth guess (1-indexed), mirroring scoring. */
const POINTS_BY_GUESS = [10, 8, 5, 2, 1];

/**
 * The round's progress bar. One track of equal segments filled left to right,
 * so used and remaining tries are a single shape read at a glance rather than
 * a row of chips plus a separate "N guesses left" sentence saying the same
 * thing twice. Outcome is carried by a glyph as well as by colour.
 */
export default function GuessPips({
  guessHistory,
  maxGuesses,
  finished = false,
}: GuessPipsProps) {
  const pips = Array.from({ length: maxGuesses }, (_, i) => guessHistory[i]);
  const used = guessHistory.length;
  const next = used + 1;
  const stake = POINTS_BY_GUESS[used];

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="text-sm font-medium text-ink-muted">
          {finished ? (
            <>
              Used{" "}
              <span className="font-mono tabular-nums">{used}</span> of{" "}
              <span className="font-mono tabular-nums">{maxGuesses}</span>
            </>
          ) : (
            <>
              Guess{" "}
              <span className="font-mono tabular-nums">{next}</span> of{" "}
              <span className="font-mono tabular-nums">{maxGuesses}</span>
            </>
          )}
        </p>
        {!finished && stake !== undefined && (
          <p className="text-sm text-ink-subtle">
            worth{" "}
            <span className="font-mono font-medium tabular-nums text-ink-muted">
              {stake}
            </span>{" "}
            {stake === 1 ? "point" : "points"}
          </p>
        )}
      </div>

      <div
        role="list"
        aria-label="Guess history"
        className="flex h-7 gap-1.5"
      >
        {pips.map((guess, i) => {
          const n = i + 1;

          if (!guess) {
            const isNext = !finished && n === next;
            return (
              <span
                key={i}
                role="listitem"
                aria-label={`Guess ${n}: not used yet`}
                /* The next slot is marked by an outline, not a fill: a filled
                   grey cell reads as a disabled control sitting in the middle
                   of the progress track. */
                className={
                  "h-full flex-1 rounded-chip " +
                  (isNext
                    ? "ring-[1.5px] ring-inset ring-ocean-600"
                    : "bg-ocean-700/[0.07]")
                }
              />
            );
          }

          const isCorrect = guess.outcome === "correct";

          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Guess ${n}: ${isCorrect ? "correct" : "incorrect"}`}
              className={
                "flex h-full flex-1 items-center justify-center rounded-chip text-xs font-bold leading-none " +
                (isCorrect
                  ? "bg-positive text-sand-50"
                  : "bg-negative-wash text-negative ring-1 ring-inset ring-negative/25")
              }
            >
              <span aria-hidden="true">{isCorrect ? "✓" : "✕"}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
