"use client";

import { useState } from "react";
import Link from "next/link";
import type { PuzzleReveal } from "@/types";
import NicknamePrompt from "./NicknamePrompt";

export interface ResultBannerProps {
  status: "in_progress" | "won" | "lost";
  reveal?: PuzzleReveal;
  scoreAwarded?: { points: number; hasNickname: boolean };
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

export default function ResultBanner({
  status,
  reveal,
  scoreAwarded,
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
      className={
        "settle-in overflow-hidden rounded-panel bg-surface shadow-plate ring-1 " +
        (won ? "ring-positive/30" : "ring-negative/25")
      }
    >
      {/* The verdict gets its own band so the outcome is legible in one glance
          before any of the explanation. On paper the feedback ramps invert:
          dark ink on a light wash, not the 300-step tints the dark shell used
          (land-300 on white was 1.6:1). */}
      <div
        className={
          "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-4 sm:px-6 " +
          (won ? "bg-positive-wash" : "bg-negative-wash")
        }
      >
        <p
          className={
            "font-display text-2xl leading-none " +
            (won ? "text-positive" : "text-negative")
          }
        >
          {won ? "Correct" : "Out of guesses"}
        </p>
        {won && scoreAwarded && (
          <p className="font-mono text-sm font-medium tabular-nums text-positive/85">
            +{scoreAwarded.points}{" "}
            {scoreAwarded.points === 1 ? "point" : "points"}
          </p>
        )}
      </div>

      <div className="px-5 pb-6 pt-5 sm:px-6">
        {won && scoreAwarded && (
          <div className="mb-5">
            {hasNickname ? (
              <Link
                href="/leaderboard"
                className="text-sm font-medium text-accent underline decoration-ocean-600/40 underline-offset-4 transition-colors duration-150 hover:text-accent-hover hover:decoration-ocean-600"
              >
                View leaderboard &rarr;
              </Link>
            ) : (
              <NicknamePrompt
                points={scoreAwarded.points}
                onSaved={(name) => setSavedNickname(name)}
              />
            )}
          </div>
        )}

        {reveal && (
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
                The answer was
              </p>
              {/* The plate's title block, restored. */}
              <h2 className="mt-1.5 max-w-[24ch] font-display text-[28px] leading-[1.2] tracking-tight text-ink">
                {reveal.title}
              </h2>
              {reveal.aliases.length > 0 && (
                <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-subtle">
                  <span className="text-ink-muted">Also accepted:</span>{" "}
                  {reveal.aliases.join(", ")}
                </p>
              )}
            </div>

            {reveal.description && (
              <p className="max-w-[66ch] text-[15px] leading-relaxed text-ink-muted">
                {reveal.description}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-hairline pt-5">
              <button
                type="button"
                onClick={copyShareGrid}
                className="rounded-control bg-surface-raised px-4 py-2 text-sm font-medium text-ink-muted ring-1 ring-inset ring-sand-300 transition-colors duration-150 hover:bg-sand-100 hover:text-ink"
              >
                {copied ? "Copied" : "Copy result"}
              </button>
              <p className="text-xs leading-relaxed text-ink-subtle">
                Map by {reveal.attribution.author} &middot;{" "}
                {reveal.attribution.licenseUrl ? (
                  <a
                    href={reveal.attribution.licenseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-ocean-700/40 underline-offset-2 transition-colors duration-150 hover:text-ink-muted hover:decoration-ocean-700"
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
                  className="underline decoration-ocean-700/40 underline-offset-2 transition-colors duration-150 hover:text-ink-muted hover:decoration-ocean-700"
                >
                  {sourceLinkLabel(reveal.attribution.sourcePageUrl)}
                </a>
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
