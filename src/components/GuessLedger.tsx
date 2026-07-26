export interface GuessLedgerProps {
  /** Outcomes as recorded by the server. This is the source of truth. */
  guessHistory: { outcome: "correct" | "incorrect" }[];
  /**
   * What this browser typed, in order. Purely a local echo: the server never
   * sends guess text back, so this is only ever the player's own words, and it
   * is empty after a reload. Rows fall back to the outcome alone when a text is
   * missing, which is why the two arrays are zipped by index rather than
   * assumed to be the same length.
   */
  guessTexts?: string[];
  maxGuesses: number;
}

/**
 * The round as a ledger rather than five dots: numbered lines you fill in, so
 * a player can see what they have already tried without scrolling their own
 * memory. Empty lines are ruled but blank, which also stops the rail from
 * changing height as the round is played.
 */
export default function GuessLedger({
  guessHistory,
  guessTexts = [],
  maxGuesses,
}: GuessLedgerProps) {
  const rows = Array.from({ length: maxGuesses }, (_, i) => ({
    n: i + 1,
    outcome: guessHistory[i]?.outcome,
    text: guessTexts[i],
  }));

  return (
    <ol className="divide-y divide-hairline/70 border-y border-hairline/70">
      {rows.map(({ n, outcome, text }) => {
        const used = outcome !== undefined;
        const isCorrect = outcome === "correct";

        return (
          <li
            key={n}
            className="flex items-center gap-3 py-2"
            aria-label={
              used
                ? `Guess ${n}: ${isCorrect ? "correct" : "incorrect"}`
                : `Guess ${n}: not used yet`
            }
          >
            <span
              className={
                "w-3 shrink-0 font-mono text-xs tabular-nums " +
                (used ? "text-ink-subtle" : "text-sand-400")
              }
            >
              {n}
            </span>

            {used ? (
              <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">
                {text || (isCorrect ? "Your winning guess" : "A wrong guess")}
              </span>
            ) : (
              // A ruled but empty line. No placeholder glyph: the number and the
              // rule already say "this one is still yours to spend".
              <span aria-hidden="true" className="h-px flex-1 bg-sand-200" />
            )}

            {used && (
              <span
                aria-hidden="true"
                className={
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none " +
                  (isCorrect
                    ? "bg-good text-accent-ink"
                    : "border border-bad-line bg-bad-fill text-bad")
                }
              >
                {isCorrect ? "✓" : "✕"}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
