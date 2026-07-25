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
  "rounded-control px-3 py-1.5 text-sm font-medium text-ink-subtle transition-colors duration-150 hover:bg-sand-100 hover:text-ink";

export default function Nav({ onOpenInstructions, active = "game" }: NavProps) {
  return (
    // The masthead is a standing label, not a headline: the page's own question
    // has to be the largest thing on it. Small caps-weight display type, ruled
    // off, with the utilities kept as quiet text buttons rather than boxed
    // chips competing with the primary control below.
    <nav className="flex items-center justify-between gap-3 border-b border-hairline pb-3">
      <Link
        href="/"
        className="font-display text-[15px] uppercase tracking-[0.16em] text-ink-muted transition-colors duration-150 hover:text-ink"
      >
        Map of the Day
      </Link>

      <div className="-mr-2 flex items-center gap-1">
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
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-ink-subtle transition-colors duration-150 hover:bg-sand-100 hover:text-ink"
          >
            ?
          </button>
        )}
      </div>
    </nav>
  );
}
