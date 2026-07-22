"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="instructions-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          id="instructions-title"
          className="text-xl font-bold tracking-tight text-white"
        >
          How to play
        </h2>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-300">
          <p>
            Each round shows a real map with its title, legend, and other
            identifying text hidden. Your job: name the place it depicts.
          </p>
          <p>
            You get <span className="font-semibold text-white">5 guesses</span>.
            A hint unlocks after your 3rd wrong guess, and a second after your
            4th.
          </p>
          <div>
            <p className="font-semibold text-white">Scoring</p>
            <p className="mt-1">
              Win fewer guesses, earn more points:
            </p>
            <ul className="mt-2 space-y-1 text-slate-400">
              <li>1st guess &mdash; 10 points</li>
              <li>2nd guess &mdash; 8 points</li>
              <li>3rd guess &mdash; 5 points</li>
              <li>4th guess &mdash; 2 points</li>
              <li>5th guess &mdash; 1 point</li>
              <li>A loss earns 0.</li>
            </ul>
          </div>
          <p>
            Points add up across every map you play. Pick a nickname after your
            first win to appear on the{" "}
            <span className="font-semibold text-white">leaderboard</span>.
          </p>
        </div>

        <div className="mt-6">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-700"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
