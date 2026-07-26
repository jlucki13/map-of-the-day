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
    <figure className="relative m-0">
      {/* The plate is mounted on sand and lifted off the ocean: it is the one
          thing on the page that should hold the eye. */}
      <div className="overflow-hidden rounded-panel bg-surface p-2 shadow-lifted ring-1 ring-sand-300/70">
        <img
          src={displayUrl}
          alt={revealed ? alt : `${alt} (title and legend redacted)`}
          loading="eager"
          className="block h-auto w-full max-w-full select-none rounded-[8px]"
          draggable={false}
        />
      </div>

      {/* A plate caption, not a control row: it belongs to the plate's block
          and must not claim one of the page's rhythm intervals. */}
      {canToggle && (
        <figcaption className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-chip px-2 py-1 text-xs font-medium text-ink-subtle underline decoration-sand-400 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ocean-700"
          >
            {showOriginal ? "Show redacted version" : "Show original"}
          </button>
        </figcaption>
      )}
    </figure>
  );
}
