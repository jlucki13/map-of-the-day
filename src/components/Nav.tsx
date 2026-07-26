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
  "rounded-control px-2.5 py-1.5 text-[13px] font-medium uppercase tracking-[0.1em] text-ink-subtle transition-colors duration-150 hover:bg-sand-100 hover:text-ink";

export default function Nav({ onOpenInstructions, active = "game" }: NavProps) {
  return (
    // A broadsheet masthead: the title centred between two heavy rules, with
    // the utilities set small on either side. The old hover took the wordmark
    // to sand-200, which on parchment made it disappear.
    <nav className="border-y-2 border-ink/85 py-2">
      {/* Three-up on a wide masthead. On a phone the side labels cannot share a
          line with the title without wrapping to three lines each, so the
          title takes its own centred line and the utilities sit beneath it. */}
      <div className="flex flex-col items-center gap-1 sm:flex-row sm:justify-between sm:gap-3">
        <Link
          href="/"
          className="order-first shrink-0 font-display text-[15px] uppercase tracking-[0.2em] text-ink transition-colors duration-150 hover:text-accent sm:order-none sm:text-lg"
        >
          Map of the Day
        </Link>

        <div className="flex w-full items-center justify-between sm:contents">
          <div className="sm:order-first sm:flex-1">
            {active === "leaderboard" ? (
              <Link href="/" className={`${secondaryAction} -ml-2.5`}>
                Back to game
              </Link>
            ) : (
              <Link href="/leaderboard" className={`${secondaryAction} -ml-2.5`}>
                Leaderboard
              </Link>
            )}
          </div>

          <div className="flex sm:flex-1 sm:justify-end">
            {onOpenInstructions && (
              <button
                type="button"
                onClick={onOpenInstructions}
                title="How to play"
                className={`${secondaryAction} -mr-2.5 whitespace-nowrap`}
              >
                How to play
              </button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
