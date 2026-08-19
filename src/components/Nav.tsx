"use client";

import Link from "next/link";
import { quietAction } from "./styles";

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
 * A masthead rather than a bar: the wordmark sits on the same rule that opens
 * the desk, and the links are set small and quiet at the far end. One line at
 * every width down to 320px, 44px of content height.
 */
export default function Nav({ onOpenInstructions, active = "game" }: NavProps) {
  return (
    <nav className="flex h-11 items-center justify-between gap-3">
      <Link
        href="/"
        className="font-display text-[19px] tracking-tight text-ink transition-colors duration-150 hover:text-ocean-700 sm:text-[21px]"
      >
        Map of the Day
      </Link>

      <div className="flex items-center gap-2">
        {active === "leaderboard" ? (
          <Link href="/" className={quietAction}>
            Back to game
          </Link>
        ) : (
          <Link href="/leaderboard" className={quietAction}>
            Leaderboard
          </Link>
        )}

        {onOpenInstructions && (
          <button
            type="button"
            onClick={onOpenInstructions}
            aria-label="How to play"
            title="How to play"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-sand-300 bg-surface/90 text-xs font-bold text-ink-muted transition-colors duration-150 hover:border-ocean-600 hover:bg-surface-raised hover:text-ink"
          >
            ?
          </button>
        )}
      </div>
    </nav>
  );
}
