export interface GuessLedgerProps {
  guessHistory: { outcome: "correct" | "incorrect" }[];
  /**
   * What the player actually typed, in order, as recorded on the client this
   * session. The server view deliberately never returns guess text, so this is
   * best-effort: after a reload the rows fall back to their number alone.
   */
  guessTexts?: string[];
  hints: { order: 1 | 2; text: string }[];
  maxGuesses: number;
  finished?: boolean;
}

/** Points awarded for winning on the nth guess (1-indexed), mirroring scoring. */
const POINTS_BY_GUESS = [10, 8, 5, 2, 1];

/** A hint unlocks after the nth wrong guess, so it belongs under that row. */
const HINT_AFTER_GUESS: Record<1 | 2, number> = { 1: 3, 2: 4 };

/**
 * The round as a written record rather than a row of chips: five ruled lines
 * that fill in with what was actually tried, and hints set as marginalia
 * directly beneath the guess that earned them. Outcome is carried by the
 * glyph and by the rule weight as well as by colour.
 */
export default function GuessLedger({
  guessHistory,
  guessTexts = [],
  hints,
  maxGuesses,
  finished = false,
}: GuessLedgerProps) {
  const rows = Array.from({ length: maxGuesses }, (_, i) => guessHistory[i]);
  const used = guessHistory.length;
  const hintByRow = new Map<number, { order: 1 | 2; text: string }>();
  for (const hint of hints) hintByRow.set(HINT_AFTER_GUESS[hint.order], hint);

  return (
    <section aria-label="Your guesses">
      <h2 className="border-b border-ink/15 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Your guesses
      </h2>

      <ol className="mt-0">
        {rows.map((guess, i) => {
          const n = i + 1;
          const isNext = !finished && n === used + 1;
          const stake = POINTS_BY_GUESS[i];
          const text = guessTexts[i];
          const hint = hintByRow.get(n);

          return (
            <li key={n} className="border-b border-hairline">
              <div className="flex items-baseline gap-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={
                    "w-4 shrink-0 font-mono text-xs tabular-nums " +
                    (guess || isNext ? "text-ink-muted" : "text-ink-subtle/60")
                  }
                >
                  {n}
                </span>

                {guess ? (
                  <>
                    <span
                      className={
                        "min-w-0 flex-1 break-words text-[15px] " +
                        (guess.outcome === "correct"
                          ? "font-semibold text-ink"
                          : "text-ink-muted line-through decoration-negative/40")
                      }
                    >
                      {text ?? (
                        <span className="italic text-ink-subtle">
                          guess {n}
                        </span>
                      )}
                    </span>
                    <span
                      className={
                        "shrink-0 text-sm font-bold leading-none " +
                        (guess.outcome === "correct"
                          ? "text-positive"
                          : "text-negative")
                      }
                    >
                      <span className="sr-only">
                        {guess.outcome === "correct"
                          ? "correct"
                          : "incorrect"}
                      </span>
                      <span aria-hidden="true">
                        {guess.outcome === "correct" ? "✓" : "✕"}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <span
                      className={
                        "min-w-0 flex-1 text-[15px] " +
                        (isNext ? "text-ink-muted" : "text-ink-subtle/60")
                      }
                    >
                      {isNext ? "Up next" : "—"}
                    </span>
                    {!finished && stake !== undefined && (
                      <span
                        className={
                          "shrink-0 font-mono text-xs tabular-nums " +
                          (isNext ? "text-ink-muted" : "text-ink-subtle/60")
                        }
                      >
                        {stake} pt{stake === 1 ? "" : "s"}
                      </span>
                    )}
                  </>
                )}
              </div>

              {hint && (
                <div className="settle-in -mt-0.5 pb-3 pl-7">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-note">
                    Hint {hint.order}
                  </p>
                  <p className="mt-1 font-display text-[15px] italic leading-relaxed text-ink-muted">
                    {hint.text}
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
