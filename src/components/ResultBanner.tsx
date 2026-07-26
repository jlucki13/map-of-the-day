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
        "settle-in rounded-panel border bg-surface p-5 shadow-plate " +
        (won ? "border-land-600/50" : "border-clay-700/60")
      }
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-lg font-semibold">
        <span className={won ? "text-positive" : "text-negative"}>
          {won ? "Correct." : "Out of guesses."}
        </span>
        {won && scoreAwarded && (
          <span className="font-mono text-base tabular-nums text-note">
            +{scoreAwarded.points}{" "}
            {scoreAwarded.points === 1 ? "point" : "points"}
          </span>
        )}
      </p>

      {won && scoreAwarded && (
        <div className="mt-3">
          {hasNickname ? (
            <Link
              href="/leaderboard"
              className="text-sm font-medium text-accent underline decoration-ocean-700 underline-offset-2 transition-colors duration-150 hover:text-accent-hover"
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
        <div className="mt-5 space-y-4 border-t border-hairline/70 pt-5">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-ink-subtle">
              The answer was
            </p>
            {/* The plate's title block, restored. */}
            <h2 className="mt-1 font-display text-2xl leading-snug text-ink">
              {reveal.title}
            </h2>
            {reveal.aliases.length > 0 && (
              <p className="mt-2.5 text-sm text-ink-subtle">
                Also accepted: {reveal.aliases.join(", ")}
              </p>
            )}
          </div>

          {reveal.description && (
            <p className="max-w-[68ch] text-sm leading-relaxed text-ink-muted">
              {reveal.description}
            </p>
          )}

          <p className="text-xs leading-relaxed text-ink-subtle">
            Map by {reveal.attribution.author} &middot;{" "}
            {reveal.attribution.licenseUrl ? (
              <a
                href={reveal.attribution.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-ocean-700 underline-offset-2 transition-colors duration-150 hover:text-ink-muted"
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
              className="underline decoration-ocean-700 underline-offset-2 transition-colors duration-150 hover:text-ink-muted"
            >
              {sourceLinkLabel(reveal.attribution.sourcePageUrl)}
            </a>
          </p>

          <div>
            <button
              type="button"
              onClick={copyShareGrid}
              className="rounded-control border border-hairline bg-surface-raised/80 px-4 py-2 text-sm font-medium text-ink-muted transition-colors duration-150 hover:border-ocean-700 hover:text-ink"
            >
              {copied ? "Copied" : "Copy result"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
