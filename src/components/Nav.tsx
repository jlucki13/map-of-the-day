"use client";

import Link from "next/link";

export interface NavProps {
  /**
   * When provided, renders a "?" button that reopens the instructions. Omit on
   * pages (e.g. the leaderboard) that don't host the modal.
   */
  onOpenInstructions?: () => void;
  /** Which page is active, so the nav can swap the primary link. */
  active?: "game" | "leaderboard";
}

/**
 * Shared header nav used by both the game page and the leaderboard page, so the
 * title/link markup isn't duplicated.
 */
export default function Nav({ onOpenInstructions, active = "game" }: NavProps) {
  return (
    <nav className="flex items-center justify-between gap-3">
      <Link
        href="/"
        className="text-lg font-bold tracking-tight text-white hover:text-slate-200"
      >
        Map of the Day
      </Link>

      <div className="flex items-center gap-2">
        {active === "leaderboard" ? (
          <Link
            href="/"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            Back to game
          </Link>
        ) : (
          <Link
            href="/leaderboard"
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
          >
            Leaderboard
          </Link>
        )}

        {onOpenInstructions && (
          <button
            type="button"
            onClick={onOpenInstructions}
            aria-label="How to play"
            title="How to play"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-sm font-bold text-slate-200 transition-colors hover:bg-slate-800"
          >
            ?
          </button>
        )}
      </div>
    </nav>
  );
}
