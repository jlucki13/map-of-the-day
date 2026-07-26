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
const secondaryAction =
  "rounded-control border border-hairline bg-surface/80 px-3 py-1.5 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-ocean-700 hover:bg-surface-raised hover:text-ink";

export default function Nav({ onOpenInstructions, active = "game" }: NavProps) {
  return (
    <nav className="flex items-center justify-between gap-3 border-b border-hairline/70 pb-4">
      <Link
        href="/"
        className="font-display text-xl tracking-tight text-ink transition-colors duration-150 hover:text-sand-200"
      >
        Map of the Day
      </Link>

      <div className="flex items-center gap-2">
        {active === "leaderboard" ? (
          <Link href="/" className={secondaryAction}>
            Back to game
          </Link>
        ) : (
          <Link href="/leaderboard" className={secondaryAction}>
            Leaderboard
          </Link>
        )}

        {onOpenInstructions && (
          <button
            type="button"
            onClick={onOpenInstructions}
            aria-label="How to play"
            title="How to play"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-hairline bg-surface/80 text-sm font-semibold text-ink-muted transition-colors duration-150 hover:border-ocean-700 hover:bg-surface-raised hover:text-ink"
          >
            ?
          </button>
        )}
      </div>
    </nav>
  );
}
