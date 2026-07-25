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
    <div className="relative">
      {/* The plate is mounted on sand and lifted off the ocean: it is the one
          thing on the page that should hold the eye. */}
      <div className="overflow-hidden rounded-panel bg-surface p-1.5 shadow-lifted ring-1 ring-sand-300/60">
        <img
          src={displayUrl}
          alt={revealed ? alt : `${alt} (title and legend redacted)`}
          loading="eager"
          className="block h-auto w-full max-w-full select-none rounded-[10px]"
          draggable={false}
        />
      </div>

      {canToggle && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-chip border border-hairline bg-surface/80 px-3 py-1 text-xs font-medium text-ink-muted transition-colors duration-150 hover:border-ocean-700 hover:bg-surface-raised hover:text-ink"
          >
            {showOriginal ? "Show redacted version" : "Show original"}
          </button>
        </div>
      )}
    </div>
  );
}
