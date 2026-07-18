"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CountdownTimer,
  GuessForm,
  GuessPips,
  HintCallout,
  MapReveal,
  ResultBanner,
} from "@/components";
import type { PublicPuzzleView, PublicSessionView } from "@/types";

const MAX_GUESSES = 5;

export default function Page() {
  const [view, setView] = useState<PublicPuzzleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [guessError, setGuessError] = useState<string | null>(null);

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
          "The judge is momentarily unavailable — your guess wasn't counted. Try it again.",
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
        setGuessError("Something went wrong — please try again.");
        return;
      }

      const session = (await res.json()) as PublicSessionView;
      setView((prev) => (prev ? { ...prev, session } : prev));
    } catch {
      setGuessError("Network hiccup — your guess wasn't counted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const session = view?.session;
  const finished = session ? session.status !== "in_progress" : false;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Map of the Day
          </h1>
          <p className="text-sm text-slate-400">
            Guess the place. Title and legend are hidden. 5 tries.
          </p>
        </div>
        {view && (
          <CountdownTimer
            nextRotationAt={view.nextRotationAt}
            onExpire={() => void fetchPuzzle()}
          />
        )}
      </header>

      {loading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400">
          Loading today&apos;s map&hellip;
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-5 text-red-200">
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

          <div className="flex items-center justify-between">
            <GuessPips
              guessHistory={session.guessHistory}
              maxGuesses={MAX_GUESSES}
            />
            {!finished && (
              <p className="text-sm text-slate-400">
                {session.guessesRemaining}{" "}
                {session.guessesRemaining === 1 ? "guess" : "guesses"} left
              </p>
            )}
          </div>

          {!finished && <HintCallout hints={session.hintsRevealed} />}

          <ResultBanner status={session.status} reveal={session.reveal} />

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

      <footer className="mt-auto pt-8 text-center text-xs text-slate-600">
        Maps sourced from Wikimedia Commons. Attribution appears after each
        round.
      </footer>
    </main>
  );
}
