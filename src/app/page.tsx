"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CountdownTimer,
  GlobeBackground,
  GuessForm,
  GuessLedger,
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
  // What the player typed, kept only on the client so the ledger can show the
  // round as a written record. The server view never returns guess text and
  // this does not ask it to; after a reload the rows fall back to numbers.
  const [guessTexts, setGuessTexts] = useState<string[]>([]);

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
        // Puzzle rotated underneath us — refetch the new one, and drop the
        // local ledger text so it can't be attached to a different round.
        setGuessTexts([]);
        await fetchPuzzle();
        setGuessError("A new map just dropped! Here it is.");
        return;
      }
      if (!res.ok) {
        setGuessError("Something went wrong. Please try again.");
        return;
      }

      const session = (await res.json()) as PublicSessionView;
      setGuessTexts((prev) => [...prev, guess]);
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

      {/* A spread, not a column: the plate runs wide on the left and the whole
          apparatus — question, ledger, hints, input — sits in a narrow ruled
          rail on the right, so a desktop player can study a large map without
          the controls ever scrolling away. */}
      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-6xl flex-col px-5 pb-8 pt-6 sm:px-8">
        <Nav active="game" onOpenInstructions={() => setInstructionsOpen(true)} />

        <InstructionsModal open={instructionsOpen} onClose={closeInstructions} />

        {/* The headline runs the full measure of the spread. */}
        <header className="mt-7 flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-hairline pb-5">
          <h1 className="max-w-[22ch] text-balance font-display text-[32px] leading-[1.08] tracking-tight text-ink sm:text-[44px]">
            {finished ? "Today's plate, restored" : "What is this map measuring?"}
          </h1>
          {view && (
            <CountdownTimer
              nextRotationAt={view.nextRotationAt}
              onExpire={() => void fetchPuzzle()}
            />
          )}
        </header>

        <div className="mt-7 flex-1">
          {loading && (
            <div
              role="status"
              className="flex h-[24rem] items-center justify-center bg-surface text-sm text-ink-subtle shadow-plate ring-1 ring-sand-300/70"
            >
              Unrolling today&apos;s map&hellip;
            </div>
          )}

          {!loading && loadError && (
            <div role="alert" className="border-t-2 border-negative pt-4">
              <p className="font-display text-xl text-negative">
                That map didn&apos;t arrive
              </p>
              <p className="mt-1.5 max-w-[52ch] text-[15px] leading-relaxed text-ink-muted">
                {loadError}
              </p>
            </div>
          )}

          {!loading && view && session && (
            <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <MapReveal
                redactedImageUrl={view.redactedImageUrl}
                originalImageUrl={session.reveal?.originalImageUrl}
                revealed={finished}
              />

              {/* The rail is unboxed: rules and type straight on the parchment,
                  so the globe reads through it. It sticks on wide screens
                  where the plate is taller than the fold. */}
              <aside className="lg:sticky lg:top-6 lg:self-start">
                {finished ? (
                  <ResultBanner
                    status={session.status}
                    reveal={session.reveal}
                    scoreAwarded={session.scoreAwarded}
                  />
                ) : (
                  <>
                    <GuessLedger
                      guessHistory={session.guessHistory}
                      guessTexts={guessTexts}
                      hints={session.hintsRevealed}
                      maxGuesses={MAX_GUESSES}
                    />

                    {/* Below the rail on desktop; pinned into the thumb zone on
                        a phone, where the plate is tall and the input would
                        otherwise sit a full screen below it. */}
                    <div className="sticky bottom-0 z-20 -mx-5 mt-6 border-t border-hairline bg-canvas/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm supports-[backdrop-filter]:bg-canvas/85 sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none lg:supports-[backdrop-filter]:bg-transparent">
                      <GuessForm
                        disabled={finished}
                        submitting={submitting}
                        error={guessError}
                        onSubmit={(guess) => void submitGuess(guess)}
                      />
                    </div>
                  </>
                )}
              </aside>

              {/* Once the round is over the rail runs long with the answer
                  while the plate column stops short. Auto-placement drops the
                  record into row two of the plate column, so the two columns
                  finish together — and on a phone it still falls after the
                  verdict, which is the moment worth reading first. */}
              {finished && (
                <div className="lg:max-w-md">
                  <GuessLedger
                    guessHistory={session.guessHistory}
                    guessTexts={guessTexts}
                    hints={session.hintsRevealed}
                    maxGuesses={MAX_GUESSES}
                    finished
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <footer className="mt-12 border-t border-hairline pt-4 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
          Thematic data maps &middot; source and attribution after each round
        </footer>
      </main>
    </>
  );
}
