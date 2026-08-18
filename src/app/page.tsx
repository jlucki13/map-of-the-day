"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CountdownTimer,
  GlobeBackground,
  GuessForm,
  GuessLedger,
  HintCallout,
  InstructionsModal,
  LeaderboardRail,
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
  /**
   * A local echo of what this browser typed, so the ledger can show the round
   * back to the player. The server never returns guess text, and nothing here
   * is ever sent anywhere: it is the player's own words, held for the length of
   * the page view and lost on reload (the ledger degrades to outcomes only).
   */
  const [myGuesses, setMyGuesses] = useState<string[]>([]);
  /**
   * Bumped whenever standings might have changed, so LeaderboardRail refetches
   * instead of sitting on whatever it loaded at mount. A round finishing may
   * have just posted a score; claiming a nickname may have just made the
   * viewer's own row visible for the first time.
   */
  const [boardRefreshKey, setBoardRefreshKey] = useState(0);
  const bumpBoard = useCallback(() => setBoardRefreshKey((k) => k + 1), []);

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
      setLoadError("Couldn't load today's map. Refresh the page to try again.");
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
      if (res.status === 429) {
        // Rate-limited — the guess was NOT consumed, but unlike 503 this
        // isn't an invitation to immediately retry.
        setGuessError("Slow down a little — take a short break and try again.");
        return;
      }
      if (res.status === 409) {
        // Puzzle rotated underneath us — refetch the new one.
        await fetchPuzzle();
        setMyGuesses([]);
        setGuessError("A new map just dropped! Here it is.");
        return;
      }
      if (!res.ok) {
        setGuessError("Something went wrong. Please try again.");
        return;
      }

      const session = (await res.json()) as PublicSessionView;
      // Only record the text once the server has confirmed the guess was
      // counted, so the ledger can never run ahead of the real history.
      setMyGuesses((prev) => [...prev, guess]);
      setView((prev) => (prev ? { ...prev, session } : prev));
    } catch {
      setGuessError("Network hiccup: your guess wasn't counted. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const session = view?.session;
  const finished = session ? session.status !== "in_progress" : false;
  const remaining = session?.guessesRemaining ?? MAX_GUESSES;

  // A win or loss may have just posted a score, so refresh the board exactly
  // once per finish rather than on every render finished stays true.
  const wasFinishedRef = useRef(false);
  useEffect(() => {
    if (finished && !wasFinishedRef.current) {
      bumpBoard();
    }
    wasFinishedRef.current = finished;
  }, [finished, bumpBoard]);

  return (
    <>
      <GlobeBackground />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[76rem] flex-col px-4 pb-12 pt-5 sm:px-8 2xl:max-w-[88rem]">
        <Nav
          active="game"
          onOpenInstructions={() => setInstructionsOpen(true)}
        />

        <InstructionsModal
          open={instructionsOpen}
          onClose={closeInstructions}
        />

        <div className="mt-4 border-t border-hairline pt-7 sm:pt-8">
          {loading && (
            <div className="game-grid">
              <div
                role="status"
                aria-label="Loading today's map"
                className="area-map skeleton aspect-[4/3] w-full rounded-panel ring-1 ring-sand-300/70"
              />
              <div className="area-rail hidden space-y-4 lg:block">
                <div className="skeleton h-6 w-3/4 rounded-chip" />
                <div className="skeleton h-[52px] w-full rounded-control" />
                <div className="skeleton h-[46px] w-full rounded-control" />
                <div className="skeleton h-40 w-full rounded-control" />
              </div>
              {/* Independent of the puzzle fetch, so it can start loading (and
                  show its own skeleton) right away rather than waiting on it. */}
              <LeaderboardRail className="area-board" />
            </div>
          )}

          {!loading && loadError && (
            <div className="rounded-panel border border-bad-line bg-bad-fill p-6 text-sm font-medium text-bad">
              {loadError}
            </div>
          )}

          {/* Playing: the map takes the desk and every control the round needs
              sits in one rail beside it, so nothing about the round is below
              the fold on a laptop. */}
          {!loading && view && session && !finished && (
            <div className="game-grid">
              <div className="area-map">
                <MapReveal
                  redactedImageUrl={view.redactedImageUrl}
                  originalImageUrl={session.reveal?.originalImageUrl}
                  revealed={false}
                />
              </div>

              {/* An instrument panel standing on the desk. Opaque on purpose:
                  the globe is deliberately strong on this layout, and the one
                  thing a player must be able to read cannot be set over
                  drifting land. */}
              <div className="area-rail rounded-panel border border-hairline bg-surface p-5 shadow-plate lg:sticky lg:top-6 lg:p-6">
                <h1 className="text-lg font-semibold leading-snug tracking-tight text-ink">
                  What is this map measuring?
                </h1>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-subtle">
                  The title band is covered. The colour scale is not.
                </p>

                <div className="mt-6">
                  <GuessForm
                    disabled={finished}
                    submitting={submitting}
                    error={guessError}
                    onSubmit={(guess) => void submitGuess(guess)}
                  />
                </div>

                <div className="mt-7">
                  <p className="rail-marker">
                    <span>
                      {remaining} of {MAX_GUESSES} left
                    </span>
                  </p>
                  <div className="mt-3">
                    <GuessLedger
                      guessHistory={session.guessHistory}
                      guessTexts={myGuesses}
                      maxGuesses={MAX_GUESSES}
                    />
                  </div>
                </div>

                {session.hintsRevealed.length > 0 && (
                  // No section marker here: each slip already names itself, and
                  // a "Hints" label above "Hint 1" is a label on a label.
                  <div className="mt-6">
                    <HintCallout hints={session.hintsRevealed} />
                  </div>
                )}

                <div className="mt-7 border-t border-hairline pt-5">
                  <CountdownTimer
                    nextRotationAt={view.nextRotationAt}
                    onExpire={() => void fetchPuzzle()}
                  />
                </div>
              </div>

              <LeaderboardRail
                className="area-board"
                refreshSignal={boardRefreshKey}
              />
            </div>
          )}

          {/* Finished: the rail has nothing left to control, so it goes, the
              map is uncovered at full width and the round gets a caption. A
              third column here would fight the caption for the reader's eye,
              so the board isn't promoted to one — it rides in the caption's
              own narrow column, under the scoring card, where the page has
              room going spare. */}
          {!loading && view && session && finished && (
            <div className="space-y-9">
              <div className="mx-auto w-full max-w-4xl">
                <MapReveal
                  redactedImageUrl={view.redactedImageUrl}
                  originalImageUrl={session.reveal?.originalImageUrl}
                  revealed
                />
              </div>

              <ResultBanner
                status={session.status}
                reveal={session.reveal}
                scoreAwarded={session.scoreAwarded}
                guessHistory={session.guessHistory}
                maxGuesses={MAX_GUESSES}
                onNicknameSaved={bumpBoard}
                aside={<LeaderboardRail refreshSignal={boardRefreshKey} />}
              />
            </div>
          )}
        </div>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-x-8 gap-y-2 pt-14 text-xs text-ink-subtle">
          <p>
            Thematic data maps. Source and attribution appear after each round.
          </p>
        </footer>
      </main>
    </>
  );
}
