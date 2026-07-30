"use client";

import { useState } from "react";
import Link from "next/link";
import type { PuzzleReveal } from "@/types";
import GuessPips from "./GuessPips";
import NicknamePrompt from "./NicknamePrompt";
import { inlineLink, secondaryAction } from "./styles";

export interface ResultBannerProps {
  status: "in_progress" | "won" | "lost";
  reveal?: PuzzleReveal;
  scoreAwarded?: { points: number; hasNickname: boolean };
  guessHistory: { outcome: "correct" | "incorrect" }[];
  maxGuesses: number;
  /**
   * Fired once a nickname is saved, in addition to the banner's own local
   * state update — lets the page refresh anything that reads standings, since
   * the viewer's own row on the leaderboard may only now exist.
   */
  onNicknameSaved?: () => void;
}

/**
 * Label the attribution link from its host, since maps come from more than one
 * place: the curated set is self-generated (CC0, sourced to this repo) while
 * live puzzles come from Wikimedia Commons. Naming Wikimedia unconditionally
 * would misattribute our own renders.
 */
function sourceLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (host.endsWith("wikimedia.org") || host.endsWith("wikipedia.org")) {
      return "View on Wikimedia Commons";
    }
    return `View source on ${host}`;
  } catch {
    return "View source";
  }
}

/**
 * The round's colophon. Once the map is uncovered the rail has nothing left to
 * control, so the finished round drops the two-column instrument layout and
 * becomes a plate caption: the answer reading at full measure on the left, the
 * scoring and the share on a narrow column to its right.
 */
export default function ResultBanner({
  status,
  reveal,
  scoreAwarded,
  guessHistory,
  maxGuesses,
  onNicknameSaved,
}: ResultBannerProps) {
  const [copied, setCopied] = useState(false);
  // Locally track a name saved via the inline prompt so we can swap it out for
  // the leaderboard link without needing a fresh server response.
  const [savedNickname, setSavedNickname] = useState<string | null>(null);

  if (status === "in_progress") return null;

  const won = status === "won";
  const hasNickname = !!scoreAwarded?.hasNickname || savedNickname !== null;

  async function copyShareGrid() {
    if (!reveal?.shareGrid) return;
    try {
      await navigator.clipboard.writeText(reveal.shareGrid);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, insecure context) — ignore.
    }
  }

  return (
    <section
      aria-live="polite"
      className="settle-in grid gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_17rem]"
    >
      <div>
        <p
          className={
            "inline-flex items-baseline gap-2.5 rounded-chip border px-2.5 py-1 text-[13px] font-semibold " +
            (won
              ? "border-good-line bg-good-fill text-good"
              : "border-bad-line bg-bad-fill text-bad")
          }
        >
          <span>{won ? "Correct" : "Out of guesses"}</span>
          {won && scoreAwarded && (
            <span className="font-mono tabular-nums">
              +{scoreAwarded.points}
            </span>
          )}
        </p>

        {reveal && (
          <>
            <h2 className="mt-4 font-display text-[30px] leading-[1.15] tracking-tight text-ink sm:text-[38px]">
              {reveal.title}
            </h2>

            {reveal.description && (
              <p className="mt-4 max-w-[64ch] text-[15px] leading-relaxed text-ink-muted">
                {reveal.description}
              </p>
            )}

            {reveal.aliases.length > 0 && (
              <p className="mt-4 max-w-[64ch] text-sm leading-relaxed text-ink-subtle">
                Also accepted: {reveal.aliases.join(", ")}
              </p>
            )}

            <p className="mt-5 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-subtle">
              Map by {reveal.attribution.author} &middot;{" "}
              {reveal.attribution.licenseUrl ? (
                <a
                  href={reveal.attribution.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-sand-400 underline-offset-2 transition-colors duration-150 hover:text-ink-muted"
                >
                  {reveal.attribution.license}
                </a>
              ) : (
                reveal.attribution.license
              )}{" "}
              &middot;{" "}
              <a
                href={reveal.attribution.sourcePageUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-sand-400 underline-offset-2 transition-colors duration-150 hover:text-ink-muted"
              >
                {sourceLinkLabel(reveal.attribution.sourcePageUrl)}
              </a>
            </p>
          </>
        )}
      </div>

      {/* The scoring column keeps the rail's panel treatment, so the finished
          page still reads as an instrument standing beside the sheet, and so
          nothing here is set over the globe. */}
      <div className="h-fit space-y-6 rounded-panel border border-hairline bg-surface p-5 shadow-plate lg:p-6">
        <div>
          <p className="rail-marker">Your round</p>
          <div className="mt-3">
            <GuessPips guessHistory={guessHistory} maxGuesses={maxGuesses} />
          </div>
          <p className="mt-3 text-sm text-ink-muted">
            {won
              ? `Solved on guess ${guessHistory.length} of ${maxGuesses}.`
              : `All ${maxGuesses} guesses spent.`}
          </p>
        </div>

        {won && scoreAwarded && !hasNickname && (
          <div className="border-t border-hairline pt-5">
            <NicknamePrompt
              points={scoreAwarded.points}
              onSaved={(name) => {
                setSavedNickname(name);
                onNicknameSaved?.();
              }}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-hairline pt-5">
          <button
            type="button"
            onClick={copyShareGrid}
            className={secondaryAction}
          >
            {copied ? "Copied" : "Copy result"}
          </button>
          {hasNickname && (
            <Link href="/leaderboard" className={inlineLink}>
              View leaderboard
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
