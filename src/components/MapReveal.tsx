"use client";

import { useState } from "react";
import { quietAction } from "./styles";

export interface MapRevealProps {
  redactedImageUrl: string;
  originalImageUrl?: string;
  revealed: boolean;
  alt?: string;
}

/**
 * The sheet on the desk. It carries no chrome beyond a thin white mount and a
 * contact shadow, because on this layout the map is the largest object on the
 * screen and everything else is arranged around it.
 */
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

  const displayUrl = canToggle
    ? showOriginal
      ? originalImageUrl!
      : redactedImageUrl
    : redactedImageUrl;

  return (
    <figure className="relative">
      <div className="overflow-hidden rounded-panel bg-surface p-2 shadow-lifted ring-1 ring-sand-300/70 sm:p-2.5">
        <img
          src={displayUrl}
          alt={revealed ? alt : `${alt} (title and legend redacted)`}
          loading="eager"
          fetchPriority="high"
          className="block h-auto w-full max-w-full select-none rounded-[8px]"
          draggable={false}
        />
      </div>

      {canToggle && (
        <figcaption className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className={quietAction}
          >
            {showOriginal ? "Show it covered again" : "Show the real title"}
          </button>
        </figcaption>
      )}
    </figure>
  );
}
