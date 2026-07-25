"use client";

import { useEffect, useRef } from "react";

export interface InstructionsModalProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Presentational "how to play" modal. The parent owns open/close state and the
 * localStorage "seen" flag — this component just renders and reports dismissal
 * so the same modal can be shown on first visit and reopened via the "?"
 * button independently of that flag.
 */
export default function InstructionsModal({
  open,
  onClose,
}: InstructionsModalProps) {
  const dismissRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Move focus into the dialog and hand it back to whatever opened it, so the
    // "?" button stays a sane place to land for keyboard users.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dismissRef.current?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-ocean-950/80 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-panel border border-hairline bg-surface p-6 shadow-lifted"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="instructions-title"
          className="font-display text-2xl tracking-tight text-ink"
        >
          How to play
        </h2>

        <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-muted">
          <p>
            Each round shows a thematic data map, a choropleth that shades states
            or countries by some statistic, with its title hidden. Your job is to
            work out{" "}
            <span className="font-semibold text-ink">
              what the map is measuring
            </span>
            . The colour scale stays visible as a clue; the words that name the
            topic don&apos;t.
          </p>
          <p>
            You get <span className="font-semibold text-ink">5 guesses</span>. A
            hint unlocks after your 3rd wrong guess, and a second after your 4th.
          </p>
          <div>
            <p className="font-semibold text-ink">Scoring</p>
            <p className="mt-1">Win in fewer guesses, earn more points.</p>
            <ul className="mt-3 divide-y divide-hairline/60 border-y border-hairline/60 font-mono text-xs tabular-nums text-ink-subtle">
              {[
                ["1st guess", "10"],
                ["2nd guess", "8"],
                ["3rd guess", "5"],
                ["4th guess", "2"],
                ["5th guess", "1"],
                ["No win", "0"],
              ].map(([label, points]) => (
                <li key={label} className="flex justify-between py-1.5">
                  <span>{label}</span>
                  <span className="text-sand-300">{points}</span>
                </li>
              ))}
            </ul>
          </div>
          <p>
            Points add up across every map you play. Pick a nickname after your
            first win to appear on the{" "}
            <span className="font-semibold text-ink">leaderboard</span>.
          </p>
        </div>

        <div className="mt-6">
          <button
            ref={dismissRef}
            type="button"
            onClick={onClose}
            className="w-full rounded-control bg-accent px-4 py-2.5 text-sm font-semibold text-ocean-950 transition duration-150 hover:bg-accent-hover active:translate-y-px"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
