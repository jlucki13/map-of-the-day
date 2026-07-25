export interface GuessPipsProps {
  guessHistory: { outcome: "correct" | "incorrect" }[];
  maxGuesses: number;
}

/**
 * Five slots, filled left to right. The outcome is carried by a glyph as well as
 * by colour, so the run still reads without colour vision.
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
              aria-label={`Guess ${n}: not used yet`}
              className="h-5 w-5 rounded-chip border border-ocean-700 bg-surface"
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
              "flex h-5 w-5 items-center justify-center rounded-chip text-[11px] font-bold leading-none text-ocean-950 " +
              (isCorrect ? "bg-land-400" : "bg-clay-400")
            }
          >
            <span aria-hidden="true">{isCorrect ? "✓" : "✕"}</span>
          </span>
        );
      })}
    </div>
  );
}
