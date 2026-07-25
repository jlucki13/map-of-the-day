"use client";

import { useState } from "react";

export interface MapRevealProps {
  redactedImageUrl: string;
  originalImageUrl?: string;
  revealed: boolean;
  alt?: string;
}

export default function MapReveal({
  redactedImageUrl,
  originalImageUrl,
  revealed,
  alt = "Map of the day",
}: MapRevealProps) {
  const canToggle = revealed && Boolean(originalImageUrl);
  // When revealed, default to showing the original. Let the visitor toggle
  // back to the redacted version to compare, if they want.
  const [showOriginal, setShowOriginal] = useState(true);

  const displayUrl =
    canToggle && !showOriginal ? redactedImageUrl : canToggle ? originalImageUrl! : redactedImageUrl;

  return (
    // The plate is the one opaque object on the spread — square-cornered and
    // squarely mounted, the way a plate is tipped into a book.
    <figure className="relative m-0">
      <div className="overflow-hidden bg-surface p-2.5 shadow-lifted ring-1 ring-sand-300/70 sm:p-3">
        <img
          src={displayUrl}
          alt={revealed ? alt : `${alt} (title and legend redacted)`}
          loading="eager"
          className="block h-auto w-full max-w-full select-none"
          draggable={false}
        />
      </div>

      {/* A plate caption on a rule, not a floating chip. */}
      <figcaption className="mt-2 flex items-baseline justify-between gap-4 border-t border-hairline pt-2 text-[11px] uppercase tracking-[0.14em] text-ink-subtle">
        <span>{revealed ? "Plate, restored" : "Plate, title block covered"}</span>
        {canToggle && (
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="shrink-0 font-medium uppercase tracking-[0.14em] underline decoration-sand-400 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ocean-700"
          >
            {showOriginal ? "Show redacted" : "Show original"}
          </button>
        )}
      </figcaption>
    </figure>
  );
}
