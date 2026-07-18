"use client";

import { useState } from "react";
import type { PuzzleReveal } from "@/types";

export interface ResultBannerProps {
  status: "in_progress" | "won" | "lost";
  reveal?: PuzzleReveal;
}

export default function ResultBanner({ status, reveal }: ResultBannerProps) {
  const [copied, setCopied] = useState(false);

  if (status === "in_progress") return null;

  const won = status === "won";

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
        "rounded-xl border p-5 " +
        (won
          ? "border-emerald-700/50 bg-emerald-950/30"
          : "border-red-800/50 bg-red-950/20")
      }
    >
      <p
        className={
          "text-lg font-bold " + (won ? "text-emerald-300" : "text-red-300")
        }
      >
        {won ? "You got it!" : "Out of guesses."}
      </p>

      {reveal && (
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              The answer was
            </p>
            <h2 className="text-2xl font-bold text-white">{reveal.title}</h2>
            {reveal.aliases.length > 0 && (
              <p className="mt-1 text-sm text-slate-400">
                Also accepted: {reveal.aliases.join(", ")}
              </p>
            )}
          </div>

          {reveal.description && (
            <p className="text-sm leading-relaxed text-slate-300">
              {reveal.description}
            </p>
          )}

          <p className="text-xs text-slate-500">
            Map by {reveal.attribution.author} &middot;{" "}
            {reveal.attribution.licenseUrl ? (
              <a
                href={reveal.attribution.licenseUrl}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
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
              className="underline decoration-slate-600 underline-offset-2 hover:text-slate-300"
            >
              View on Wikimedia Commons
            </a>
          </p>

          <div>
            <button
              type="button"
              onClick={copyShareGrid}
              className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
            >
              {copied ? "Copied!" : "Copy result"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
