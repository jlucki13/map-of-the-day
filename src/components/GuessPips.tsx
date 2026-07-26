export interface GuessPipsProps {
  guessHistory: { outcome: "correct" | "incorrect" }[];
  maxGuesses: number;
}

/**
 * The ledger compressed to one line, for the finished round's summary where the
 * full GuessLedger would be repeating a story the player just lived through.
 *
 * The outcome is carried by a glyph as well as by colour, so the run still
 * reads without colour vision. Only the win is filled: five solid red blocks
 * made a near-miss look like a disaster.
 */
export default function GuessPips({ guessHistory, maxGuesses }: GuessPipsProps) {
  const pips = Array.from({ length: maxGuesses }, (_, i) => guessHistory[i]);

  return (
    <div
      role="list"
      aria-label="Guess history"
      className="flex items-center gap-1.5"
    >
      {pips.map((guess, i) => {
        const n = i + 1;

        if (!guess) {
          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Guess ${n}: not used`}
              className="h-3 w-3 rounded-full bg-sand-400/70 ring-1 ring-inset ring-sand-500/30"
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
              "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold leading-none " +
              (isCorrect
                ? "bg-good text-accent-ink"
                : "border border-bad-line bg-bad-fill text-bad")
            }
          >
            <span aria-hidden="true">{isCorrect ? "✓" : "✕"}</span>
          </span>
        );
      })}
    </div>
  );
}
