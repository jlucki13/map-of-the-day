"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CountdownTimer,
  GlobeBackground,
  GuessForm,
  GuessPips,
  HintCallout,
  InstructionsModal,
  MapReveal,
  Nav,
  ResultBanner,
} from "@/components";
import type { PublicPuzzleView, PublicSessionView } from "@/types";

const MAX_GUESSES = 5;
// Bump the suffix to force the instructions popup to re-show after a rules
// change.
const INSTRUCTIONS_SEEN_KEY = "motd:instructions-seen:v1";

export default function Page() {
  const [view, setView] = useState<PublicPuzzleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);

  // First-visit popup: show once ever, gated by localStorage. The "?" button
  // reopens it regardless of this flag.
  useEffect(() => {
    try {
      if (!localStorage.getItem(INSTRUCTIONS_SEEN_KEY)) {
        setInstructionsOpen(true);
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — just skip the popup.
    }
  }, []);

  const closeInstructions = useCallback(() => {
    setInstructionsOpen(false);
    try {
      localStorage.setItem(INSTRUCTIONS_SEEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  const fetchPuzzle = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/puzzle", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`puzzle fetch failed (${res.status})`);
      }
      const data = (await res.json()) as PublicPuzzleView;
      setView(data);
      setGuessError(null);
    } catch {
      setLoadError(
        "Couldn't load today's map. Refresh the page to try again.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPuzzle();
  }, [fetchPuzzle]);

  async function submitGuess(guess: string) {
    if (!view || submitting) return;
    setSubmitting(true);
    setGuessError(null);
    try {
      const res = await fetch("/api/guess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ puzzleId: view.puzzleId, guess }),
      });

      if (res.status === 503) {
        // Judge unavailable — the guess was NOT consumed; invite a retry.
        setGuessError(
          "The judge is momentarily unavailable, so your guess wasn't counted. Try it again.",
        );
        return;
      }
      if (res.status === 409) {
        // Puzzle rotated underneath us — refetch the new one.
        await fetchPuzzle();
        setGuessError("A new map just dropped! Here it is.");
        return;
      }
      if (!res.ok) {
        setGuessError("Something went wrong. Please try again.");
        return;
      }

      const session = (await res.json()) as PublicSessionView;
      setView((prev) => (prev ? { ...prev, session } : prev));
    } catch {
      setGuessError("Network hiccup: your guess wasn't counted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const session = view?.session;
  const finished = session ? session.status !== "in_progress" : false;

  return (
    <>
      <GlobeBackground />

      {/* Spacing rhythm, rather than one repeated gap: the masthead sits tight
          to the question, the plate is given generous air on both sides
          because it is the subject, and the deck below it is a single close
          group. Uniform spacing was making every band read as equally
          important. */}
      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-3xl flex-col px-5 pb-10 pt-7 sm:px-6">
        <Nav active="game" onOpenInstructions={() => setInstructionsOpen(true)} />

        <InstructionsModal open={instructionsOpen} onClose={closeInstructions} />

        <header className="mt-6 sm:mt-7">
          <h1 className="max-w-[16ch] text-balance font-display text-[26px] leading-[1.15] tracking-tight text-ink sm:max-w-none sm:text-[34px]">
            {finished ? "Today's map" : "What is this map measuring?"}
          </h1>
          <p className="mt-1.5 max-w-[46ch] text-sm text-ink-subtle sm:mt-2 sm:text-[15px]">
            {finished
              ? "The title block is back. A new plate lands tomorrow."
              : "The title block is covered. Five tries to name the topic."}
          </p>
        </header>

        <div className="mb-14 mt-6 sm:mt-8">
          {loading && (
            <div
              role="status"
              className="flex h-[22rem] items-center justify-center rounded-panel bg-surface text-sm text-ink-subtle shadow-plate ring-1 ring-sand-300/70"
            >
              Unrolling today&apos;s map&hellip;
            </div>
          )}

          {!loading && loadError && (
            <div
              role="alert"
              className="rounded-panel bg-negative-wash p-6 shadow-plate ring-1 ring-negative/25"
            >
              <p className="font-display text-lg text-negative">
                That map didn&apos;t arrive
              </p>
              <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
                {loadError}
              </p>
            </div>
          )}

          {!loading && view && session && (
            <>
              <MapReveal
                redactedImageUrl={view.redactedImageUrl}
                originalImageUrl={session.reveal?.originalImageUrl}
                revealed={finished}
              />

              {/* Finished: the answer follows the plate immediately, because
                  that pairing is the whole payoff. The round's record moves
                  below it, where it is a souvenir rather than an input. */}
              {finished ? (
                <div className="mt-7 space-y-5">
                  <ResultBanner
                    status={session.status}
                    reveal={session.reveal}
                    scoreAwarded={session.scoreAwarded}
                  />

                  <section className="rounded-panel bg-surface/70 p-5 ring-1 ring-sand-300/60">
                    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                      Your round
                    </h2>
                    <div className="mt-3">
                      <GuessPips
                        guessHistory={session.guessHistory}
                        maxGuesses={MAX_GUESSES}
                        finished
                      />
                    </div>
                    {session.hintsRevealed.length > 0 && (
                      <div className="mt-5 border-t border-hairline pt-4">
                        <HintCallout hints={session.hintsRevealed} bare />
                      </div>
                    )}
                  </section>
                </div>
              ) : (
                /* The deck: progress, any hints, and the input are one
                   instrument, so they share one container and tight internal
                   spacing instead of floating as three separate bands. */
                <section className="mt-7 rounded-panel bg-surface-raised p-5 shadow-plate ring-1 ring-sand-300/70 sm:p-6">
                  <GuessPips
                    guessHistory={session.guessHistory}
                    maxGuesses={MAX_GUESSES}
                  />

                  {session.hintsRevealed.length > 0 && (
                    <div className="mt-5">
                      <HintCallout hints={session.hintsRevealed} />
                    </div>
                  )}

                  <div className="mt-5">
                    <GuessForm
                      disabled={finished}
                      submitting={submitting}
                      error={guessError}
                      onSubmit={(guess) => void submitGuess(guess)}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-hairline pt-5 text-xs text-ink-subtle">
          <p>Source and attribution appear after each round.</p>
          {view && (
            <CountdownTimer
              nextRotationAt={view.nextRotationAt}
              onExpire={() => void fetchPuzzle()}
            />
          )}
        </footer>
      </main>
    </>
  );
}
