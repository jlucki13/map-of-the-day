export interface GuessPipsProps {
  guessHistory: { outcome: "correct" | "incorrect" }[];
  maxGuesses: number;
}

export default function GuessPips({ guessHistory, maxGuesses }: GuessPipsProps) {
  const pips = Array.from({ length: maxGuesses }, (_, i) => guessHistory[i]);

  return (
    <div role="list" aria-label="Guess history" className="flex items-center gap-2">
      {pips.map((guess, i) => {
        const n = i + 1;

        if (!guess) {
          return (
            <span
              key={i}
              role="listitem"
              aria-label={`Guess ${n}: not used yet`}
              className="h-4 w-4 rounded-sm border-2 border-slate-700"
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
              "h-4 w-4 rounded-sm " +
              (isCorrect ? "bg-emerald-500" : "bg-red-500")
            }
          />
        );
      })}
    </div>
  );
}
