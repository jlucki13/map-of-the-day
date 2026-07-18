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
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
        <img
          src={displayUrl}
          alt={revealed ? alt : `${alt} (title and legend redacted)`}
          loading="eager"
          className="block max-w-full w-full h-auto select-none"
          draggable={false}
        />
      </div>

      {canToggle && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
          >
            {showOriginal ? "Show redacted version" : "Show original"}
          </button>
        </div>
      )}
    </div>
  );
}
