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

      <main className="relative z-10 mx-auto flex min-h-[100dvh] max-w-2xl flex-col gap-6 px-4 py-8">
        <Nav active="game" onOpenInstructions={() => setInstructionsOpen(true)} />

        <InstructionsModal open={instructionsOpen} onClose={closeInstructions} />

        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-ink">
              {finished ? "Today's map" : "What is this map measuring?"}
            </h1>
            {!finished && (
              <p className="mt-0.5 text-sm text-ink-subtle">
                The title is hidden. Five tries.
              </p>
            )}
          </div>
          {view && (
            <CountdownTimer
              nextRotationAt={view.nextRotationAt}
              onExpire={() => void fetchPuzzle()}
            />
          )}
        </header>

        {loading && (
          <div
            role="status"
            className="flex h-64 items-center justify-center rounded-panel border border-hairline bg-surface text-sm text-ink-subtle shadow-plate"
          >
            Unrolling today&apos;s map&hellip;
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-panel border border-clay-700/60 bg-clay-900 p-5 text-clay-300 shadow-plate">
            {loadError}
          </div>
        )}

        {!loading && view && session && (
          <>
            <MapReveal
              redactedImageUrl={view.redactedImageUrl}
              originalImageUrl={session.reveal?.originalImageUrl}
              revealed={finished}
            />

            <div className="flex items-center justify-between gap-4">
              <GuessPips
                guessHistory={session.guessHistory}
                maxGuesses={MAX_GUESSES}
              />
              {!finished && (
                <p className="text-sm text-ink-muted">
                  <span className="font-mono tabular-nums">
                    {session.guessesRemaining}
                  </span>{" "}
                  {session.guessesRemaining === 1 ? "guess" : "guesses"} left
                </p>
              )}
            </div>

            {!finished && <HintCallout hints={session.hintsRevealed} />}

            <ResultBanner
              status={session.status}
              reveal={session.reveal}
              scoreAwarded={session.scoreAwarded}
            />

            {!finished && (
              <GuessForm
                disabled={finished}
                submitting={submitting}
                error={guessError}
                onSubmit={(guess) => void submitGuess(guess)}
              />
            )}
          </>
        )}

        <footer className="mt-auto pt-10 text-center text-xs text-ink-subtle">
          Thematic data maps. Source and attribution appear after each round.
        </footer>
      </main>
    </>
  );
}
